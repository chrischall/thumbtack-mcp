import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractApolloState, extractLdJson, extractNextData, localBusiness, servicePageOf } from '../src/parse.js';

const dir = new URL('./fixtures/', import.meta.url).pathname;
const search = readFileSync(dir + 'search.html', 'utf8');
const pro = readFileSync(dir + 'pro.html', 'utf8');
// A plumber's profile: Thumbtack types the business node with the trade-specific
// schema.org subtype ("Plumber"), NOT "LocalBusiness". Captured live.
const proPlumber = readFileSync(dir + 'pro-plumber.html', 'utf8');

describe('store selection is page-type specific', () => {
  it('a real search page has __NEXT_DATA__ and no Apollo state', () => {
    expect(extractNextData(search)).not.toBeNull();
    expect(extractApolloState(search)).toBeNull();
  });
  it('a real profile page has Apollo state + ld+json and no __NEXT_DATA__', () => {
    expect(extractApolloState(pro)).not.toBeNull();
    expect(extractLdJson(pro).length).toBeGreaterThan(0);
    expect(extractNextData(pro)).toBeNull();
  });
});

describe('extractApolloState', () => {
  it('stops at its own closing brace, ignoring later assignments', () => {
    const state = extractApolloState(pro) as Record<string, unknown>;
    expect(Object.keys(state)).toEqual(['ROOT_QUERY']);
  });
  it('is not terminated by braces inside string values', () => {
    expect(extractApolloState('window.__APOLLO_STATE__ = {"a":"}{ still \\" string","b":2};')).toEqual({
      a: '}{ still " string',
      b: 2,
    });
  });
  it('returns null when the assignment never closes', () => {
    expect(extractApolloState('window.__APOLLO_STATE__ = {"a":1')).toBeNull();
  });
});

describe('localBusiness', () => {
  it('finds the business node on a real profile page (LocalBusiness subtype)', () => {
    expect(localBusiness(pro)?.name).toBe('Andreia’s Cleaning LLC');
  });
  it('finds a trade-specific subtype such as Plumber, not just LocalBusiness', () => {
    expect(localBusiness(proPlumber)?.name).toContain('Mr. Rooter');
  });
  it('returns null when the page has no such entity', () => {
    expect(localBusiness(search)).toBeNull();
  });
});

describe('servicePageOf', () => {
  it('addresses the dynamic servicePage key by prefix, not literally', () => {
    const sp = servicePageOf(extractApolloState(pro)) as { __typename: string; sections: unknown[] };
    expect(sp.__typename).toBe('ServicePage');
    expect(sp.sections).toHaveLength(11);
  });
  it('returns null when no servicePage key is present', () => {
    expect(servicePageOf({ ROOT_QUERY: { __typename: 'Query' } })).toBeNull();
  });
  it('returns null when there is no ROOT_QUERY', () => {
    expect(servicePageOf({})).toBeNull();
    expect(servicePageOf(null)).toBeNull();
  });
});

describe('extractNextData (tag-bounded, fleet-audit#1145)', () => {
  it('reads the blob from the real <script id="__NEXT_DATA__"> tag, not a marker anywhere in the page', () => {
    // The marker text inside ANOTHER script used to match first: the
    // marker-anywhere extractor then parsed the decoy object.
    const html =
      '<script>var s = \'id="__NEXT_DATA__" {"decoy":true}\';</script>' +
      '<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"real":1}}}</script>';
    expect(extractNextData(html)).toEqual({ props: { pageProps: { real: 1 } } });
  });
  it('returns null (not undefined) for invalid JSON so callers keep their null contract', () => {
    expect(extractNextData('<script id="__NEXT_DATA__">{not json</script>')).toBeNull();
  });
  it('is linear on a hostile page of unterminated <script openers', () => {
    const hostile = '<script '.repeat(50_000);
    const t0 = performance.now();
    expect(extractNextData(hostile)).toBeNull();
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
