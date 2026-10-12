import {env} from 'cloudflare:workers';

/**
 * Reads the platform's API AS THE COMMUNITY, with the Community Key
 * (`EZY_COMMUNITY_KEY`), from `/api/site/v1/...` on the community's own host.
 *
 * What the key may read: what an ordinary member sees (public reads plus the
 * members directory), never an email address or payment data. Read-only.
 * A path is the public one without `/public` and its module version:
 * `/api/public/site/v1/initial-data` → `/api/site/v1/site/initial-data`.
 * Member-only content is now in your hands: show it only to visitors who are
 * signed-in members.
 *
 * Server code only. The key never reaches the browser and is never logged.
 */
export const COMMUNITY_API = '/api/site/v1';

/** The header our own server-side fetches carry; see `src/middleware.ts`. */
export const SELF_FETCH_HEADER = 'x-ezy-site-fetch';

/** The site has no Community Key (e.g. on your own machine without one). */
export class CommunityKeyMissing extends Error {}

/** The community API did not answer, or answered with an error status. */
export class CommunityApiError extends Error {
  constructor(readonly status: number | null) {
    super(status ? `The community API answered ${status}.` : 'The community API did not answer.');
  }
}

/** The community's origin: `EZY_SITE_URL`, else the request's own origin. */
export function siteOrigin(requestUrl: string | URL): string {
  const configured = env.EZY_SITE_URL;
  return configured ? configured.replace(/\/+$/, '') : new URL(requestUrl).origin;
}

/**
 * `GET <origin>/api/site/v1<path>` with the Community Key: the `data` of the
 * response. Throws `CommunityKeyMissing` when the site has no key, and
 * `CommunityApiError` when the API cannot be reached or answers an error.
 */
export async function communityGet<T>(requestUrl: string | URL, path: string): Promise<T | null> {
  const key = env.EZY_COMMUNITY_KEY;
  if (!key) throw new CommunityKeyMissing();

  let res: Response;
  try {
    res = await fetch(`${siteOrigin(requestUrl)}${COMMUNITY_API}${path}`, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${key}`,
        // Cloudflare answers 403 to a request with no User-Agent.
        'user-agent': 'Mozilla/5.0 (compatible; EzyCommunitySite/1.0; +https://ezycommunity.com)',
        [SELF_FETCH_HEADER]: '1',
      },
    });
  } catch {
    throw new CommunityApiError(null);
  }
  if (!res.ok) throw new CommunityApiError(res.status);
  const body = (await res.json()) as {data?: T};
  return body?.data ?? null;
}
