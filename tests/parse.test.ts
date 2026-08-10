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
