#!/usr/bin/env node
// Extract Thumbtack SSR data stores from a page on stdin.
// Usage: curl -sSL <url> | node tt-extract.mjs next|apollo|ldjson
const mode = process.argv[2] || 'next';
let html = '';
process.stdin.setEncoding('utf8');
for await (const c of process.stdin) html += c;

function braceMatch(s, start) {
  let depth = 0, instr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (instr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') instr = false;
      continue;
    }
    if (c === '"') instr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return s.slice(start, i + 1);
  }
  return null;
}

function decodeEntities(s) {
  return s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'")
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

let out;
if (mode === 'next') {
  const m = html.match(/id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) { console.error('no __NEXT_DATA__ on this page'); process.exit(3); }
  out = JSON.parse(m[1]);
} else if (mode === 'apollo') {
  const i = html.indexOf('window.__APOLLO_STATE__');
  if (i < 0) { console.error('no __APOLLO_STATE__ on this page'); process.exit(3); }
  const raw = braceMatch(html, html.indexOf('{', i));
  if (!raw) { console.error('unterminated __APOLLO_STATE__'); process.exit(3); }
  out = JSON.parse(raw);
} else if (mode === 'ldjson') {
  const blocks = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)];
  if (!blocks.length) { console.error('no ld+json on this page'); process.exit(3); }
  out = blocks.map((b) => JSON.parse(decodeEntities(b[1])));
  if (out.length === 1) out = out[0];
} else { console.error(`unknown mode: ${mode}`); process.exit(2); }
process.stdout.write(JSON.stringify(out));
