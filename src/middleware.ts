import {defineMiddleware} from 'astro:middleware';

import {SELF_FETCH_HEADER} from './platform/api';
import {inRequestScope} from './platform/request-scope';

/**
 * Runs before every page and every `/site-api` call:
 *
 * 1. Opens the request's memo (`src/platform/request-scope.ts`), so the visitor is looked
 *    up once per request.
 * 2. Stops a page from fetching ITSELF forever.
 *
 * Server code fetches the community API on the site's own origin
 * (`/api/...`). Deployed, the platform sends `/api` to the community app, so
 * the request never comes back here. On your own machine there is no app
 * behind `/api`: the fetch lands on this site's 404 page, which fetches the
 * brand again, which 404s again… Every server-side fetch carries
 * `SELF_FETCH_HEADER`, and a request that carries it is answered here with a
 * bare 404, before any page runs.
 */
export const onRequest = defineMiddleware((context, next) =>
  inRequestScope(() => {
    if (
      context.url.pathname.startsWith('/api/') &&
      context.request.headers.has(SELF_FETCH_HEADER)
    ) {
      return new Response(JSON.stringify({error: 'not_found'}), {
        status: 404,
        headers: {'content-type': 'application/json'},
      });
    }
    return next();
  })
);
