import {createMiddleware} from 'hono/factory';

import type {PrismaClient} from '../generated/prisma/client';
import type {Viewer} from '../lib/types';
import {CommunityKeyMissing, PlatformError} from './platform';
import {getDb} from './db';
import {getViewer, getViewerPermissions, grants} from './viewer';

/**
 * The Site API's building blocks. Combine them in THIS order:
 *
 *   validator → withViewer → requireMember → requirePermission(codename) → withDb
 *
 * so a bad input is refused before any platform call, a guest before any
 * permission lookup, and nobody without access learns whether a database exists.
 */

export type Problem = {error: string; message: string};

export const problem = (error: string, message: string): Problem => ({error, message});

/**
 * Who is visiting (`c.var.viewer`). Any answer built from it is private to
 * that visitor: `Cache-Control: private, no-store`.
 */
export const withViewer = createMiddleware<{Variables: {viewer: Viewer}}>(async (c, next) => {
  c.set('viewer', await getViewer(c.req.raw));
  await next();
  c.header('Cache-Control', 'private, no-store');
});

/** Signed-in, ACTIVE members only. Applicants and guests get a JSON 401/403. */
export const requireMember = createMiddleware<{Variables: {viewer: Viewer}}>(async (c, next) => {
  const {state} = c.var.viewer;
  if (state === 'member') return next();
  if (state === 'applicant') {
    return c.json(problem('not_a_member', 'Your membership is not active yet.'), 403);
  }
  return c.json(problem('signed_out', 'Sign in to the community first.'), 401);
});

/**
 * Visitors whose Role Manager codenames grant `codename`. For guarding THIS
 * site's own data; the App's API enforces its own rules on its own data.
 */
export const requirePermission = (codename: string) =>
  createMiddleware(async (c, next) => {
    if (!grants(await getViewerPermissions(c.req.raw), codename)) {
      return c.json(problem('forbidden', 'You do not have access to this.'), 403);
    }
    await next();
  });

const NO_DATABASE = problem(
  'site_database_disabled',
  'This site has no Site Database yet. The community owner can turn it on with “Enable Site Database” on the Custom code page.'
);

/** A Site Database client (`c.var.db`), or 503 when the site has none yet. */
export const withDb = createMiddleware<{Variables: {db: PrismaClient}}>(async (c, next) => {
  const db = getDb();
  if (!db) return c.json(NO_DATABASE, 503);
  c.set('db', db);
  await next();
});

/** Maps a failed platform read to a JSON answer, or rethrows anything else. */
export function platformProblem(err: unknown): {status: 502 | 503; body: Problem} {
  if (err instanceof CommunityKeyMissing) {
    return {status: 503, body: problem('community_key_missing', 'This site has no Community Key here.')};
  }
  if (err instanceof PlatformError) {
    return {status: 502, body: problem('community_api_error', err.message)};
  }
  throw err;
}
