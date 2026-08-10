/**
 * Thumbtack-specific readers over the fleet's shared SSR scraping primitives
 * (`@chrischall/mcp-utils` `scrape`). Nothing here re-implements bracket
 * matching or entity decoding — it only encodes *which* store lives on *which*
 * Thumbtack page, and how to address the one dynamic key.
 *
 * Verified in docs/THUMBTACK-API.md: search pages carry `__NEXT_DATA__` only;
 * profile pages carry `window.__APOLLO_STATE__` + `ld+json` only.
 */
import { extractJsonAfterMarker, extractJsonLdBlocks } from '@chrischall/mcp-utils';

/** `__NEXT_DATA__` from a search page, or `null` if this page has none. */
export function extractNextData(html: string): unknown {
  return extractJsonAfterMarker(html, 'id="__NEXT_DATA__"');
}

/**
 * `window.__APOLLO_STATE__` from a profile page, or `null`.
 *
 * This is a bare JS assignment rather than a script tag, so it needs the
 * balanced-brace walk `extractJsonAfterMarker` performs — a regex cannot find
 * its end.
 */
export function extractApolloState(html: string): unknown {
  return extractJsonAfterMarker(html, 'window.__APOLLO_STATE__');
}

/** Every `ld+json` block on the page, in document order (malformed ones skipped). */
export function extractLdJson(html: string): unknown[] {
  return extractJsonLdBlocks(html);
}

/**
 * The profile page's business node from JSON-LD, or `null`.
 *
 * Deliberately matched by SHAPE, not by `@type`. Thumbtack types the node with
 * the **trade-specific** schema.org subtype — a plumber's page says
 * `"@type":"Plumber"`, a cleaner's says `"LocalBusiness"`, and there is a
 * subtype per trade (`Electrician`, `HousePainter`, …). Matching the literal
 * `LocalBusiness` silently returned `null` for most trades; caught by a live
 * probe, not by fixtures. Anything carrying a `name` plus an `aggregateRating`
 * or a postal `address` is the business node.
 */
export function localBusiness(html: string): Record<string, unknown> | null {
  const candidates: unknown[] = [];
  for (const block of extractJsonLdBlocks(html)) {
    if (Array.isArray(block)) candidates.push(...block);
    else if (typeof block === 'object' && block !== null) {
      candidates.push(block);
      const graph = (block as { '@graph'?: unknown })['@graph'];
      if (Array.isArray(graph)) candidates.push(...graph);
    }
  }
  for (const c of candidates) {
    if (typeof c !== 'object' || c === null) continue;
    const node = c as Record<string, unknown>;
    if (typeof node.name !== 'string') continue;
    if (node.aggregateRating !== undefined || node.address !== undefined) return node;
  }
  return null;
}

/**
 * The `servicePage` payload inside an Apollo state.
 *
 * Its key is `servicePage({...the entire input json...})`, so it differs on
 * every page and MUST be addressed by prefix — never by a literal key.
 */
export function servicePageOf(state: unknown): unknown {
  const root = (state as { ROOT_QUERY?: Record<string, unknown> } | null)?.ROOT_QUERY;
  if (!root) return null;
  const key = Object.keys(root).find((k) => k.startsWith('servicePage('));
  return key === undefined ? null : (root[key] ?? null);
}
