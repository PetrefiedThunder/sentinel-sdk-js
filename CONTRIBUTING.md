# Contributing to Sentinel (JavaScript / TypeScript SDK)

Thanks for considering a contribution.

## Quick start

```bash
git clone https://github.com/PetrefiedThunder/sentinel-sdk-js
cd sentinel-sdk-js
npm install
npm run build
npm test
```

To run the live smoke test against a real API key:

```bash
SENTINEL_API_KEY=sk_live_... npm run smoke
```

## Filing a bug

Open an issue at https://github.com/PetrefiedThunder/sentinel-sdk-js/issues
and include:

1. SDK version (`node -e "console.log(require('sentinel-oversight/package.json').version)"`)
2. Node version (`node --version`)
3. Minimal reproducible example
4. Full error / stack trace

## Pull requests

1. Open an issue first if it's a behavior change.
2. Small, focused PRs.
3. Add a unit test (`tests/*.test.mjs`) and update the live smoke
   (`tests/smoke.mjs`) if the change is end-to-end.
4. `npm test` and `npm run build` must pass.
5. Update `CHANGELOG.md` under `## [Unreleased]`.

## Releasing (maintainers only)

1. Bump `version` in `package.json` + `VERSION` in `src/index.ts`.
2. Move `## [Unreleased]` into a versioned section in `CHANGELOG.md`.
3. Commit, tag `vX.Y.Z`, push. GitHub Actions publishes to npm via
   Trusted Publishing (OIDC) — no token needed.

## Security

Email security@regengine.co — don't file a public issue.

## Code of conduct

Be excellent. Harassment / discrimination → removed from the project.
