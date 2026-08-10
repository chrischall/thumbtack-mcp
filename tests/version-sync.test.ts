import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { versionSyncTest } from '@chrischall/mcp-utils/test';

describe('version sync', () => {
  it('every version-carrying file matches package.json', () => {
    const problems = versionSyncTest({
      srcDir: fileURLToPath(new URL('../src', import.meta.url)),
      pkgPath: fileURLToPath(new URL('../package.json', import.meta.url)),
    });
    expect(problems).toEqual([]);
  });
});
