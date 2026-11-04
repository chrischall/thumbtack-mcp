import { describe, expect, it } from 'vitest';
import { createTestHarness } from '@chrischall/mcp-utils/test';
import type { McpServer } from '@modelcontextprotocol/server';
import { registerProTools } from '../src/tools/pros.js';
import { registerHealthcheckTools } from '../src/tools/healthcheck.js';
import type { ThumbtackClient } from '../src/client.js';

/**
 * Context-group hints (`_meta.mint`, the mcp-host context-groups contract),
 * read off the served `tools/list` — what a host actually sees.
 */
type Listed = {
  name: string;
  annotations?: { readOnlyHint?: boolean };
  inputSchema: { properties?: Record<string, unknown> };
  _meta?: { mint?: Record<string, any> };
};

async function served(): Promise<Listed[]> {
  const h = await createTestHarness((server: McpServer) => {
    const client = {} as ThumbtackClient;
    registerProTools(server, client);
    registerHealthcheckTools(server, client);
  });
  const { tools } = await h.client.listTools();
  await h.close();
  return tools as unknown as Listed[];
}

const DOMAINS = ['school', 'home', 'work', 'family', 'health', 'money', 'travel', 'food'];
const INTENTS = ['whats-new', 'whats-due', 'whats-on', 'lookup', 'turn-on-off', 'send', 'change', 'other'];
const CANONICAL_INTENTS = ['whats-new', 'whats-due', 'whats-on'];
const KEYS = ['domain', 'intent', 'canonical', 'subject', 'when', 'aliases'];

/**
 * The intent every tool declares — this table is the assertion. Thumbtack is
 * an anonymous directory of pros: nothing here is new, due or on for the
 * person, so every read is a lookup and none is canonical.
 */
const EXPECTED_INTENT: Record<string, string> = {
  thumbtack_search_pros: 'lookup',
  thumbtack_resolve_service: 'lookup',
  thumbtack_get_pro: 'lookup',
  thumbtack_get_pro_reviews: 'lookup',
  thumbtack_graphql: 'other',
};

describe('_meta.mint hints', () => {
  it('names every served tool, so a new tool cannot skip the decision', async () => {
    const names = (await served()).map((t) => t.name).filter((n) => n !== 'thumbtack_healthcheck');
    expect(names.sort()).toEqual(Object.keys(EXPECTED_INTENT).sort());
  });

  it('every tool except the healthcheck carries domain home and a valid intent', async () => {
    for (const t of await served()) {
      if (t.name.endsWith('_healthcheck')) {
        expect(t._meta?.mint, t.name).toBeUndefined();
        continue;
      }
      const m = t._meta?.mint;
      expect(m, t.name).toBeDefined();
      expect(Object.keys(m!).every((k) => KEYS.includes(k)), t.name).toBe(true);
      expect(DOMAINS).toContain(m!.domain);
      expect(m!.domain, t.name).toBe('home');
      expect(INTENTS).toContain(m!.intent);
      expect(m!.intent, t.name).toBe(EXPECTED_INTENT[t.name]);
    }
  });

  it('canonical only on read-only whats-new/due/on reads, at most one per intent', async () => {
    const tools = await served();
    const canonical = tools.filter((t) => t._meta?.mint?.canonical !== undefined);
    for (const t of canonical) {
      expect(t._meta!.mint!.canonical, t.name).toBe(true);
      expect(t.annotations?.readOnlyHint, t.name).toBe(true);
      expect(CANONICAL_INTENTS, t.name).toContain(t._meta!.mint!.intent);
      expect(t.inputSchema.properties, t.name).toHaveProperty('view');
    }
    for (const intent of CANONICAL_INTENTS) {
      expect(canonical.filter((t) => t._meta!.mint!.intent === intent).length, intent).toBeLessThanOrEqual(1);
    }
    // Nothing in a pro directory answers "what's new / due / on" for the person.
    expect(canonical).toEqual([]);
  });

  it('aliases are spoken words: at most 8, lowercase, at most 40 chars, never tool names', async () => {
    for (const t of await served()) {
      const aliases = t._meta?.mint?.aliases as string[] | undefined;
      if (aliases === undefined) continue;
      expect(aliases.length, t.name).toBeLessThanOrEqual(8);
      for (const a of aliases) {
        expect(a.length, `${t.name}: ${a}`).toBeLessThanOrEqual(40);
        expect(a, t.name).toBe(a.toLowerCase());
        expect(a, t.name).not.toMatch(/^thumbtack_/);
      }
    }
  });

  it('a declared subject or when names arguments the tool takes', async () => {
    for (const t of await served()) {
      const m = t._meta?.mint;
      if (m?.subject !== undefined) expect(t.inputSchema.properties, t.name).toHaveProperty(m.subject);
      if (m?.when !== undefined) {
        expect(t.inputSchema.properties, t.name).toHaveProperty(m.when.start);
        expect(t.inputSchema.properties, t.name).toHaveProperty(m.when.end);
      }
    }
  });

  it('declares no subject: Thumbtack has no listable set of the person’s subjects', async () => {
    for (const t of await served()) expect(t._meta?.mint?.subject, t.name).toBeUndefined();
  });

  it('gives the search the words a person says when they need a pro', async () => {
    const search = (await served()).find((t) => t.name === 'thumbtack_search_pros');
    expect(search?._meta?.mint?.aliases).toEqual(expect.arrayContaining(['plumber', 'electrician', 'house cleaner']));
  });
});
