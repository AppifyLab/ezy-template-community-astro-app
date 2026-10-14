import {SELF_FETCH_HEADER, siteOrigin} from './community';

/**
 * WHO IS VISITING, read on the server from the visitor's OWN session.
 *
 * The site and the EzyCommunity App share this hostname, so the visitor's
 * App cookies reach this Worker too. We forward the `cookie` header,
 * unchanged, to the App's `GET /api/auth/me` on the community's own host and
 * branch on the STATUS only (platform doc `auth.md`):
 *
 *   200 → signed in here: `member` (profile active) or `applicant` (pending /
 *         inactive: link to `/join`, show no member content)
 *   401 → access token missing or expired. If the refresh cookie is there the
 *         visitor is almost certainly still signed in: `returning`. The
 *         BROWSER refreshes (`src/lib/browser-session.ts`), never the server.
 *   403 / 404 / anything else → `guest`
 *
 * Never: call `/api/auth/refresh` from the server, set or rewrite an auth
 * cookie, set `x-forwarded-for` / `x-real-ip` / `ECOM_HOST`, or keep a viewer
 * in a module variable or a shared cache. A response built from it is private
 * (`Cache-Control: private, no-store`).
 *
 * The email in `/api/auth/me` is the VIEWER'S OWN. It is dropped here: no
 * page or Site API answer in this template needs it.
 */

export type ViewerState = 'member' | 'applicant' | 'returning' | 'guest';

export interface Viewer {
  state: ViewerState;
  /** The community profile (`profile.id`), when signed in. */
  profileId: number | null;
  /** `/profile/<slug>` in the App. */
  profileSlug: string | null;
  name: string | null;
  avatar: string | null;
  /** `profile.role.slug`: match against `/api/site/v1/roles`. Display only. */
  roleSlug: string | null;
}

export const GUEST: Viewer = {
  state: 'guest',
  profileId: null,
  profileSlug: null,
  name: null,
  avatar: null,
  roleSlug: null,
};

/** Access + refresh cookie names: `__Host-` prefixed in production, bare locally. */
const REFRESH_COOKIES = ['__Host-ecom_rt', 'ecom_rt'];

const PLATFORM_HEADERS = {
  accept: 'application/json',
  // Cloudflare answers 403 to a request with no User-Agent.
  'user-agent': 'Mozilla/5.0 (compatible; EzyCommunitySite/1.0; +https://ezycommunity.com)',
  [SELF_FETCH_HEADER]: '1',
};

function hasCookie(cookieHeader: string, names: string[]): boolean {
  return cookieHeader
    .split(';')
    .map(part => part.trim().split('=')[0])
    .some(name => names.includes(name));
}

/**
 * `fetch` an App path (`/api/...`) on the community's own host AS THE VISITOR:
 * their cookie header forwarded unchanged. Server code only. For writes, pass
 * the browser's own `x-xsrf-token` header through (see `auth.md`).
 */
export function fetchAsVisitor(
  request: Request,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(PLATFORM_HEADERS)) headers.set(name, value);
  headers.set('cookie', request.headers.get('cookie') ?? '');
  return fetch(`${siteOrigin(request.url)}${path}`, {...init, headers});
}

interface RawProfile {
  id?: number;
  slug?: string;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  avatar?: string | null;
  status?: string;
  role?: {slug?: string} | null;
}

/** The visitor, from their own cookies. Never throws: an unknown answer is a guest. */
export async function getViewer(request: Request): Promise<Viewer> {
  const cookie = request.headers.get('cookie') ?? '';
  if (!cookie) return GUEST;

  let res: Response;
  try {
    res = await fetchAsVisitor(request, '/api/auth/me');
  } catch {
    return GUEST;
  }

  if (res.status === 401) {
    return hasCookie(cookie, REFRESH_COOKIES) ? {...GUEST, state: 'returning'} : GUEST;
  }
  if (!res.ok) return GUEST;

  const body = (await res.json().catch(() => null)) as {data?: {profile?: RawProfile}} | null;
  const profile = body?.data?.profile;
  if (!profile?.id) return GUEST;

  const name =
    profile.displayName?.trim() ||
    [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim() ||
    'Member';

  return {
    state: profile.status === 'active' ? 'member' : 'applicant',
    profileId: profile.id,
    profileSlug: profile.slug ?? null,
    name,
    avatar: profile.avatar ?? null,
    roleSlug: profile.role?.slug ?? null,
  };
}

/**
 * The visitor's Role Manager codenames (`GET /api/auth/me/permissions`), for
 * showing or hiding things. The App's API enforces its own rules; a Site API
 * route that guards ITS OWN data (the contact inbox) checks this list.
 */
export async function getViewerPermissions(request: Request): Promise<Set<string>> {
  if (!request.headers.get('cookie')) return new Set();
  try {
    const res = await fetchAsVisitor(request, '/api/auth/me/permissions');
    if (!res.ok) return new Set();
    const body = (await res.json().catch(() => null)) as {
      permissions?: unknown;
      data?: {permissions?: unknown};
    } | null;
    const list = body?.data?.permissions ?? body?.permissions;
    return new Set(Array.isArray(list) ? list.filter(p => typeof p === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Does a permission list grant `codename`? Honours `*` wildcards (`community:*`). */
export function grants(permissions: Set<string>, codename: string): boolean {
  if (permissions.has(codename)) return true;
  const parts = codename.split(':');
  for (let i = parts.length - 1; i > 0; i--) {
    if (permissions.has(`${parts.slice(0, i).join(':')}:*`)) return true;
  }
  return permissions.has('*');
}
