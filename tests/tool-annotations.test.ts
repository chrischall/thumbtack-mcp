import { describe, it, expect } from 'vitest';
import { registerProTools } from '../src/tools/pros.js';
import { registerHealthcheckTools } from '../src/tools/healthcheck.js';

/**
 * Fleet annotation meta-test (modelled on skylight-mcp). Reads the REGISTERED
 * config rather than a hand-kept list, so a tool added without annotations
 * fails here instead of publishing with the spec defaults (destructiveHint
 * and openWorldHint both default to TRUE when absent).
 */
interface Ann { readOnlyHint?: unknown; destructiveHint?: unknown; openWorldHint?: unknown }

function registeredAnnotations(): Record<string, Ann | undefined> {
  const seen: Record<string, Ann | undefined> = {};
  const server = {
    registerTool: (name: string, cfg: { annotations?: Ann }) => {
      seen[name] = cfg.annotations;
    },
  } as never;
  const client = {} as never;
  registerProTools(server, client);
  registerHealthcheckTools(server, client);
  return seen;
}

describe('every tool declares its annotations', () => {
  it('registers the full surface (guards against a registrar being dropped here)', () => {
    expect(Object.keys(registeredAnnotations())).toHaveLength(6);
  });

  it('sets an explicit boolean readOnlyHint on all of them', () => {
    const missing = Object.entries(registeredAnnotations())
      .filter(([, a]) => typeof a?.readOnlyHint !== 'boolean')
      .map(([name]) => name);
    expect(missing).toEqual([]);
  });

  it('sets an explicit boolean destructiveHint on every write', () => {
    const undeclared = Object.entries(registeredAnnotations())
      .filter(([, a]) => a?.readOnlyHint === false && typeof a?.destructiveHint !== 'boolean')
      .map(([name]) => name);
    expect(undeclared).toEqual([]);
  });

  it('never lets a read claim to be destructive', () => {
    const contradictory = Object.entries(registeredAnnotations())
      .filter(([, a]) => a?.readOnlyHint === true && a?.destructiveHint === true)
      .map(([name]) => name);
    expect(contradictory).toEqual([]);
  });

  it('sets an explicit boolean openWorldHint on all of them', () => {
    const missing = Object.entries(registeredAnnotations())
      .filter(([, a]) => typeof a?.openWorldHint !== 'boolean')
      .map(([name]) => name);
    expect(missing).toEqual([]);
  });

  it('is a read-only server: every tool is a read that reaches thumbtack.com', () => {
    // No write paths exist (they sit behind a reCAPTCHA-gated login), and every
    // tool — healthcheck included — fetches from Thumbtack over the network.
    for (const [name, a] of Object.entries(registeredAnnotations())) {
      expect(a, name).toMatchObject({ readOnlyHint: true, openWorldHint: true });
    }
  });
});
