/**
 * The bundled skill extractor (`skills/thumbtack/tt-extract.mjs`) must return
 * what the server returns for the same page (fleet-audit#907). It runs from a
 * skills directory with no node_modules, so it cannot import
 * `@chrischall/mcp-utils` — it carries a dependency-free copy of the same
 * semantics, and this suite pins the two together on the captured fixtures.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractApolloState, extractLdJson, extractNextData } from '../src/parse.js';

const script = new URL('../skills/thumbtack/tt-extract.mjs', import.meta.url).pathname;
const dir = new URL('./fixtures/', import.meta.url).pathname;
const search = readFileSync(dir + 'search.html', 'utf8');
const pro = readFileSync(dir + 'pro.html', 'utf8');
const proPlumber = readFileSync(dir + 'pro-plumber.html', 'utf8');

function run(mode: string, html: string): { status: number; out: unknown } {
  try {
    const stdout = execFileSync(process.execPath, [script, mode], { input: html, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { status: 0, out: JSON.parse(stdout) };
  } catch (err) {
    return { status: (err as { status: number }).status, out: undefined };
  }
}

/** The skill unwraps a single ld+json block; the server always returns the list. */
function serverLd(html: string): unknown {
  const blocks = extractLdJson(html);
  return blocks.length === 1 ? blocks[0] : blocks;
}

describe('tt-extract.mjs matches the server', () => {
  it('next: same object as the server on a real search page', () => {
    expect(run('next', search)).toEqual({ status: 0, out: extractNextData(search) });
  });

  it('apollo: same object as the server on a real profile page', () => {
    expect(run('apollo', pro)).toEqual({ status: 0, out: extractApolloState(pro) });
  });

  it('apollo: not terminated by braces inside single- or double-quoted strings', () => {
    const html = 'window.__APOLLO_STATE__ = {"a":"}{ \\" x","b":[1,{"c":"]"}]};';
    expect(run('apollo', html)).toEqual({ status: 0, out: extractApolloState(html) });
  });

  it('ldjson: same blocks as the server on real profile pages', () => {
    expect(run('ldjson', pro)).toEqual({ status: 0, out: serverLd(pro) });
    expect(run('ldjson', proPlumber)).toEqual({ status: 0, out: serverLd(proPlumber) });
  });

  it('ldjson: script bodies are raw text — entities are NOT decoded (the old divergence)', () => {
    const html =
      '<script type="application/ld+json">{"name":"Tom &amp; Sons","review":"said &quot;great&quot;"}</script>';
    expect(run('ldjson', html)).toEqual({ status: 0, out: serverLd(html) });
    expect(run('ldjson', html).out).toEqual({ name: 'Tom &amp; Sons', review: 'said &quot;great&quot;' });
  });

  it('ldjson: a malformed block is skipped, as the server skips it', () => {
    const html =
      '<script type="application/ld+json">{oops</script><script type="application/ld+json">{"name":"ok"}</script>';
    expect(run('ldjson', html)).toEqual({ status: 0, out: serverLd(html) });
  });

  it('next: reads only the real tag, not the marker inside another script', () => {
    const html =
      '<script>var s = \'id="__NEXT_DATA__" {"decoy":true}\';</script>' +
      '<script id="__NEXT_DATA__" type="application/json">{"real":1}</script>';
    expect(run('next', html)).toEqual({ status: 0, out: extractNextData(html) });
  });

  it('exits 3 when the store is absent, as the server returns null/[]', () => {
    expect(run('next', pro).status).toBe(3);
    expect(extractNextData(pro)).toBeNull();
    expect(run('apollo', search).status).toBe(3);
    expect(run('ldjson', '<html></html>').status).toBe(3);
  });

  it('exits 2 on an unknown mode', () => {
    expect(run('nope', '').status).toBe(2);
  });
});
