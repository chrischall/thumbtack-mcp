/** Liveness probe for the anonymous Thumbtack surface. */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { messageOf, textResult, toolAnnotations, truncateErrorMessage } from '@chrischall/mcp-utils';
import type { ThumbtackClient } from '../client.js';
import { extractNextData } from '../parse.js';
import { proListOf } from '../normalize.js';
import { VERSION } from '../version.js';

export function registerHealthcheckTools(server: McpServer, client: ThumbtackClient): void {
  server.registerTool(
    'thumbtack_healthcheck',
    {
      description:
        "Check that Thumbtack's anonymous surface is reachable and still has the response shape this server expects. Reports the server version, the HTML page probe and the GraphQL probe separately.",
      annotations: toolAnnotations({ title: 'Healthcheck' }),
      inputSchema: {},
    },
    async () => {
      const checks: Record<string, unknown> = { version: VERSION };

      try {
        const page = await client.searchPage('house cleaning', '10001');
        const results = proListOf(extractNextData(page.html));
        checks.searchPage =
          results === null
            ? { ok: false, detail: 'page fetched but proListResults was not where it was verified to be — the SSR shape may have changed' }
            : { ok: true, pros: results.length, finalUrl: page.finalUrl };
      } catch (err) {
        checks.searchPage = { ok: false, detail: truncateErrorMessage(messageOf(err)) };
      }

      try {
        const data = await client.graphql('query{__typename}');
        checks.graphql = { ok: (data as { __typename?: string })?.__typename === 'Query', data };
      } catch (err) {
        checks.graphql = { ok: false, detail: truncateErrorMessage(messageOf(err)) };
      }

      const ok = Object.values(checks).every((c) => typeof c !== 'object' || c === null || (c as { ok?: boolean }).ok !== false);
      return textResult({ ok, ...checks });
    },
  );
}
