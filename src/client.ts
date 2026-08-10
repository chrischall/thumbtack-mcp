/**
 * Thumbtack client — plain `fetch` against the public consumer surface.
 *
 * There is deliberately no credential handling here. Thumbtack's consumer
 * pages and its GraphQL endpoint answer anonymously (verified in
 * docs/THUMBTACK-API.md), and its login is reCAPTCHA-gated, so a server-side
 * password login is impossible. That makes every tool in this server a
 * no-auth read: the server boots and serves `tools/list` unconditionally, and
 * there is no deferred config error to raise.
 */
import { BotWallError, McpToolError, UnreachableError, isCloudflareChallenge, messageOf, truncateErrorMessage } from '@chrischall/mcp-utils';

export const WWW = 'https://www.thumbtack.com';
export const GRAPHQL_ENDPOINT = 'https://app.thumbtack.com/graphql';

/** Matches a current desktop Chrome. Requests work without it; we match the browser. */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

export interface Page {
  html: string;
  /** Post-redirect URL — this is how a loose service slug is canonicalised. */
  finalUrl: string;
}

export interface ThumbtackClientOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** `Lawn Mowing & Trimming` -> `lawn-mowing-trimming` */
export function slugify(service: string): string {
  return service
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export class ThumbtackClient {
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;

  constructor(opts: ThumbtackClientOptions = {}) {
    this.#fetch = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.#timeoutMs = opts.timeoutMs ?? 30_000;
  }

  async #request(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.#fetch(url, {
        ...init,
        redirect: 'follow',
        signal: AbortSignal.timeout(this.#timeoutMs),
        headers: { 'user-agent': USER_AGENT, ...(init.headers as Record<string, string>) },
      });
    } catch (err) {
      throw new UnreachableError(`Thumbtack (${url}): ${truncateErrorMessage(messageOf(err))}`);
    }
  }

  /** Fetch an HTML page, following redirects. */
  async getPage(url: string): Promise<Page> {
    const res = await this.#request(url, { method: 'GET' });
    const html = await res.text();
    if (!res.ok) {
      throw new McpToolError(`Thumbtack returned HTTP ${res.status} for ${url}`, {
        hint: 'The page may have moved or the service slug may not exist.',
      });
    }
    if (isCloudflareChallenge(html)) {
      throw new BotWallError(url, 30, { vendor: 'Cloudflare' });
    }
    return { html, finalUrl: res.url || url };
  }

  /** The verified search URL for a service + zip. Loose slugs redirect to canonical ones. */
  searchUrl(service: string, zip: string): string {
    return `${WWW}/k/${slugify(service)}/near-me?zip_code=${encodeURIComponent(zip)}`;
  }

  /** Fetch a search page. `finalUrl` carries the canonical slug. */
  async searchPage(service: string, zip: string): Promise<Page> {
    return this.getPage(this.searchUrl(service, zip));
  }

  /**
   * Issue an anonymous GraphQL query.
   *
   * This API answers **HTTP 200 with an `errors[]` body**, so status alone is
   * never sufficient — and a non-JSON 2xx is a challenge page, not data.
   */
  async graphql(query: string, variables?: Record<string, unknown>): Promise<unknown> {
    const res = await this.#request(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WWW },
      body: JSON.stringify(variables === undefined ? { query } : { query, variables }),
    });
    const body = await res.text();
    let parsed: { data?: unknown; errors?: { message?: string }[] };
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new McpToolError(
        `Thumbtack GraphQL returned a non-JSON body (HTTP ${res.status}) — this is usually a challenge or error page, not data.`,
        { hint: 'Retry shortly. If it persists, the endpoint or its request shape has changed.' },
      );
    }
    if (parsed.errors?.length) {
      const detail = parsed.errors.map((e) => e?.message ?? 'unknown').join('; ');
      throw new McpToolError(`Thumbtack GraphQL error: ${truncateErrorMessage(detail)}`, {
        hint: '`servicePage` requires its full input object — a partial input returns badRequest even when the query validates.',
      });
    }
    return parsed.data;
  }
}

/**
 * Module-singleton client. Construction touches no credentials and performs no
 * IO, so importing this can never fail at load time.
 */
export const client = new ThumbtackClient();
