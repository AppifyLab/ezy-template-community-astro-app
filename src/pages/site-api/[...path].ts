import type {APIRoute} from 'astro';

import {app} from '../../server/app';

/**
 * The ONE route that mounts the Site API: every method on `/site-api/*` goes
 * to the Hono app in `src/server/app.ts`. Rendered on request, never at build.
 */
export const prerender = false;

export const ALL: APIRoute = ({request}) => app.fetch(request);
