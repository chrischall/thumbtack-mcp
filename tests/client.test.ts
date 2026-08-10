import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThumbtackClient } from '../src/client.js';

function res(body: string, init: Partial<{ status: number; url: string; contentType: string }> = {}) {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { 'content-type': init.contentType ?? 'text/html' },
  }) as Response & { url: string };
}
/** Response.url is read-only, so stamp it the way a redirect-followed fetch would. */
function withUrl(r: Response, url: string) {
  Object.defineProperty(r, 'url', { value: url });
  return r;
}

let fetchMock: ReturnType<typeof vi.fn>;
let client: ThumbtackClient;

beforeEach(() => {
  fetchMock = vi.fn();
  client = new ThumbtackClient({ fetchImpl: fetchMock as unknown as typeof fetch });
});
afterEach(() => vi.restoreAllMocks());

describe('getPage', () => {
  it('sends a browser User-Agent and follows redirects, reporting the final url', async () => {
    fetchMock.mockResolvedValue(withUrl(res('<html>ok</html>'), 'https://www.thumbtack.com/k/plumbers/near-me'));
    const page = await client.getPage('https://www.thumbtack.com/k/plumbing/near-me');
    expect(page.finalUrl).toBe('https://www.thumbtack.com/k/plumbers/near-me');
    expect(page.html).toContain('ok');
    const init = fetchMock.mock.calls[0][1];
    expect(init.redirect).toBe('follow');
    expect(String(init.headers['user-agent'])).toMatch(/Mozilla/);
  });

  it('raises an actionable error on a non-2xx', async () => {
    fetchMock.mockResolvedValue(withUrl(res('nope', { status: 503 }), 'https://x'));
    await expect(client.getPage('https://x')).rejects.toThrow(/503/);
  });

  it('flags a Cloudflare interstitial as a bot wall rather than parsing it', async () => {
    fetchMock.mockResolvedValue(withUrl(res('<title>Just a moment...</title>'), 'https://x'));
    await expect(client.getPage('https://x')).rejects.toThrow(/bot|challenge|blocked/i);
  });

  it('surfaces a transport failure as unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(client.getPage('https://x')).rejects.toThrow(/thumbtack|unreachable|reach/i);
  });
});

describe('searchUrl', () => {
  it('builds the verified search path and encodes its inputs', async () => {
    fetchMock.mockResolvedValue(withUrl(res('<html/>'), 'https://final'));
    await client.searchPage('house cleaning', '28203');
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://www.thumbtack.com/k/house-cleaning/near-me?zip_code=28203',
    );
  });

  it('slugifies a free-text service name', async () => {
    fetchMock.mockResolvedValue(withUrl(res('<html/>'), 'https://final'));
    await client.searchPage('Lawn Mowing & Trimming', '90210');
    expect(fetchMock.mock.calls[0][0]).toContain('/k/lawn-mowing-trimming/');
  });
});

describe('graphql', () => {
  it('posts to the verified endpoint with an origin header', async () => {
    fetchMock.mockResolvedValue(withUrl(res(JSON.stringify({ data: { __typename: 'Query' } }), { contentType: 'application/json' }), 'https://app.thumbtack.com/graphql'));
    const out = await client.graphql('query{__typename}');
    expect(out).toEqual({ __typename: 'Query' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://app.thumbtack.com/graphql');
    expect(init.method).toBe('POST');
    expect(init.headers.origin).toBe('https://www.thumbtack.com');
  });

  it('treats an errors[] body as a failure even though the status is 200', async () => {
    fetchMock.mockResolvedValue(withUrl(res(JSON.stringify({ errors: [{ message: 'badRequest' }], data: null }), { contentType: 'application/json' }), 'https://app.thumbtack.com/graphql'));
    await expect(client.graphql('query{x}')).rejects.toThrow(/badRequest/);
  });

  it('does not blindly JSON.parse a non-JSON body', async () => {
    fetchMock.mockResolvedValue(withUrl(res('<html>challenge</html>'), 'https://app.thumbtack.com/graphql'));
    await expect(client.graphql('query{x}')).rejects.toThrow(/json|html|unexpected/i);
  });
});
