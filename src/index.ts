#!/usr/bin/env node
import { runMcp } from '@chrischall/mcp-utils';
import { client } from './client.js';
import { registerProTools } from './tools/pros.js';
import { registerHealthcheckTools } from './tools/healthcheck.js';
import { VERSION } from './version.js';

// The client holds no credentials and does no IO at construction, so the
// server always boots and answers the host's install-time tools/list probe.
await runMcp({
  name: 'thumbtack',
  version: VERSION,
  deps: client,
  tools: [registerProTools, registerHealthcheckTools],
  banner:
    '[thumbtack-mcp] Unofficial Thumbtack MCP. Thumbtack has no public consumer API; this reads its ' +
    'server-rendered pages and anonymous GraphQL endpoint, and may break or violate their ToS. ' +
    'Read-only. Developed and maintained by AI (Claude). Use at your own discretion.',
});
