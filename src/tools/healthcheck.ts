/** Liveness probe for the anonymous Thumbtack surface. */
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  ApiError,
  BotWallError,
  EdgeBlockedError,
  McpToolError,
  RateLimitError,
  UnreachableError,
  detectEdgeBlock,
  isTimeoutError,
  messageOf,
  minifiedResult,
  toolAnnotations,
  truncateErrorMessage,
} from '@chrischall/mcp-utils';
import type { ThumbtackClient } from '../client.js';
import { extractNextData } from '../parse.js';
import { proListOf } from '../normalize.js';
import { VERSION } from '../version.js';

/**
 * Why a probe failed, named so a CDN/WAF block (`edge_blocked`) is never read
 * as a moved page or a broken surface (chrischall/mcp-host#1015). The kinds
 * follow the fleet healthcheck ladder; this server has no credential, so the
 * credential arms never apply.
 */
export function probeFailure(err: unknown): { ok: false; kind: string; vendor?: string; detail: string } {
  const detail = truncateErrorMessage(messageOf(err));
  if (err instanceof EdgeBlockedError) return { ok: false, kind: 'edge_blocked', vendor: err.vendor, detail };
  if (err instanceof BotWallError) {
    return { ok: false, kind: 'edge_blocked', ...(err.vendor !== undefined ? { vendor: err.vendor } : {}), detail };
  }
  if (isTimeoutError(err)) return { ok: false, kind: 'timeout', detail };
  if (err instanceof RateLimitError) return { ok: false, kind: 'rate_limited', detail };
  if (err instanceof UnreachableError && err.status === undefined) return { ok: false, kind: 'transport', detail };
  // A thrower that kept the refusal page in its message still names the edge.
  const edge = detectEdgeBlock({ body: messageOf(err) });
  if (edge !== null) return { ok: false, kind: 'edge_blocked', vendor: edge.vendor, detail };
  if (err instanceof ApiError || err instanceof McpToolError) return { ok: false, kind: 'http', detail };
  return { ok: false, kind: 'unknown', detail };
}

export function registerHealthcheckTools(server: McpServer, client: ThumbtackClient): void {
  server.registerTool(
    'thumbtack_healthcheck',
    {
      description:
        "Check that Thumbtack's anonymous surface is reachable and still has the response shape this server expects. Reports the server version, the HTML page probe and the GraphQL probe separately, each with a `kind` (ok, edge_blocked, http, transport, timeout, rate_limited, shape_changed, unknown).",
      annotations: toolAnnotations({ title: 'Healthcheck' }),
      inputSchema: z.object({}),
    },
    async () => {
      const checks: Record<string, unknown> = { version: VERSION };

      try {
        const page = await client.searchPage('house cleaning', '10001');
        const results = proListOf(extractNextData(page.html));
        checks.searchPage =
          results === null
            ? { ok: false, kind: 'shape_changed', detail: 'page fetched but proListResults was not where it was verified to be — the SSR shape may have changed' }
            : { ok: true, kind: 'ok', pros: results.length, finalUrl: page.finalUrl };
      } catch (err) {
        checks.searchPage = probeFailure(err);
      }

      try {
        const data = await client.graphql('query{__typename}');
        const ok = (data as { __typename?: string })?.__typename === 'Query';
        checks.graphql = { ok, kind: ok ? 'ok' : 'shape_changed', data };
      } catch (err) {
        checks.graphql = probeFailure(err);
      }

      const ok = Object.values(checks).every((c) => typeof c !== 'object' || c === null || (c as { ok?: boolean }).ok !== false);
      return minifiedResult({ ok, ...checks });
    },
  );
}
