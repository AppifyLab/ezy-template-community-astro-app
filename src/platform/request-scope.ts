import {AsyncLocalStorage} from 'node:async_hooks';

/**
 * ONE request's memo: the visitor and their permissions are looked up at most
 * once per incoming request, however many pages, layouts and in-process Site
 * API calls ask for them. `src/middleware.ts` opens a scope around every
 * request; everything awaited inside it (including `backend()` calls, which
 * run Hono in the same async chain) shares it.
 *
 * Scoped to the request by `AsyncLocalStorage` (the Cloudflare adapter turns
 * on `nodejs_als`), so one visitor's data can never reach another request.
 * Never move these into a module variable.
 */
export interface Scope {
  viewer?: Promise<unknown>;
  permissions?: Promise<unknown>;
}

const storage = new AsyncLocalStorage<Scope>();

export function inRequestScope<T>(fn: () => T): T {
  return storage.run({}, fn);
}

/** `make()` once per request for `key`; outside a scope, every call runs it. */
export function scoped<T>(key: keyof Scope, make: () => Promise<T>): Promise<T> {
  const scope = storage.getStore();
  if (!scope) return make();
  return (scope[key] ??= make()) as Promise<T>;
}
