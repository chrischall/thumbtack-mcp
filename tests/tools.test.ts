import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestHarness, parseToolResult } from '@chrischall/mcp-utils/test';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerProTools } from '../src/tools/pros.js';
import type { ThumbtackClient } from '../src/client.js';

const dir = new URL('./fixtures/', import.meta.url).pathname;
const searchHtml = readFileSync(dir + 'search.html', 'utf8');
const proHtml = readFileSync(dir + 'pro.html', 'utf8');
const PRO_URL =
  'https://www.thumbtack.com/nc/charlotte/house-cleaning/andreias-cleaning-llc/service/491089546672373766';

let fake: {
  searchPage: ReturnType<typeof vi.fn>;
  getPage: ReturnType<typeof vi.fn>;
  graphql: ReturnType<typeof vi.fn>;
  searchUrl: ReturnType<typeof vi.fn>;
};

async function harness() {
  return createTestHarness((server: McpServer) =>
    registerProTools(server, fake as unknown as ThumbtackClient),
  );
}

beforeEach(() => {
  fake = {
    searchPage: vi.fn().mockResolvedValue({
      html: searchHtml,
      finalUrl: 'https://www.thumbtack.com/k/house-cleaning/near-me?zip_code=28203',
    }),
    getPage: vi.fn().mockResolvedValue({ html: proHtml, finalUrl: PRO_URL }),
    graphql: vi.fn().mockResolvedValue({ __typename: 'Query' }),
    searchUrl: vi.fn().mockReturnValue('https://www.thumbtack.com/k/house-cleaning/near-me?zip_code=28203'),
  };
});

describe('tool roster', () => {
  it('registers the expected tools', async () => {
    const h = await harness();
    const names = (await h.listTools()).map((t) => t.name).sort();
    expect(names).toEqual([
      'thumbtack_get_pro',
      'thumbtack_get_pro_reviews',
      'thumbtack_graphql',
      'thumbtack_resolve_service',
      'thumbtack_search_pros',
    ]);
    await h.close();
  });
});

describe('thumbtack_search_pros', () => {
  // Fleet convention: `compact` is opt-IN, so full upstream records stay
  // reachable by default and nothing is silently projected away.
  it('returns full upstream records by default', async () => {
    const h = await harness();
    const out = parseToolResult<any>(await h.callTool('thumbtack_search_pros', { service: 'house cleaning', zip: '28203' }));
    expect(out.canonicalService).toBe('house-cleaning');
    expect(out.pros[0]).toHaveProperty('businessSummaryPrefab');
    await h.close();
  });

  it('returns slim records when compact is true', async () => {
    const h = await harness();
    const out = parseToolResult<any>(await h.callTool('thumbtack_search_pros', { service: 'house cleaning', zip: '28203', compact: true }));
    expect(out.pros[0].name).toBe('Andreia’s Cleaning LLC');
    expect(out.pros[0]).not.toHaveProperty('businessSummaryPrefab');
    await h.close();
  });

  it('reports the canonical slug the redirect landed on, not the requested one', async () => {
    fake.searchPage.mockResolvedValue({
      html: searchHtml,
      finalUrl: 'https://www.thumbtack.com/k/plumbers/near-me?zip_code=28203',
    });
    const h = await harness();
    const out = parseToolResult<any>(await h.callTool('thumbtack_search_pros', { service: 'plumbing', zip: '28203' }));
    expect(out.canonicalService).toBe('plumbers');
    expect(out.requestedService).toBe('plumbing');
    await h.close();
  });

  it('honours limit', async () => {
    const h = await harness();
    const out = parseToolResult<any>(await h.callTool('thumbtack_search_pros', { service: 'x', zip: '28203', limit: 1 }));
    expect(out.pros).toHaveLength(1);
    await h.close();
  });

  it('degrades to the raw payload when the envelope drifts, instead of returning an empty list', async () => {
    fake.searchPage.mockResolvedValue({ html: '<html><script id="__NEXT_DATA__" type="application/json">{"props":{}}</script></html>', finalUrl: 'https://x/k/y/near-me' });
    const h = await harness();
    const out = parseToolResult<any>(await h.callTool('thumbtack_search_pros', { service: 'x', zip: '28203' }));
    expect(out.warning).toMatch(/shape/i);
    expect(out.raw).toBeDefined();
    await h.close();
  });

  it('rejects a zip that is not a US zip', async () => {
    const h = await harness();
    const r = await h.callTool('thumbtack_search_pros', { service: 'x', zip: 'not-a-zip' });
    expect(r.isError).toBe(true);
    await h.close();
  });
});

describe('thumbtack_resolve_service', () => {
  it('returns the canonical slug from the redirect', async () => {
    fake.searchPage.mockResolvedValue({ html: searchHtml, finalUrl: 'https://www.thumbtack.com/k/electricians/near-me?zip_code=28203' });
    const h = await harness();
    const out = parseToolResult<any>(await h.callTool('thumbtack_resolve_service', { service: 'electrician' }));
    expect(out).toMatchObject({ requested: 'electrician', canonical: 'electricians', redirected: true });
    await h.close();
  });
});

describe('thumbtack_get_pro', () => {
  it('merges the ld+json summary with Apollo-only credentials', async () => {
    const h = await harness();
    const out = parseToolResult<any>(await h.callTool('thumbtack_get_pro', { url: PRO_URL }));
    expect(out.name).toBe('Andreia’s Cleaning LLC');
    expect(out.city).toBe('Charlotte');
    expect(out.credentials.some((c: any) => c.title === 'Background Check')).toBe(true);
    expect(out.sections).toContain('ServicePageReviewsSection');
    await h.close();
  });

  it('refuses a url that is not a thumbtack profile', async () => {
    const h = await harness();
    const r = await h.callTool('thumbtack_get_pro', { url: 'https://evil.example.com/x' });
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.content)).toMatch(/thumbtack\.com/);
    await h.close();
  });
});

describe('thumbtack_get_pro_reviews', () => {
  it('flattens the array-of-arrays review shape and honours limit', async () => {
    const h = await harness();
    const out = parseToolResult<any>(await h.callTool('thumbtack_get_pro_reviews', { url: PRO_URL, limit: 1 }));
    expect(out.reviews).toHaveLength(1);
    expect(typeof out.reviews[0].stars).toBe('number');
    await h.close();
  });
});

describe('thumbtack_graphql', () => {
  it('passes the query through and returns data', async () => {
    const h = await harness();
    const out = parseToolResult<any>(await h.callTool('thumbtack_graphql', { query: 'query{__typename}' }));
    expect(out).toEqual({ __typename: 'Query' });
    expect(fake.graphql).toHaveBeenCalledWith('query{__typename}', undefined);
    await h.close();
  });

  it('rejects a mutation — this server is read-only', async () => {
    const h = await harness();
    const r = await h.callTool('thumbtack_graphql', { query: 'mutation { doThing }' });
    expect(r.isError).toBe(true);
    expect(fake.graphql).not.toHaveBeenCalled();
    await h.close();
  });
});
