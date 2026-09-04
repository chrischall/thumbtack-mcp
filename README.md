# thumbtack-mcp

Unofficial [Thumbtack](https://www.thumbtack.com) MCP server — search local
service pros, and read their profiles, ratings, reviews and credentials.

**Read-only and anonymous.** Thumbtack's consumer pages and its GraphQL
endpoint answer without a login, so this server needs no account, no API key
and no browser extension. It also cannot write: Thumbtack's write paths sit
behind a reCAPTCHA-gated login that no server-side client can pass.

> Thumbtack has no public consumer API. This server reads its server-rendered
> pages and anonymous GraphQL endpoint, and may break or violate their ToS.
> Developed and maintained by AI (Claude). Use at your own discretion.

## Install

```jsonc
// .mcp.json
{ "mcpServers": { "thumbtack": { "command": "npx", "args": ["-y", "@chrischall/thumbtack-mcp"] } } }
```

No configuration — there are no environment variables.

## Tools

| Tool | What it does |
| --- | --- |
| `thumbtack_search_pros` | Search pros by trade + US ZIP. Returns up to 10 with rating, review count, lifetime hires, mean response time, profile URL. |
| `thumbtack_resolve_service` | Canonicalise a loose service name (`plumbing` → `plumbers`) by asking Thumbtack. |
| `thumbtack_get_pro` | A pro's profile: name, description, location, aggregate rating, credentials, section inventory. |
| `thumbtack_get_pro_reviews` | Reviews on a pro's profile — stars, author, date, text. |
| `thumbtack_graphql` | Escape hatch for arbitrary read-only GraphQL. Mutations refused. |
| `thumbtack_healthcheck` | Probes the page and GraphQL surfaces separately and reports the response shape still matches. |

Every read tool takes `view: "compact" | "full"`, and **`compact` is the
default**. On `thumbtack_search_pros` that is a hand-written field projection;
on `thumbtack_get_pro`, `thumbtack_get_pro_reviews` and `thumbtack_graphql` it
strips image URLs, which needs no knowledge of the payload's shape. Pass
`view: "full"` for the untouched upstream records — they are large and mostly
tracking metadata, which is why the slim shape is what you get without asking.

`thumbtack_resolve_service` and `thumbtack_healthcheck` take no `view`: both
already answer with a handful of scalar fields, and a rung that cannot change
anything is worse than no parameter.

## Shell-only alternative

`skills/thumbtack/` is a self-contained skill covering the same surface with
plain `curl` + `jq` — no server process. Use it for one-shot lookups and
scripts.

## How it works

Three verified surfaces, all pinned in [`docs/THUMBTACK-API.md`](docs/THUMBTACK-API.md):

1. **Search pages** — results embedded in `__NEXT_DATA__`.
2. **Profile pages** — `window.__APOLLO_STATE__` (a bare JS assignment, so it
   needs balanced-brace extraction) plus schema.org JSON-LD.
3. **GraphQL** (`app.thumbtack.com/graphql`) — accepts ad-hoc anonymous
   queries; introspection is disabled.

Two things that bite anyone reading these pages:

- **JSON-LD `@type` is the trade-specific subtype**, not `LocalBusiness` — a
  plumber's node is `"@type":"Plumber"`. Match by shape, not by type name.
- **GraphQL returns HTTP 200 with an `errors[]` body.** Status alone is never
  sufficient.

## Not covered

- **Your own Thumbtack account** (projects, messages, quotes) — the login is
  reCAPTCHA-gated, so there is no server-side password login.
- **The Partner Platform API** (`developers.thumbtack.com`) — real and
  documented, but gated behind partner credentials ("Request Access"). It is a
  seller surface, not a consumer one.

## Development

```sh
npm install
npm run build
npm test            # unit + server-boot smoke tests
npm run test:coverage
```

Coverage is enforced at 100%.

## License

MIT
