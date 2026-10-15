import {config} from './config';

/**
 * The ONE place this site calls the community platform, server side.
 * Every call goes to the community's OWN hostname (the only host a deployed
 * Site may reach) and carries a `User-Agent` (Cloudflare 403s without one).
 *
 *   publicGet(url, path)      `/api/public/...`, no credential (signed-out view)
 *   communityGet(url, path)   `/api/site/v1/...` as the COMMUNITY, with the
 *                             Community Key (`config.communityKey`): read-only,
 *                             member level, never emails or payment data
 *   fetchAsVisitor(req, path) `/api/...` as the VISITOR (./viewer.ts)
 *
 * Server code only: `env` never reaches the browser, the key is never logged.
 */

/** The header our own server-side fetches carry; see `src/middleware.ts`. */
export const SELF_FETCH_HEADER = 'x-site-self-fetch';

export const PLATFORM_HEADERS: Record<string, string> = {
  accept: 'application/json',
  'user-agent': 'Mozilla/5.0 (compatible; CommunitySite/1.0)',
  [SELF_FETCH_HEADER]: '1',
};

/** True only in the editor Preview (`config.preview`). */
export function isPreview(): boolean {
  return config.preview;
}

/** `localhost`, `127.0.0.1`, `[::1]`, `*.localhost`: your own machine. */
function isLocalHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]'
  );
}

/**
 * Where to call the platform: the community's own origin.
 *
 * - DEPLOYED: the visitor's own host (the request's origin). A deployed Site
 *   may only reach the hostname it was visited on, which is the custom domain
 *   when the community has one, so this is the only origin that always works.
 * - Editor PREVIEW and your own machine: `config.siteUrl` (the platform sets it
 *   in the Preview; locally it comes from `.env`). The request's host there is
 *   the dev server, which has no platform API behind `/api`.
 */
export function siteOrigin(requestUrl: string | URL): string {
  const own = new URL(requestUrl);
  const configured = config.siteUrl;
  if ((isPreview() || isLocalHost(own.hostname)) && configured) return configured;
  return own.origin;
}

/** The site has no Community Key (e.g. on your own machine without one). */
export class CommunityKeyMissing extends Error {}

/** The platform did not answer, or answered with an error status. */
export class PlatformError extends Error {
  constructor(readonly status: number | null) {
    super(status ? `The community API answered ${status}.` : 'The community API did not answer.');
  }
}

/** How long one platform call may take before the page renders without it. */
const TIMEOUT_MS = 8000;

async function getData<T>(url: string, headers: Record<string, string>): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(url, {headers, signal: AbortSignal.timeout(TIMEOUT_MS)});
  } catch {
    throw new PlatformError(null);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new PlatformError(res.status);
  const body = (await res.json().catch(() => null)) as {data?: T} | null;
  return body?.data ?? null;
}

/**
 * PUBLIC answers kept in this Worker isolate's memory for a few seconds, so a
 * busy page does not ask the platform for the same brand and posts on every
 * request. Best-effort: each isolate has its own copy, it vanishes on any
 * restart, and there is no shared cache (no KV, no Redis) for a Site. Public
 * data ONLY: never a visitor's answer, never a Community Key answer gated by
 * a session. One Site Worker serves one community, so nothing crosses tenants.
 */
const PUBLIC_CACHE = new Map<string, {at: number; value: unknown}>();
const PUBLIC_CACHE_MAX = 200;

/**
 * `GET <origin>/api/public<path>`: the `data` of the answer, `null` on 404.
 * `ttlSeconds` > 0 serves a recent identical answer from memory instead.
 * Only RESOLVED answers are kept: a Worker must not await a fetch another
 * request started.
 */
export async function publicGet<T>(
  requestUrl: string | URL,
  path: string,
  {ttlSeconds = 0}: {ttlSeconds?: number} = {}
): Promise<T | null> {
  const url = `${siteOrigin(requestUrl)}/api/public${path}`;
  if (ttlSeconds <= 0) return getData<T>(url, PLATFORM_HEADERS);

  const hit = PUBLIC_CACHE.get(url);
  if (hit && Date.now() - hit.at < ttlSeconds * 1000) return hit.value as T | null;

  // A failure throws and is never kept: the next request asks again.
  const value = await getData<T>(url, PLATFORM_HEADERS);
  if (PUBLIC_CACHE.size >= PUBLIC_CACHE_MAX) {
    PUBLIC_CACHE.delete(PUBLIC_CACHE.keys().next().value!);
  }
  PUBLIC_CACHE.set(url, {at: Date.now(), value});
  return value;
}

/**
 * `GET <origin>/api/site/v1<path>` with the Community Key: the `data` of the
 * answer, `null` on 404. A path is the public one without `/public` and its
 * module version: `/api/public/site/v1/initial-data` → `/site/initial-data`.
 * The key is the community, NOT the visitor: gate member-only results on the
 * visitor's own session first (`requireMember`).
 */
export function communityGet<T>(requestUrl: string | URL, path: string): Promise<T | null> {
  const key = config.communityKey;
  if (!key) throw new CommunityKeyMissing();
  return getData<T>(`${siteOrigin(requestUrl)}/api/site/v1${path}`, {
    ...PLATFORM_HEADERS,
    authorization: `Bearer ${key}`,
  });
}
