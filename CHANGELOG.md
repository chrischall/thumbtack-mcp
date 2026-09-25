# Changelog

## [1.1.3](https://github.com/chrischall/thumbtack-mcp/compare/thumbtack-mcp-v1.1.2...thumbtack-mcp-v1.1.3) (2026-09-24)


### Bug Fixes

* **deps:** Bump dotenv in the production-dependencies group ([#67](https://github.com/chrischall/thumbtack-mcp/issues/67)) ([789daa3](https://github.com/chrischall/thumbtack-mcp/commit/789daa3b6fb0db0f12e4d9b5379c7d1f672661b5))

## [1.1.2](https://github.com/chrischall/thumbtack-mcp/compare/thumbtack-mcp-v1.1.1...thumbtack-mcp-v1.1.2) (2026-09-23)


### Bug Fixes

* **deps:** require zod ^4.6.5 to match @chrischall/mcp-utils 2.4.0 ([#64](https://github.com/chrischall/thumbtack-mcp/issues/64)) ([a035f84](https://github.com/chrischall/thumbtack-mcp/commit/a035f843632e48c3e77c4bb0b98df6104b309680))
* **deps:** upgrade @chrischall/mcp-utils to 2.4.0 and @fetchproxy/* to 3.2.0 ([#62](https://github.com/chrischall/thumbtack-mcp/issues/62)) ([f5a1038](https://github.com/chrischall/thumbtack-mcp/commit/f5a10384b859d74bbd8c97d22d3af7e59874b66b))

## [1.1.1](https://github.com/chrischall/thumbtack-mcp/compare/thumbtack-mcp-v1.1.0...thumbtack-mcp-v1.1.1) (2026-09-21)


### Bug Fixes

* **deps:** Bump dotenv from 17.4.2 to 18.0.0 ([#60](https://github.com/chrischall/thumbtack-mcp/issues/60)) ([1464685](https://github.com/chrischall/thumbtack-mcp/commit/146468536dfdf5f1302dab7da386aa55d068426d))
* **deps:** Bump zod in the production-dependencies group ([#59](https://github.com/chrischall/thumbtack-mcp/issues/59)) ([2d9a895](https://github.com/chrischall/thumbtack-mcp/commit/2d9a8956d7ceb18c494d2fc053fbc2fc7ff907da))

## [1.1.0](https://github.com/chrischall/thumbtack-mcp/compare/thumbtack-mcp-v1.0.0...thumbtack-mcp-v1.1.0) (2026-09-19)


### Features

* **deps:** take mcp-utils 1.0.0, restoring server/discover ([#55](https://github.com/chrischall/thumbtack-mcp/issues/55)) ([034dc12](https://github.com/chrischall/thumbtack-mcp/commit/034dc12767f905ac21f16308aba6a689067e7678))

## [1.0.0](https://github.com/chrischall/thumbtack-mcp/compare/thumbtack-mcp-v0.2.2...thumbtack-mcp-v1.0.0) (2026-09-19)


### ⚠ BREAKING CHANGES

* **mcp:** migrate server to SDK v2 ([#52](https://github.com/chrischall/thumbtack-mcp/issues/52))

### Features

* **mcp:** migrate server to SDK v2 ([#52](https://github.com/chrischall/thumbtack-mcp/issues/52)) ([8f4a407](https://github.com/chrischall/thumbtack-mcp/commit/8f4a4078184aaee0aef45173a931e04e93ad3390))

## [0.2.2](https://github.com/chrischall/thumbtack-mcp/compare/thumbtack-mcp-v0.2.1...thumbtack-mcp-v0.2.2) (2026-09-14)


### Bug Fixes

* **deps:** Bump the production-dependencies group with 2 updates ([#49](https://github.com/chrischall/thumbtack-mcp/issues/49)) ([49f19a6](https://github.com/chrischall/thumbtack-mcp/commit/49f19a60475b894096d75aaf521728e52add5dcd))

## [0.2.1](https://github.com/chrischall/thumbtack-mcp/compare/thumbtack-mcp-v0.2.0...thumbtack-mcp-v0.2.1) (2026-09-10)


### Bug Fixes

* **deps:** @chrischall/mcp-utils 0.26.1 ([#46](https://github.com/chrischall/thumbtack-mcp/issues/46)) ([2cb27ed](https://github.com/chrischall/thumbtack-mcp/commit/2cb27eda107b828d257075b8d9a24f91a5a2f1ae))
* **deps:** Bump hono from 4.13.1 to 4.13.7 ([#44](https://github.com/chrischall/thumbtack-mcp/issues/44)) ([ac60f80](https://github.com/chrischall/thumbtack-mcp/commit/ac60f8015e78c4b794334c52a276f718b1ac64ce))
* **deps:** declare the peer floors mcp-utils 0.26.1 requires ([#47](https://github.com/chrischall/thumbtack-mcp/issues/47)) ([57a9540](https://github.com/chrischall/thumbtack-mcp/commit/57a9540ef59fd6130cb227ff25e796056850bc9d))

## [0.2.0](https://github.com/chrischall/thumbtack-mcp/compare/thumbtack-mcp-v0.1.1...thumbtack-mcp-v0.2.0) (2026-09-04)


### Features

* **tools:** compact by default, on the projection this repo already had ([#32](https://github.com/chrischall/thumbtack-mcp/issues/32)) ([eb10aab](https://github.com/chrischall/thumbtack-mcp/commit/eb10aab4c91efe0f5469f36797e7192836eef328))

## [0.1.1](https://github.com/chrischall/thumbtack-mcp/compare/thumbtack-mcp-v0.1.0...thumbtack-mcp-v0.1.1) (2026-08-10)


### Bug Fixes

* **build:** declare repository.url so the provenance publish succeeds ([#10](https://github.com/chrischall/thumbtack-mcp/issues/10)) ([a4e77fb](https://github.com/chrischall/thumbtack-mcp/commit/a4e77fb79357c3b1ffcba37714dbb71526706597))

## 0.1.0 (2026-08-10)


### Features

* thumbtack MCP server and shell skill for anonymous pro discovery ([818e43e](https://github.com/chrischall/thumbtack-mcp/commit/818e43efa0c2156d60fa4935111b4b877d5fb37f))


### Bug Fixes

* **search:** make compact an opt-in flag, per fleet convention ([#6](https://github.com/chrischall/thumbtack-mcp/issues/6)) ([8520e3e](https://github.com/chrischall/thumbtack-mcp/commit/8520e3ed491a530a1bb9f13182349c2592ef4224))
