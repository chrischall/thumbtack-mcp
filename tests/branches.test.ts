/** Targeted coverage of the defensive branches the happy-path tests don't reach. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestHarness, parseToolResult } from '@chrischall/mcp-utils/test';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ThumbtackClient } from '../src/client.js';
import { registerProTools } from '../src/tools/pros.js';
import { localBusiness, servicePageOf } from '../src/parse.js';
import { credentialsOf } from '../src/normalize.js';

function res(body: string, init: { status?: number } = {}) {
  return new Response(body, { status: init.status ?? 200 });
}
const withUrl = (r: Response, url: string) => (Object.defineProperty(r, 'url', { value: url }), r);

describe('parse edge cases', () => {
  it('reads a top-level ld+json ARRAY, not just an object or @graph', () => {
    const html = `<script type="application/ld+json">[{"@type":"Electrician","name":"Volt","address":{}}]</script>`;
    expect(localBusiness(html)?.name).toBe('Volt');
  });
  it('skips non-object and unnamed candidates before matching', () => {
    const html = `<script type="application/ld+json">["a string", {"noName":1}, {"name":"X"}, {"name":"Y","aggregateRating":{}}]</script>`;
    expect(localBusiness(html)?.name).toBe('Y');
  });
  it('treats a servicePage key whose value is null as absent', () => {
    expect(servicePageOf({ ROOT_QUERY: { 'servicePage({})': null } })).toBeNull();
  });
});

describe('normalize edge cases', () => {
  it('drops credential detail entries that carry no usable text', () => {
    const creds = credentialsOf({
      sections: [
        {
          __typename: 'ServicePageCredentialsSection',
          inlineCredentials: [
            { title: 'Licence', details: [{ notSegments: 1 }, { segments: [{ text: 'ok' }, { text: 42 }] }] },
            { details: null },
          ],
        },
      ],
    });
    expect(creds[0]).toEqual({ title: 'Licence', details: ['ok'] });
    expect(creds[1]).toEqual({ title: null, details: [] });
  });
});

describe('client edge cases', () => {
  it('falls back to the requested url when the response carries none', async () => {
    const fetchMock = vi.fn().mockResolvedValue(withUrl(res('<html/>'), ''));
    const c = new ThumbtackClient({ fetchImpl: fetchMock as unknown as typeof fetch });
    expect((await c.getPage('https://www.thumbtack.com/x')).finalUrl).toBe('https://www.thumbtack.com/x');
  });
  it('sends variables when given, and omits the key entirely when not', async () => {
    // a fresh Response per call — a Response body can only be read once
    const fetchMock = vi.fn().mockImplementation(async () => withUrl(res(JSON.stringify({ data: 1 })), 'https://app.thumbtack.com/graphql'));
    const c = new ThumbtackClient({ fetchImpl: fetchMock as unknown as typeof fetch });
    await c.graphql('query{a}', { x: 1 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ query: 'query{a}', variables: { x: 1 } });
    await c.graphql('query{a}');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ query: 'query{a}' });
  });
  it('labels a graphql error with no message as unknown', async () => {
    const fetchMock = vi.fn().mockResolvedValue(withUrl(res(JSON.stringify({ errors: [{}] })), 'https://app.thumbtack.com/graphql'));
    const c = new ThumbtackClient({ fetchImpl: fetchMock as unknown as typeof fetch });
    await expect(c.graphql('query{a}')).rejects.toThrow(/unknown/);
  });
});

describe('tool guard branches', () => {
  let fake: Record<string, ReturnType<typeof vi.fn>>;
  const harness = () => createTestHarness((s: McpServer) => registerProTools(s, fake as unknown as ThumbtackClient));
  beforeEach(() => {
    fake = {
      getPage: vi.fn().mockResolvedValue({ html: '<html></html>', finalUrl: 'https://www.thumbtack.com/x' }),
      searchPage: vi.fn(),
      graphql: vi.fn(),
      searchUrl: vi.fn(),
    };
  });

  it('rejects a malformed url before any fetch', async () => {
    const h = await harness();
    const r = await h.callTool('thumbtack_get_pro', { url: 'not a url' });
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.content)).toMatch(/valid URL/i);
    expect(fake.getPage).not.toHaveBeenCalled();
    await h.close();
  });

  it('rejects a non-https thumbtack url', async () => {
    const h = await harness();
    const r = await h.callTool('thumbtack_get_pro', { url: 'http://www.thumbtack.com/x' });
    expect(r.isError).toBe(true);
    await h.close();
  });

  it('warns instead of inventing data when a profile page has neither store', async () => {
    const h = await harness();
    const out = parseToolResult<any>(await h.callTool('thumbtack_get_pro', { url: 'https://www.thumbtack.com/x' }));
    expect(out.warning).toMatch(/neither/i);
    await h.close();
  });
});

describe('null-coalescing fallbacks', () => {
  it('summaryOf yields all-null for a node with only a name', async () => {
    const { summaryOf, reviewsOf } = await import('../src/normalize.js');
    expect(summaryOf({ name: 'X' })).toEqual({
      name: 'X', description: null, rating: null, reviews: null,
      city: null, state: null, zip: null, url: null,
    });
    expect(reviewsOf({ review: [[{}]] })).toEqual([{ stars: null, author: null, date: null, text: null }]);
  });

  it('compactPro tolerates a summary present but empty', async () => {
    const { compactPro } = await import('../src/normalize.js');
    const c = compactPro({ businessSummaryPrefab: { businessSummary: {} }, businessFacts: [{}], urgencySignalPills: [{}] });
    expect(c.name).toBeNull();
    expect(c.rating).toBeNull();
    expect(c.facts).toEqual([]);
    expect(c.signals).toEqual([]);
  });

  it('accepts a ZIP+4', async () => {
    const fake = {
      searchPage: vi.fn().mockResolvedValue({ html: '<html/>', finalUrl: 'https://www.thumbtack.com/k/x/near-me' }),
      getPage: vi.fn(), graphql: vi.fn(), searchUrl: vi.fn(),
    };
    const h = await createTestHarness((s: McpServer) => registerProTools(s, fake as unknown as ThumbtackClient));
    const r = await h.callTool('thumbtack_search_pros', { service: 'x', zip: '28203-1234' });
    expect(r.isError).toBeFalsy();
    await h.close();
  });

  it('get_pro reports empty sections and a null-free body when only ld+json is present', async () => {
    const fake = {
      getPage: vi.fn().mockResolvedValue({
        html: '<script type="application/ld+json">{"@type":"Plumber","name":"Solo","address":{}}</script>',
        finalUrl: 'https://www.thumbtack.com/x',
      }),
      searchPage: vi.fn(), graphql: vi.fn(), searchUrl: vi.fn(),
    };
    const h = await createTestHarness((s: McpServer) => registerProTools(s, fake as unknown as ThumbtackClient));
    const out = parseToolResult<any>(await h.callTool('thumbtack_get_pro', { url: 'https://www.thumbtack.com/x' }));
    expect(out.name).toBe('Solo');
    expect(out.sections).toEqual([]);
    expect(out.credentials).toEqual([]);
    await h.close();
  });

  it('get_pro_reviews reports a null name when no business node is present', async () => {
    const fake = {
      getPage: vi.fn().mockResolvedValue({ html: '<html></html>', finalUrl: 'https://www.thumbtack.com/x' }),
      searchPage: vi.fn(), graphql: vi.fn(), searchUrl: vi.fn(),
    };
    const h = await createTestHarness((s: McpServer) => registerProTools(s, fake as unknown as ThumbtackClient));
    const out = parseToolResult<any>(await h.callTool('thumbtack_get_pro_reviews', { url: 'https://www.thumbtack.com/x' }));
    expect(out).toMatchObject({ name: null, total: 0, reviews: [] });
    await h.close();
  });

  it('get_pro reports null section typenames when a section lacks one', async () => {
    const fake = {
      getPage: vi.fn().mockResolvedValue({
        html: '<script>window.__APOLLO_STATE__ = {"ROOT_QUERY":{"servicePage({})":{"sections":[{},{"__typename":"A"}]}}};</script>',
        finalUrl: 'https://www.thumbtack.com/x',
      }),
      searchPage: vi.fn(), graphql: vi.fn(), searchUrl: vi.fn(),
    };
    const h = await createTestHarness((s: McpServer) => registerProTools(s, fake as unknown as ThumbtackClient));
    const out = parseToolResult<any>(await h.callTool('thumbtack_get_pro', { url: 'https://www.thumbtack.com/x' }));
    expect(out.sections).toEqual([null, 'A']);
    await h.close();
  });
});

describe('final defensive branches', () => {
  it('compactPro accepts a non-record input', async () => {
    const { compactPro } = await import('../src/normalize.js');
    expect(compactPro(null).name).toBeNull();
    expect(compactPro('nope').servicePk).toBeNull();
  });

  it('summaryOf yields a null name when the node has none', async () => {
    const { summaryOf } = await import('../src/normalize.js');
    expect(summaryOf({ address: { addressLocality: 'Charlotte' } })).toMatchObject({ name: null, city: 'Charlotte' });
  });

  it('reports a null canonical slug when the final url is not a /k/ search page', async () => {
    const fake = {
      searchPage: vi.fn().mockResolvedValue({ html: '<html/>', finalUrl: 'https://www.thumbtack.com/somewhere/else' }),
      getPage: vi.fn(), graphql: vi.fn(), searchUrl: vi.fn(),
    };
    const h = await createTestHarness((s: McpServer) => registerProTools(s, fake as unknown as ThumbtackClient));
    const out = parseToolResult<any>(await h.callTool('thumbtack_resolve_service', { service: 'x' }));
    expect(out).toMatchObject({ canonical: null, redirected: false });
    await h.close();
  });
});
