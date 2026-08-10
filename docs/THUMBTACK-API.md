# Thumbtack API — verified request shapes

Captured and verified live on **2026-08-10**. Every shape below was confirmed
with a real request; nothing here is inferred from documentation.

## Surface survey (why this repo is built the way it is)

| Surface | Reachable server-side? | Auth | Verdict |
| --- | --- | --- | --- |
| `developers.thumbtack.com` Partner Platform | n/a | Partner credentials via "Request Access" | **Unusable** — seller/partner surface, not consumer-authable |
| `www.thumbtack.com` SSR pages | ✅ plain `curl`, HTTP 200 | none | **Primary anonymous surface** |
| `app.thumbtack.com/graphql` | ✅ plain `curl`, HTTP 200 | none for public reads | **Primary anonymous surface** (ad-hoc queries accepted) |
| Signed-in account (projects/messages/quotes) | ❌ login is reCAPTCHA-gated | session cookie | **Browser-bridge only** — see below |

### The login is reCAPTCHA-gated — there is no server-side password login

`GET /login` renders a real form:

```
POST /user/login   (application/x-www-form-urlencoded)
  csrf_token=<from TT_CSRF_TOKEN on the login page>
  login_email=<email>
  login_password=<password>
  remember_me=on
```

but posting it with a valid CSRF token and credentials returns:

```json
{"success":false,"error":"Human verification code missing\nPlease try again at a later time\n"}
```
HTTP 400. The login page carries `"recaptchaSiteKey":"6LeUcx0UAAAAAD5r8_HlLr4M77iuL-Lj3Mo-VKYJ"`
and a `RecaptchaRender` hook; the token is injected by JS at submit time, so
**a `THUMBTACK_EMAIL`/`THUMBTACK_PASSWORD` login cannot work server-side.**

Consequence: per the fleet auth preference order this drops from option 1
(server-side login) to **option 2 (fetchproxy bootstrap)** — capture the
session from a signed-in tab once, then fetch with it. It also means the
signed-in half of this server **cannot be hosted on mcp-host**.

> ⚠️ Never auto-retry a rejected credential against `/user/login` — Thumbtack
> counts attempts and escalates. The probe above was run exactly once, with a
> deliberately nonexistent `@example.com` address, never a real account.

## Anonymous surface 1 — SSR search pages

```
GET https://www.thumbtack.com/k/<service-slug>/near-me?zip_code=<zip>
```
`-L` is required: loose slugs redirect to the canonical one
(`/k/plumbing/…` → `/k/plumbers/…`), and the **final URL is how you resolve a
service name to its canonical slug**.

Results live in the `__NEXT_DATA__` script tag (standard Next.js, plain JSON):

```
.props.pageProps.frontDoorPage.proListSection.proListResults[]
```

Verified fields per result:

| Path | Meaning |
| --- | --- |
| `servicePk` | stable pro/service id |
| `url` | profile path (relative) |
| `businessSummaryPrefab.businessSummary.businessName` | display name |
| `…businessSummary.reviewSummaryPrefab.reviewSummary.averageRating.rating` | 0–5 rating |
| `…reviewSummary.numReviews` | review count |
| `…businessSummary.isOnline` | pro currently online |
| `numHires` | lifetime hires on Thumbtack |
| `rankingAverageResponseTimeInHours` | mean response time (float hours) |
| `businessFacts[].description` | human-readable facts ("1619 hires on Thumbtack") |
| `priceInfo` | price estimate block (shape varies by category) |
| `urgencySignalPills[].text` | e.g. "In high demand" |

Sibling keys on `proListSection`: `filterQuestions[]` (the category's filter
schema), `structuredData[]` (schema.org mirror), `inputToken` (opaque cursor
for the GraphQL "load more").

**Page size is 10 and the SSR page carries no next-page cursor of its own** —
deeper paging requires the GraphQL surface below.

## Anonymous surface 2 — SSR pro profile pages

```
GET https://www.thumbtack.com/<state>/<city>/<category>/<slug>/service/<servicePk>
```

Pro pages do **not** use `__NEXT_DATA__`. They carry two stores:

1. `window.__APOLLO_STATE__ = {…}` — a bare JS assignment, **not** a script
   tag, so it needs brace-matching to extract (see `skills/thumbtack/tt-extract.mjs`).
   Verified: the matched text is valid JSON and `JSON.parse`s directly.
   The payload hangs off a **dynamic** `ROOT_QUERY` key of the form
   `servicePage({...full input json...})`, so address it by prefix:
   `.ROOT_QUERY | to_entries | map(select(.key|startswith("servicePage")))[0].value`

   `sections[]` (11 verified) — `__typename` values:
   `ServicePageBreadcrumbsSection`, `ServicePageHeaderSection`,
   `ServicePageActionCardV2PreContactSection`, `ServicePageBusinessInfoSection`,
   `ServicePageSecondaryCtasV2Section`, `ServicePageSpecialtiesSection`,
   `ServicePageMediaSection`, `ServicePageReviewsSection`,
   `ServicePageCredentialsSection`, `ServicePageQuestionsSection`,
   `ServicePageInternalLinksSection`.

2. `<script type="application/ld+json">` — a `@graph` with a single
   business node. **Much simpler and `jq`-able**; prefer it when you
   only need name / description / address / `aggregateRating` / `review[]`.
   Note `review` is an array **of arrays** of `Review` nodes.

   ⚠️ **`@type` is the trade-specific schema.org subtype, not `LocalBusiness`.**
   A cleaner's page says `"@type":"LocalBusiness"`; a plumber's says
   `"@type":"Plumber"`. There is a subtype per trade (`Electrician`,
   `HousePainter`, …), so **never filter on `@type == "LocalBusiness"`** —
   it returns nothing for most trades. Match by shape instead: the business
   node is the `@graph` entry carrying a `name` plus an `aggregateRating` or
   an `address`. (Found by a live probe against a real plumber profile; a
   house-cleaner fixture had hidden it, because that one *is* `LocalBusiness`.)

## Anonymous surface 3 — GraphQL (`app.thumbtack.com/graphql`)

The endpoint accepts **ad-hoc anonymous queries** — no persisted-query hash,
no auth, no CSRF for public reads. Verified:

```sh
curl -sS -X POST https://app.thumbtack.com/graphql \
  -H 'content-type: application/json' -H 'origin: https://www.thumbtack.com' \
  -d '{"query":"query{__typename}"}'
# {"data":{"__typename":"Query"}}
```

**Introspection is disabled** (`{"errors":[{"message":"badRequest","path":["__schema"]}]}`),
so field names must come from an `__APOLLO_STATE__` dump of a real page.

`servicePage` requires the *full* input object — a partial input returns
`badRequest` even though the query itself validates. Recover the exact input
from the page's own Apollo key (the 26 verified input fields are
`categoryPK, googleReserveMerchantId, googleReserveToken,
hasFilterAnswersOnLanding, hasNonNbwFilterAnswersOnLanding, isNearMePage,
isOrganicExternalTraffic, keywordPk, multimodalDiagnosisPk, multimodalQueryPk,
pageUrl, proListRequestPk, projectPk, relevantServiceCategoryPks, requestPK,
searchFormAnswers, searchFormPk, searchQuery, servicePK, servicePageToken,
supportedIntroTypes, supportedMediaTypes, supportedSections, userQueryPk,
utmParameters, zipCode`), then re-issue:

```graphql
query SP($input: ServicePageInput!) {
  servicePage(input: $input) { __typename shareableURL hasVerifiedPhoneNumber sections { __typename } }
}
```

Verified 200 with the full input replayed.

> Error convention: this API answers **HTTP 200 with an `errors[]` body**, so
> never gate on status alone — check `.errors`.

## Signed-in surface — NOT YET CAPTURED

Blocked on a bridge capture session (Transporter + a signed-in tab). Nothing
about projects/messages/quotes is recorded here yet, and no code should assume
a shape until it is. Do not guess these.
