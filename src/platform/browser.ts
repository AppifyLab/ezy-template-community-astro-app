/**
 * BROWSER-ONLY helpers for the visitor's own community session (platform
 * docs `auth.md`, `uploads.md`). Imported by page `<script>`s and the portal;
 * never by server code.
 *
 * - `appFetch`  calls an App path (`/api/...`) as the visitor: same-origin
 *               cookies, the `X-XSRF-TOKEN` header on writes (production
 *               answers 419 without it), and ONE shared token refresh on 401.
 * - `logout`    signs the visitor out of the community (there is no logout page).
 * - `storeFile` presign → PUT to the CDN (the Site API registers it).
 * - `xsrfHeader` the CSRF header a forwarded member write must carry.
 *
 * The auth cookies are HttpOnly: never try to read, set or delete them.
 */

let refreshing: Promise<boolean> | null = null;

function xsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** ONE refresh shared by every waiting call; never loops. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', {method: 'POST'})
    .then(
      res => res.ok,
      () => false
    )
    .finally(() => setTimeout(() => (refreshing = null), 3000));
  return refreshing;
}

export async function appFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const send = () => {
    const headers = new Headers(init.headers);
    const method = (init.method ?? 'GET').toUpperCase();
    const xsrf = xsrfToken();
    if (xsrf && method !== 'GET' && method !== 'HEAD') headers.set('X-XSRF-TOKEN', xsrf);
    return fetch(path, {...init, headers});
  };
  const res = await send();
  if (res.status !== 401) return res;
  return (await refreshSession()) ? send() : res;
}

/** Signs out of the community, then reloads so every page renders signed out. */
export async function logout(): Promise<void> {
  await appFetch('/api/auth/logout', {method: 'POST'}).catch(() => null);
  window.location.reload();
}

/** A file now in the community's storage, waiting to be registered by the Site API. */
export interface StoredFile {
  key: string;
  publicUrl: string;
  originalName: string;
}

/** The first `message` of the platform's `{errors: [{message}]}` body, if any. */
async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    errors?: {message?: string}[];
    message?: string;
  } | null;
  if (res.status === 401) return 'Sign in to upload files.';
  if (res.status === 402) return 'Uploads are not available for this community right now.';
  if (res.status === 429) return 'Too many uploads. Wait a minute and try again.';
  return body?.errors?.[0]?.message ?? body?.message ?? fallback;
}

/**
 * Puts ONE file straight from the browser into the community's storage:
 * presign (as the signed-in member) → `PUT` the bytes. It does NOT register
 * the file: `POST /site-api/uploads` does that on the server, as the same
 * member, and stores only what the platform confirms. Presign right before
 * the PUT: the signed URL expires quickly. Throws an Error fit to show.
 */
export async function storeFile(file: File): Promise<StoredFile> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const name = file.name.slice(0, 100);

  const presign = await appFetch('/api/gallery/uploads/presign', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({name, ext, size: file.size}),
  });
  if (!presign.ok) throw new Error(await errorMessage(presign, 'This file cannot be uploaded.'));
  const signed = (await presign.json()).data as {
    uploadUrl: string;
    headers: Record<string, string>;
    publicUrl: string;
    key: string;
  };

  // Straight to storage: no cookies, no CSRF header, exactly this Content-Type.
  const put = await fetch(signed.uploadUrl, {
    method: 'PUT',
    headers: {'Content-Type': signed.headers['Content-Type']},
    body: file,
  });
  if (!put.ok) throw new Error(`The upload failed (${put.status}). Try again.`);

  return {key: signed.key, publicUrl: signed.publicUrl, originalName: name};
}

/** The `XSRF-TOKEN` cookie's value, for a server route that forwards a member write. */
export function xsrfHeader(): Record<string, string> {
  const token = xsrfToken();
  return token ? {'x-xsrf-token': token} : {};
}
