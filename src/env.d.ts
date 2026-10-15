/**
 * What the platform hands the deployed Worker, read with
 * `import {env} from 'cloudflare:workers'` in SERVER code only.
 *
 *   EZY_SITE_URL       a plain var: the community's platform origin
 *                      (`https://<community>.<platform domain>`). Used in the Preview
 *                      and locally; deployed, the request's own origin wins
 *                      (see `siteOrigin` in src/platform/api.ts).
 *   EZY_PREVIEW        `'1'` ONLY in the editor Preview (no visitor session
 *                      there: see src/platform/viewer.ts). Never set when deployed.
 *   DATABASE_URL       a secret: the Site Database (the Preview Database in the
 *                      editor). Empty until the owner enables the Site Database.
 *   EZY_COMMUNITY_KEY  a secret: the Community Key, for `/api/site/v1/...`.
 *
 * Never send a secret to the browser, log it, or write it to a file.
 */
declare namespace Cloudflare {
  interface Env {
    EZY_SITE_URL?: string;
    EZY_PREVIEW?: string;
    DATABASE_URL?: string;
    EZY_COMMUNITY_KEY?: string;
  }
}

/** Typed `env` for `import {env} from 'cloudflare:workers'`. */
declare module 'cloudflare:workers' {
  export const env: Cloudflare.Env;
}
