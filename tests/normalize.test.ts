import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractApolloState, extractNextData, localBusiness, servicePageOf } from '../src/parse.js';
import { compactPro, credentialsOf, proListOf, reviewsOf, summaryOf } from '../src/normalize.js';

const dir = new URL('./fixtures/', import.meta.url).pathname;
const search = readFileSync(dir + 'search.html', 'utf8');
const pro = readFileSync(dir + 'pro.html', 'utf8');

describe('proListOf', () => {
  it('finds the results array in a real search page', () => {
    expect(proListOf(extractNextData(search))).toHaveLength(2);
  });
  it('returns null when the envelope drifts, so callers can fall back to raw', () => {
    expect(proListOf({ props: {} })).toBeNull();
    expect(proListOf(null)).toBeNull();
  });
});

describe('compactPro', () => {
  it('projects a real result to the documented slim shape', () => {
    const [first] = proListOf(extractNextData(search))!;
    const c = compactPro(first);
    expect(c).toMatchObject({
      name: 'Andreia’s Cleaning LLC',
      servicePk: '491089546672373766',
      rating: 4.7,
      reviews: 1023,
      hires: 1619,
      online: true,
    });
    expect(c.url).toBe(
      'https://www.thumbtack.com/nc/charlotte/house-cleaning/andreias-cleaning-llc/service/491089546672373766',
    );
    // tracking query string is stripped
    expect(c.url).not.toContain('?');
    expect(c.responseTimeHours).toBeCloseTo(0.08, 2);
  });
  it('tolerates a record missing every optional branch', () => {
    expect(compactPro({})).toEqual({
      name: null, servicePk: null, rating: null, reviews: null, hires: null,
      responseTimeHours: null, online: null, url: null, facts: [], signals: [],
    });
  });
  it('keeps a null response time null rather than rounding it to 0', () => {
    expect(compactPro({ rankingAverageResponseTimeInHours: null }).responseTimeHours).toBeNull();
  });
});

describe('summaryOf', () => {
  it('reads the business node of a real profile', () => {
    const s = summaryOf(localBusiness(pro))!;
    expect(s.name).toBe('Andreia’s Cleaning LLC');
    expect(s.city).toBe('Charlotte');
    expect(s.state).toBe('NC');
    expect(s.reviews).toBeGreaterThan(0);
    expect(s.rating).toBeCloseTo(4.68, 2);
  });
  it('returns null when no business node is present', () => {
    expect(summaryOf(undefined)).toBeNull();
    expect(summaryOf(null)).toBeNull();
  });
});

describe('reviewsOf', () => {
  it('flattens the array-of-arrays review shape', () => {
    const r = reviewsOf(localBusiness(pro));
    expect(r.length).toBeGreaterThan(0);
    expect(r[0]).toHaveProperty('stars');
    expect(r[0]).toHaveProperty('author');
    expect(typeof r[0].stars).toBe('number');
  });
  it('returns [] when absent', () => {
    expect(reviewsOf(null)).toEqual([]);
    expect(reviewsOf({})).toEqual([]);
  });
});

describe('credentialsOf', () => {
  it('pulls inline credentials out of the real Apollo servicePage', () => {
    const sp = servicePageOf(extractApolloState(pro));
    const creds = credentialsOf(sp);
    expect(creds.some((c) => c.title === 'Background Check')).toBe(true);
  });
  it('returns [] when the section is absent', () => {
    expect(credentialsOf({ sections: [] })).toEqual([]);
    expect(credentialsOf(null)).toEqual([]);
  });
});
