import type {Viewer} from './types';
import {isPreview, PLATFORM_HEADERS, siteOrigin} from './api';
import {scoped} from './request-scope';

/**
 * WHO IS VISITING. This site has NO auth of its own: it borrows the
 * community's session. Sign-in, sign-up and joining always happen on the
 * community (`/login`, `/register`, `/join`); this file only reads the result.
 *
 * DEPLOYED (the real thing)
 *   The site and the community share the visitor's hostname, so the visitor's
 *   community cookies reach this Worker. We forward the `cookie` header,
 *   unchanged, to `GET /api/auth/me` on that same host and branch on the
 *   STATUS only (platform doc `auth.md`):
 *     200 → `member` (profile active) or `applicant` (pending / inactive)
 *     401 → `returning` if the refresh cookie is there (the BROWSER refreshes,
 *           `./browser.ts`), else `guest`
 *     403 / 404 / anything else → `guest`
 *
 * EDITOR PREVIEW (`config.preview`)
 *   The Preview has no visitor session at all: no cookie reaches the dev
 *   server and every App write answers 404. So that the owner can see and
 *   build member and admin screens, the Preview runs a STAND-IN viewer:
 *   a signed-in member who holds every permission (`preview: true`). Its
 *   writes land in the PREVIEW Database only, and platform reads use the
 *   editor's Community Key, server to server. Browser-only App calls
 *   (uploads, sign out) cannot run there; the UI says so. This branch can
 *   never run deployed: `config.preview` is never true on a live site.
 *
 * Never: call `/api/auth/refresh` from the server, set or rewrite an auth
 * cookie (`ecom_at` / `ecom_rt`, `__Host-` prefixed in production), set
 * `x-forwarded-for` / `x-real-ip` / `ECOM_HOST`, or keep a viewer in a module
 * variable or a shared cache. The email `/api/auth/me` carries is the
 * viewer's OWN and is dropped here: nothing in this template needs it.
 */

export const GUEST: Viewer = {
  state: 'guest',
  profileId: null,
  profileSlug: null,
  name: null,
  avatar: null,
  roleSlug: null,
  preview: false,
};

/** The editor Preview's stand-in: see the file header. */
export const PREVIEW_VIEWER: Viewer = {
  state: 'member',
  profileId: 0,
  profileSlug: null,
  name: 'Preview member',
  avatar: null,
  roleSlug: null,
  preview: true,
};

/**
 * FAST PATH: the visitor's auth cookies, by NAME only (they are HttpOnly
 * tokens we never parse, verify or store). No access or refresh cookie → a
 * guest, with no platform call at all. `__Host-` prefixed in production.
 */
const ACCESS_COOKIES = ['__Host-ecom_at', 'ecom_at'];
const REFRESH_COOKIES = ['__Host-ecom_rt', 'ecom_rt'];

function hasCookie(cookieHeader: string, names: string[]): boolean {
  return cookieHeader
    .split(';')
    .map(part => part.trim().split('=')[0])
    .some(name => names.includes(name));
}

/**
 * `fetch` an App path (`/api/...`) on the community's own host AS THE VISITOR:
 * their cookie header forwarded unchanged. Server code only. For a write,
 * pass the browser's own `x-xsrf-token` header through in `init.headers`.
 */
export function fetchAsVisitor(
  request: Request,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(PLATFORM_HEADERS)) headers.set(name, value);
  headers.set('cookie', request.headers.get('cookie') ?? '');
  return fetch(`${siteOrigin(request.url)}${path}`, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(8000),
  });
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

/**
 * The visitor. Never throws: an unknown answer is a guest. Looked up at most
 * once per request (`request-scope.ts`).
 */
export function getViewer(request: Request): Promise<Viewer> {
  return scoped('viewer', () => resolveViewer(request)) as Promise<Viewer>;
}

async function resolveViewer(request: Request): Promise<Viewer> {
  if (isPreview()) return PREVIEW_VIEWER;

  const cookie = request.headers.get('cookie') ?? '';
  const hasAccess = hasCookie(cookie, ACCESS_COOKIES);
  const hasRefresh = hasCookie(cookie, REFRESH_COOKIES);
  if (!hasAccess && !hasRefresh) return GUEST;
  // Access token gone, refresh token still there: the BROWSER refreshes.
  if (!hasAccess) return {...GUEST, state: 'returning'};

  let res: Response;
  try {
    res = await fetchAsVisitor(request, '/api/auth/me');
  } catch {
    return GUEST;
  }

  if (res.status === 401) return hasRefresh ? {...GUEST, state: 'returning'} : GUEST;
  if (!res.ok) return GUEST;

  const body = (await res.json().catch(() => null)) as {data?: {profile?: RawProfile}} | null;
  const profile = body?.data?.profile;
  if (!profile?.id) return GUEST;

  return {
    state: profile.status === 'active' ? 'member' : 'applicant',
    profileId: profile.id,
    profileSlug: profile.slug ?? null,
    name:
      profile.displayName?.trim() ||
      [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim() ||
      'Member',
    avatar: profile.avatar ?? null,
    roleSlug: profile.role?.slug ?? null,
    preview: false,
  };
}

/**
 * The visitor's Role Manager codenames (`GET /api/auth/me/permissions` →
 * `{data: {permissions: [...]}}`). In the Preview: everything (`*`). Once per
 * request; an applicant or guest gets an empty set.
 */
export function getViewerPermissions(request: Request): Promise<Set<string>> {
  return scoped('permissions', () => resolvePermissions(request)) as Promise<Set<string>>;
}

async function resolvePermissions(request: Request): Promise<Set<string>> {
  if (isPreview()) return new Set(['*']);
  if (!hasCookie(request.headers.get('cookie') ?? '', ACCESS_COOKIES)) return new Set();
  try {
    const res = await fetchAsVisitor(request, '/api/auth/me/permissions');
    if (!res.ok) return new Set();
    const body = (await res.json().catch(() => null)) as {data?: {permissions?: unknown}} | null;
    const list = body?.data?.permissions;
    return new Set(Array.isArray(list) ? list.filter(p => typeof p === 'string') : []);
  } catch {
    return new Set();
  }
}

/**
 * Does a permission list grant `codename`? Mirrors the platform's Role
 * Manager: the exact codename, or a wildcard parent (`community:site:*`,
 * `community:*`, `*`).
 */
export function grants(permissions: Set<string>, codename: string): boolean {
  if (permissions.has(codename) || permissions.has('*')) return true;
  const parts = codename.split(':');
  for (let i = parts.length - 1; i > 0; i--) {
    if (permissions.has(`${parts.slice(0, i).join(':')}:*`)) return true;
  }
  return false;
}
