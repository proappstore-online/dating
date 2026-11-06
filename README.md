# Dating

Swipe, match and chat on [ProAppStore](https://dating.proappstore.online/).

Run `pnpm install`, then `pnpm dev`. `pnpm build` runs the app tests and
compliance check before building. Push to `main` deploys through the platform.

### Referral readiness

Dating uses platform-cookie authentication and SDK referral capture. Deployment
opts into the platform's referral-readiness check: the uploaded build is served
in an isolated browser/host/backend environment, using synthetic identities and
an isolated ledger. Production referral credits are never seeded by this check.
The pinned platform revision is recorded in `scripts/referral-platform.json`.
A failed check leaves recruitment unavailable. See the platform
[readiness contract](https://docs.proappstore.online/promoter-readiness/).
