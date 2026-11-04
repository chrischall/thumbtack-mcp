/**
 * `_meta.mint` hints (the mcp-host context-groups contract): which canonical
 * group a tool belongs to, what kind of ask it answers, and everyday words its
 * name and description lack. Inert data to any other client.
 *
 * Thumbtack is an anonymous directory of local pros — nothing in it is new,
 * due or on for the person — so every read is a `lookup` and none is
 * canonical. There is no listable set of the person's subjects, so no tool
 * declares `subject`.
 */
export type MintIntent =
  | 'whats-new' | 'whats-due' | 'whats-on' | 'lookup' | 'turn-on-off' | 'send' | 'change' | 'other';

export interface MintHint {
  domain: 'home';
  intent: MintIntent;
  aliases?: string[];
}

/** `_meta` for a Thumbtack tool: every tool here is in the `home` group. */
export function homeMeta(intent: MintIntent, aliases?: string[]): { mint: MintHint } {
  return { mint: { domain: 'home', intent, ...(aliases !== undefined ? { aliases } : {}) } };
}

/** What a person says when they need a pro. Lowercase, ≤ 8, each ≤ 40 chars. */
export const FIND_A_PRO_ALIASES = [
  'find a pro',
  'hire someone',
  'plumber',
  'electrician',
  'house cleaner',
  'handyman',
  'contractor',
  'near me',
];

/** What a person says when vetting one pro. */
export const VET_A_PRO_ALIASES = ['ratings', 'reviews', 'licensed', 'background check', 'is this pro any good'];
