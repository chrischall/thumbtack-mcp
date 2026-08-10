import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestHarness, parseToolResult } from '@chrischall/mcp-utils/test';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerHealthcheckTools } from '../src/tools/healthcheck.js';
import type { ThumbtackClient } from '../src/client.js';

const searchHtml = readFileSync(new URL('./fixtures/search.html', import.meta.url).pathname, 'utf8');

let fake: { searchPage: ReturnType<typeof vi.fn>; graphql: ReturnType<typeof vi.fn> };
const harness = () =>
  createTestHarness((s: McpServer) => registerHealthcheckTools(s, fake as unknown as ThumbtackClient));

beforeEach(() => {
  fake = {
    searchPage: vi.fn().mockResolvedValue({ html: searchHtml, finalUrl: 'https://www.thumbtack.com/k/house-cleaning/near-me' }),
    graphql: vi.fn().mockResolvedValue({ __typename: 'Query' }),
  };
});

describe('thumbtack_healthcheck', () => {
  it('reports ok when both probes succeed', async () => {
    const h = await harness();
    const out = parseToolResult<any>(await h.callTool('thumbtack_healthcheck'));
    expect(out.ok).toBe(true);
    expect(out.searchPage.ok).toBe(true);
    expect(out.graphql.ok).toBe(true);
    expect(out.version).toMatch(/^\d+\.\d+\.\d+$/);
    await h.close();
  });

  it('reports the page probe as failed when the SSR shape drifts', async () => {
    fake.searchPage.mockResolvedValue({ html: '<html></html>', finalUrl: 'https://x' });
    const h = await harness();
    const out = parseToolResult<any>(await h.callTool('thumbtack_healthcheck'));
    expect(out.ok).toBe(false);
    expect(out.searchPage.ok).toBe(false);
    expect(out.searchPage.detail).toMatch(/shape/i);
    await h.close();
  });

  it('reports each probe independently when the page fetch throws', async () => {
    fake.searchPage.mockRejectedValue(new Error('boom'));
    const h = await harness();
    const out = parseToolResult<any>(await h.callTool('thumbtack_healthcheck'));
    expect(out.ok).toBe(false);
    expect(out.searchPage.ok).toBe(false);
    expect(out.graphql.ok).toBe(true);
    await h.close();
  });

  it('reports graphql failure when the query throws', async () => {
    fake.graphql.mockRejectedValue(new Error('nope'));
    const h = await harness();
    const out = parseToolResult<any>(await h.callTool('thumbtack_healthcheck'));
    expect(out.ok).toBe(false);
    expect(out.graphql.ok).toBe(false);
    await h.close();
  });

  it('marks graphql not-ok when it returns an unexpected typename', async () => {
    fake.graphql.mockResolvedValue({ __typename: 'Nope' });
    const h = await harness();
    const out = parseToolResult<any>(await h.callTool('thumbtack_healthcheck'));
    expect(out.graphql.ok).toBe(false);
    await h.close();
  });
});
