import {env} from 'cloudflare:workers';

/**
 * The ONLY file that reads the platform's environment. The names on the left
 * of each line are the hosting platform's contract (it sets them; you cannot
 * rename or add them); everything else in this project uses `config`.
 *
 *   siteUrl       the community's platform origin, a plain var. Used in the
 *                 editor Preview and on your machine (see `siteOrigin`).
 *   preview       true ONLY in the editor Preview (never on a live site; site
 *                 owners cannot set this name).
 *   communityKey  secret: the Community Key, for `/api/site/v1/...`.
 *   databaseUrl   secret: the Site Database (the Preview Database in the editor).
 *
 * Server code only. Never send a value to the browser, log it, or write it to
 * a file.
 */
export const config = {
  get siteUrl(): string | null {
    return env.EZY_SITE_URL?.replace(/\/+$/, '') || null;
  },
  get preview(): boolean {
    return env.EZY_PREVIEW === '1';
  },
  get communityKey(): string | null {
    return env.EZY_COMMUNITY_KEY || null;
  },
  get databaseUrl(): string | null {
    return env.DATABASE_URL || null;
  },
};
