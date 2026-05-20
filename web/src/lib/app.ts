import { initPro } from '@proappstore/sdk'

// The SDK's default `dataApiBase` is `https://data-{appId}.proappstore.online`
// but the platform's current provisioner deploys the per-app data Worker at
// the `workers.dev` hostname only — the data-* subdomain DNS records aren't
// created. Sibling app carsads has the same workaround; see
// platform/PLATFORM-NOTES.md.
export const app = initPro({
  appId: 'dating',
  dataApiBase: 'https://pas-data-dating.serge-the-dev.workers.dev',
})
