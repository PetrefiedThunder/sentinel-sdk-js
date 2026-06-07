# Generated API types

`api.d.ts` is **auto-generated** from the Sentinel API's OpenAPI schema (`https://api.pauseapi.app/openapi.json`). Do not edit it by hand.

## Regenerate

```bash
npm run gen:types
```

That runs `openapi-typescript` against the live API. Commit the diff if anything changed.

## How to use

```ts
import type { Schemas } from 'sentinel-oversight/dist/generated/index.js';

type Approval = Schemas['ApprovalCreate'];
```

Or pull the wider `paths` / `operations` shapes if you need request/response types for a specific endpoint.

## Why

The hand-rolled types in `src/index.ts` work, but drift when the API changes. The generated module is the source of truth — when the API adds a field, you get a TypeScript compile error here, not a runtime bug at the customer.

Future: migrate the hand-rolled types in `src/index.ts` to references off `Schemas`. Tracked separately.
