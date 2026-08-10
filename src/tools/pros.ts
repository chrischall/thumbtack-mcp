/**
 * Read-only tools over Thumbtack's anonymous consumer surface.
 *
 * Every tool here is a no-auth read. There are no write tools: Thumbtack's
 * write paths (contacting a pro, booking) sit behind the reCAPTCHA-gated
 * login, which no server-side client can pass.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpToolError, textResult, toolAnnotations } from '@chrischall/mcp-utils';
import { type ThumbtackClient, WWW, slugify } from '../client.js';
import { extractApolloState, extractNextData, localBusiness, servicePageOf } from '../parse.js';
import { compactPro, credentialsOf, proListOf, reviewsOf, summaryOf } from '../normalize.js';

const UsZip = z
  .string()
  .regex(/^\d{5}(-\d{4})?$/, 'must be a 5-digit US ZIP code (Thumbtack is US-only)');

/** The canonical slug Thumbtack redirected us to, read out of the final URL. */
function canonicalSlugOf(finalUrl: string): string | null {
  return finalUrl.match(/\/k\/([^/?#]+)\//)?.[1] ?? null;
}

/** Profile URLs must be on thumbtack.com — never fetch an arbitrary host on request. */
function assertProfileUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new McpToolError(`Not a valid URL: ${url}`, { hint: 'Pass a full https://www.thumbtack.com/... profile URL.' });
  }
  if (parsed.protocol !== 'https:' || !/(^|\.)thumbtack\.com$/.test(parsed.hostname)) {
    throw new McpToolError(`Refusing to fetch ${parsed.hostname} — only https://www.thumbtack.com URLs are allowed.`, {
      hint: 'Use the `url` returned by thumbtack_search_pros.',
    });
  }
}

export function registerProTools(server: McpServer, client: ThumbtackClient): void {
  server.registerTool(
    'thumbtack_search_pros',
    {
      description:
        'Search Thumbtack for local service pros by trade and US ZIP code. Returns up to 10 ranked pros with rating, review count, lifetime hires, mean response time and profile URL. Anonymous — no account needed.',
      annotations: toolAnnotations({ title: 'Search pros' }),
      inputSchema: {
        service: z.string().min(1).describe('Trade or service, e.g. "house cleaning", "plumbing", "electrician". Loose names are canonicalised by Thumbtack.'),
        zip: UsZip.describe('5-digit US ZIP code to search near.'),
        compact: z
          .boolean()
          .default(true)
          .describe('Return slim summaries (default). Set false for the full upstream records, which are large and mostly tracking metadata.'),
        limit: z.number().int().min(1).max(10).optional().describe('Cap the number of pros returned (upstream page size is 10).'),
      },
    },
    async ({ service, zip, compact, limit }) => {
      const page = await client.searchPage(service, zip);
      const results = proListOf(extractNextData(page.html));
      const canonicalService = canonicalSlugOf(page.finalUrl);

      // Undocumented endpoint: if the envelope drifted, hand back the raw
      // payload with a warning rather than a confidently-empty list.
      if (results === null) {
        process.stderr.write('[thumbtack-mcp] proListResults not found — returning raw payload\n');
        return textResult({
          warning: 'Unexpected response shape: proListResults was not found where it was verified to be. Returning the raw payload.',
          requestedService: service,
          canonicalService,
          url: page.finalUrl,
          raw: extractNextData(page.html),
        });
      }

      const sliced = limit === undefined ? results : results.slice(0, limit);
      return textResult({
        requestedService: service,
        canonicalService,
        redirected: canonicalService !== null && canonicalService !== slugify(service),
        zip,
        url: page.finalUrl,
        count: sliced.length,
        pros: compact ? sliced.map(compactPro) : sliced,
      });
    },
  );

  server.registerTool(
    'thumbtack_resolve_service',
    {
      description:
        'Resolve a loose service name to the canonical Thumbtack slug by asking Thumbtack (it canonicalises via redirect, e.g. "plumbing" -> "plumbers"). Use before assuming a slug is right.',
      annotations: toolAnnotations({ title: 'Resolve service slug' }),
      inputSchema: {
        service: z.string().min(1).describe('Trade or service name to canonicalise.'),
        zip: UsZip.default('10001').describe('ZIP used to drive the lookup; does not affect the resolved slug.'),
      },
    },
    async ({ service, zip }) => {
      const page = await client.searchPage(service, zip);
      const canonical = canonicalSlugOf(page.finalUrl);
      return textResult({
        requested: service,
        requestedSlug: slugify(service),
        canonical,
        redirected: canonical !== null && canonical !== slugify(service),
        url: page.finalUrl,
      });
    },
  );

  server.registerTool(
    'thumbtack_get_pro',
    {
      description:
        "Read a Thumbtack pro's profile: name, description, location, aggregate rating, plus credentials (background check, licences) and the section inventory. Takes a profile URL from thumbtack_search_pros.",
      annotations: toolAnnotations({ title: 'Get pro profile' }),
      inputSchema: {
        url: z.string().min(1).describe('Full https://www.thumbtack.com/... pro profile URL.'),
      },
    },
    async ({ url }) => {
      assertProfileUrl(url);
      const page = await client.getPage(url);
      const servicePage = servicePageOf(extractApolloState(page.html));
      const summary = summaryOf(localBusiness(page.html));
      const sections = Array.isArray((servicePage as { sections?: unknown[] } | null)?.sections)
        ? (servicePage as { sections: { __typename?: string }[] }).sections.map((s) => s?.__typename ?? null)
        : [];

      if (summary === null && servicePage === null) {
        process.stderr.write('[thumbtack-mcp] neither ld+json nor Apollo state found on profile page\n');
        return textResult({
          warning: 'Unexpected response shape: this page carried neither a business ld+json node nor an Apollo servicePage.',
          url: page.finalUrl,
        });
      }

      return textResult({
        url: page.finalUrl,
        ...(summary ?? {}),
        credentials: credentialsOf(servicePage),
        sections,
      });
    },
  );

  server.registerTool(
    'thumbtack_get_pro_reviews',
    {
      description:
        "Read the reviews embedded on a Thumbtack pro's profile page (star rating, author, date, text). Takes a profile URL from thumbtack_search_pros.",
      annotations: toolAnnotations({ title: 'Get pro reviews' }),
      inputSchema: {
        url: z.string().min(1).describe('Full https://www.thumbtack.com/... pro profile URL.'),
        limit: z.number().int().min(1).max(100).optional().describe('Cap the number of reviews returned.'),
      },
    },
    async ({ url, limit }) => {
      assertProfileUrl(url);
      const page = await client.getPage(url);
      const business = localBusiness(page.html);
      const all = reviewsOf(business);
      return textResult({
        url: page.finalUrl,
        name: (business as { name?: string } | null)?.name ?? null,
        total: all.length,
        reviews: limit === undefined ? all : all.slice(0, limit),
      });
    },
  );

  server.registerTool(
    'thumbtack_graphql',
    {
      description:
        "Escape hatch: issue an arbitrary read-only query against Thumbtack's anonymous GraphQL endpoint. Introspection is disabled upstream, so field names must come from a page's Apollo state. Mutations are refused.",
      annotations: toolAnnotations({ title: 'Raw GraphQL query' }),
      inputSchema: {
        query: z.string().min(1).describe('A GraphQL query document. Must not contain a mutation or subscription.'),
        variables: z.record(z.string(), z.unknown()).optional().describe('Variables for the query.'),
      },
    },
    async ({ query, variables }) => {
      if (/\b(mutation|subscription)\b/i.test(query)) {
        throw new McpToolError('This server is read-only; mutations and subscriptions are refused.', {
          hint: 'Thumbtack write paths sit behind a reCAPTCHA-gated login and cannot be driven server-side anyway.',
        });
      }
      return textResult(await client.graphql(query, variables));
    },
  );
}

export const WWW_BASE = WWW;
