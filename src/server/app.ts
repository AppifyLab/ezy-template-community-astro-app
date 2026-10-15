import {env} from 'cloudflare:workers';
import {Hono} from 'hono';
import {csrf} from 'hono/csrf';

import type {Abilities} from '../lib/types';
import {problem, withViewer} from './guards';
import {isPreview} from './platform';
import {jobRoutes, MANAGE_JOBS} from './routes/jobs';
import {memberRoutes} from './routes/members';
import {postRoutes} from './routes/posts';
import {siteRoutes} from './routes/site';
import {uploadRoutes} from './routes/uploads';
import {getViewerPermissions, grants} from './viewer';

/**
 * The Site API: this site's ONLY backend, one Hono app at `/site-api/*`.
 *
 * Everything reads and writes through it: the Astro pages call it IN-PROCESS
 * (`src/server/backend.ts`), the portal calls it from the browser (typed `hc`,
 * `src/portal/api.ts`). Mounted by ONE catch-all page,
 * `src/pages/site-api/[...path].ts`. One Worker serves the pages, this API and
 * the portal: one build, one deploy.
 *
 *   GET  /health        what this site has been given (booleans only)
 *   GET  /me            the visitor + what they may do here
 *   GET  /site          the community's brand                 routes/site.ts
 *   *    /posts/...     the community's blog (public API)      routes/posts.ts
 *   *    /jobs/...      the job board (Site Database)          routes/jobs.ts
 *   GET  /members      members directory (Community Key)      routes/members.ts
 *   *    /uploads       a member's files (Site Database)       routes/uploads.ts
 *
 * Add a feature as a new `routes/<name>.ts` and one `.route()` line below,
 * CHAINED so `AppType` carries every route to the typed client. Errors are
 * JSON `{error, message}`. `csrf()` refuses cross-site form posts; keep it
 * unless a route must accept them (a webhook).
 */
export const app = new Hono()
  .basePath('/site-api')
  .use(csrf())

  .get('/health', c =>
    c.json({
      ok: true,
      preview: isPreview(),
      database: Boolean(env.DATABASE_URL),
      communityKey: Boolean(env.EZY_COMMUNITY_KEY),
    })
  )

  // `abilities` only decides what the UI SHOWS; every guarded route checks again.
  .get('/me', withViewer, async c => {
    const viewer = c.var.viewer;
    const permissions =
      viewer.state === 'member' ? await getViewerPermissions(c.req.raw) : new Set<string>();
    const abilities: Abilities = {manageJobs: grants(permissions, MANAGE_JOBS)};
    return c.json({viewer, abilities});
  })

  .route('/site', siteRoutes)
  .route('/posts', postRoutes)
  .route('/jobs', jobRoutes)
  .route('/members', memberRoutes)
  .route('/uploads', uploadRoutes)

  .notFound(c => c.json(problem('not_found', 'No such Site API route.'), 404))
  .onError((err, c) => {
    // The message only: an error object can carry request details.
    console.error(`site-api ${c.req.method} ${c.req.path}: ${err.message}`);
    return c.json(problem('internal_error', 'Something went wrong.'), 500);
  });

export type AppType = typeof app;
