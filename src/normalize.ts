/**
 * Compact projections over Thumbtack's SSR payloads.
 *
 * These endpoints are reverse-engineered and undocumented, so every accessor
 * degrades instead of throwing: a drifted envelope yields `null`/`[]` and the
 * caller returns the raw response rather than a confidently-wrong projection.
 */

const BASE = 'https://www.thumbtack.com';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

function asRecord(v: unknown): Any | null {
  return typeof v === 'object' && v !== null ? (v as Any) : null;
}

/** The `proListResults` array of a search page, or null if the envelope drifted. */
export function proListOf(nextData: unknown): Any[] | null {
  const results = asRecord(nextData)?.props?.pageProps?.frontDoorPage?.proListSection?.proListResults;
  return Array.isArray(results) ? results : null;
}

export interface CompactPro {
  name: string | null;
  servicePk: string | null;
  rating: number | null;
  reviews: number | null;
  hires: number | null;
  responseTimeHours: number | null;
  online: boolean | null;
  url: string | null;
  facts: string[];
  signals: string[];
}

/** Project one `proListResults` entry to a slim, agent-friendly record. */
export function compactPro(result: unknown): CompactPro {
  const r = asRecord(result) ?? {};
  const summary = r.businessSummaryPrefab?.businessSummary;
  const review = summary?.reviewSummaryPrefab?.reviewSummary;
  const hours = r.rankingAverageResponseTimeInHours;
  return {
    name: summary?.businessName ?? null,
    servicePk: r.servicePk ?? null,
    rating: review?.averageRating?.rating ?? null,
    reviews: review?.numReviews ?? null,
    hires: r.numHires ?? null,
    // null must stay null — rounding it would report "responds instantly".
    responseTimeHours: typeof hours === 'number' ? Math.round(hours * 100) / 100 : null,
    online: summary?.isOnline ?? null,
    url: typeof r.url === 'string' ? BASE + r.url.split('?')[0] : null,
    facts: Array.isArray(r.businessFacts)
      ? r.businessFacts.map((f: Any) => f?.description).filter((d: unknown): d is string => typeof d === 'string')
      : [],
    signals: Array.isArray(r.urgencySignalPills)
      ? r.urgencySignalPills.map((p: Any) => p?.text).filter((t: unknown): t is string => typeof t === 'string')
      : [],
  };
}

export interface ProSummary {
  name: string | null;
  description: string | null;
  rating: number | null;
  reviews: number | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  url: string | null;
}

/** Profile summary from the `ld+json` business node (see `parse.localBusiness`). */
export function summaryOf(business: unknown): ProSummary | null {
  const b = asRecord(business);
  if (!b) return null;
  return {
    name: b.name ?? null,
    description: b.description ?? null,
    rating: b.aggregateRating?.ratingValue ?? null,
    reviews: b.aggregateRating?.reviewCount ?? null,
    city: b.address?.addressLocality ?? null,
    state: b.address?.addressRegion ?? null,
    zip: b.address?.postalCode ?? null,
    url: b.url ?? null,
  };
}

export interface ProReview {
  stars: number | null;
  author: string | null;
  date: string | null;
  text: string | null;
}

/** Reviews from the business node. The upstream `review` field is an array OF ARRAYS. */
export function reviewsOf(business: unknown): ProReview[] {
  const raw = asRecord(business)?.review;
  if (!Array.isArray(raw)) return [];
  return raw.flat(Infinity).map((r: Any) => ({
    stars: r?.reviewRating?.ratingValue ?? null,
    author: r?.author?.name ?? null,
    date: r?.datePublished ?? null,
    text: r?.description ?? null,
  }));
}

export interface ProCredential {
  title: string | null;
  details: string[];
}

/** Background checks / licences — present only in the Apollo store. */
export function credentialsOf(servicePage: unknown): ProCredential[] {
  const sections = asRecord(servicePage)?.sections;
  if (!Array.isArray(sections)) return [];
  const section = sections.find((s: Any) => s?.__typename === 'ServicePageCredentialsSection');
  const inline = section?.inlineCredentials;
  if (!Array.isArray(inline)) return [];
  return inline.map((c: Any) => ({
    title: c?.title ?? null,
    details: Array.isArray(c?.details)
      ? c.details
          .flatMap((d: Any) => (Array.isArray(d?.segments) ? d.segments : []))
          .map((s: Any) => s?.text)
          .filter((t: unknown): t is string => typeof t === 'string')
      : [],
  }));
}
