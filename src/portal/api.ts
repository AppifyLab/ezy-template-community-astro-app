import {hc} from 'hono/client';

import type {AppType} from '../server/app';

/**
 * The typed Site API client for the browser: same origin, so the visitor's
 * cookies ride along and `hono/csrf` sees a same-origin request. Only the TYPE
 * of the server app is imported — no server code reaches the browser.
 */
export const api = hc<AppType>('/')['site-api'];

/** The JSON body of a Site API response, or an Error carrying its message. */
export async function read<T>(response: Promise<Response>): Promise<T> {
  const res = await response;
  const body = (await res.json().catch(() => null)) as (T & {message?: string}) | null;
  if (!res.ok) throw new Error(body?.message ?? `Request failed (${res.status})`);
  return body as T;
}
