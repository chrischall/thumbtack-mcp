/**
 * Spawns the REAL built artifacts and drives an `initialize` + `tools/list`
 * handshake:
 *   - `dist/bundle.js` in a temp dir with NO node_modules — the `.mcpb` runtime,
 *     where an eager import of an externalised dep would crash at load.
 *   - `dist/index.js` with node_modules — the `bin` entry a host launches.
 * Unit tests (which mock everything) see neither failure.
 */
import { spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repo = fileURLToPath(new URL('..', import.meta.url));

async function handshake(entry: string, cwd: string): Promise<string[]> {
  const child = spawn(process.execPath, [entry], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  const send = (msg: unknown) => child.stdin.write(JSON.stringify(msg) + '\n');
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '0' } } });
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });

  let buf = '';
  let stderr = '';
  child.stderr.on('data', (d) => (stderr += String(d)));
  try {
    return await new Promise<string[]>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout; stderr:\n${stderr}`)), 20_000);
      child.stdout.on('data', (d) => {
        buf += String(d);
        for (const line of buf.split('\n')) {
          if (!line.trim()) continue;
          let msg: { id?: number; result?: { tools?: { name: string }[] } };
          try { msg = JSON.parse(line); } catch { continue; }
          if (msg.id === 2 && msg.result?.tools) {
            clearTimeout(timer);
            resolve(msg.result.tools.map((t) => t.name));
          }
        }
      });
      child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`exited ${code}; stderr:\n${stderr}`)); });
    });
  } finally {
    child.kill();
  }
}

describe('server boot', () => {
  it('the bundle starts and lists tools with NO node_modules present', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'thumbtack-mcpb-'));
    copyFileSync(join(repo, 'dist/bundle.js'), join(dir, 'bundle.js'));
    const tools = await handshake(join(dir, 'bundle.js'), dir);
    // >=, not an exact count: PR CI runs the branch merged with main, so a
    // hardcoded length breaks the moment another PR adds a tool.
    expect(tools.length).toBeGreaterThanOrEqual(6);
    expect(tools).toContain('thumbtack_search_pros');
  }, 30_000);

  it('the bin entry starts and lists tools', async () => {
    const tools = await handshake(join(repo, 'dist/index.js'), repo);
    expect(tools).toContain('thumbtack_healthcheck');
  }, 30_000);
});
