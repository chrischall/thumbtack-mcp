/**
 * Guards on package.json fields that only fail at publish time.
 *
 * `npm publish --provenance` verifies the sigstore bundle against
 * `repository.url` and rejects the whole publish with a 422 when it is missing
 * or does not match the building repo. That failure surfaces only after a tag
 * and a GitHub Release already exist, so it is worth asserting here.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url).pathname, 'utf8'));
const REPO = 'chrischall/thumbtack-mcp';

describe('package.json publish requirements', () => {
  it('declares a repository url matching the GitHub repo (required by --provenance)', () => {
    expect(pkg.repository?.url).toBeTruthy();
    expect(pkg.repository.url).toContain(`github.com/${REPO}`);
  });

  it('publishes the scoped name with public access', () => {
    expect(pkg.name).toBe('@chrischall/thumbtack-mcp');
    expect(pkg.publishConfig?.access).toBe('public');
  });

  it('ships the skills directory on npm', () => {
    expect(pkg.files).toContain('skills');
  });
});
