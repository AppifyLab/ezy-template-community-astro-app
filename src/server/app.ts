import {env} from 'cloudflare:workers';
import {Hono} from 'hono';
import {csrf} from 'hono/csrf';
import {createMiddleware} from 'hono/factory';
import {validator} from 'hono/validator';

import type {PrismaClient} from '../generated/prisma/client';
import {CommunityApiError, communityGet, CommunityKeyMissing} from './community';
import {getDb} from './db';

/**
 * The Site API: this site's own backend, a Hono app at `/site-api/*`.
 *
 * Mounted by ONE catch-all page, `src/pages/site-api/[...path].ts`. `/site-api`
 * is reserved for your site forever: the community app never claims it.
 * Routes are CHAINED so `AppType` carries every route to the typed `hc` client
 * (`src/portal/api.ts`). Errors are JSON. `csrf()` refuses cross-site form
 * posts; keep it unless a route must accept them (a webhook).
 */

type Problem = {error: string; message: string};

const problem = (error: string, message: string): Problem => ({error, message});

const NO_DATABASE = problem(
  'site_database_disabled',
  'This site has no Site Database yet. The community owner can turn it on with “Enable Site Database” on the Custom code page.'
);

/** Hands the route a Site Database client, or answers 503 when there is none. */
const withDb = createMiddleware<{Variables: {db: PrismaClient}}>(async (c, next) => {
  const db = getDb();
  if (!db) return c.json(NO_DATABASE, 503);
  c.set('db', db);
  await next();
});

const PAGE_SIZE = 20;

const noteSelect = {id: true, body: true, author: true, createdAt: true} as const;

export const app = new Hono()
  .basePath('/site-api')
  .use(csrf())

  // What this site has been given. Booleans only: never echo a secret.
  .get('/health', c =>
    c.json({
      ok: true,
      database: Boolean(env.DATABASE_URL),
      communityKey: Boolean(env.EZY_COMMUNITY_KEY),
    })
  )

  // Site Database: newest first, 20 a page; `?before=<id>` for the next page.
  .get('/notes', withDb, async c => {
    const before = Number(c.req.query('before'));
    const rows = await c.var.db.note.findMany({
      select: noteSelect,
      where: Number.isInteger(before) && before > 0 ? {id: {lt: before}} : undefined,
      orderBy: {id: 'desc'},
      take: PAGE_SIZE + 1,
    });
    const notes = rows.slice(0, PAGE_SIZE);
    return c.json({notes, nextBefore: rows.length > PAGE_SIZE ? notes.at(-1)!.id : null});
  })

  .post(
    '/notes',
    validator('json', (value, c) => {
      const body = typeof value?.body === 'string' ? value.body.trim() : '';
      const author = typeof value?.author === 'string' ? value.author.trim() : '';
      if (!body || body.length > 500) {
        return c.json(problem('invalid_note', 'A note needs 1 to 500 characters.'), 422);
      }
      if (author.length > 80) {
        return c.json(problem('invalid_note', 'A name is at most 80 characters.'), 422);
      }
      return {body, author: author || null};
    }),
    withDb,
    async c => {
      const note = await c.var.db.note.create({data: c.req.valid('json'), select: noteSelect});
      return c.json({note}, 201);
    }
  )

  .get('/notes/:id', withDb, async c => {
    const id = Number(c.req.param('id'));
    const note = Number.isSafeInteger(id)
      ? await c.var.db.note.findUnique({where: {id}, select: noteSelect})
      : null;
    return note ? c.json({note}, 200) : c.json(problem('not_found', 'No such note.'), 404);
  })

  // The platform's API as the Community (Community Key): the community's name
  // and logo. Re-projected field by field, so nothing the API adds later leaks.
  .get('/community', async c => {
    try {
      const raw = await communityGet<Record<string, unknown>>(c.req.url, '/site/initial-data');
      const community = raw
        ? {name: String(raw.name ?? ''), logo: (raw.logo as string | null) ?? null}
        : null;
      return c.json({community}, 200);
    } catch (err) {
      if (err instanceof CommunityKeyMissing) {
        return c.json(
          problem('community_key_missing', 'This site has no Community Key here.'),
          503
        );
      }
      if (err instanceof CommunityApiError) {
        return c.json(problem('community_api_error', err.message), 502);
      }
      throw err;
    }
  })

  .notFound(c => c.json(problem('not_found', 'No such Site API route.'), 404))
  .onError((err, c) => {
    // The message only: an error object can carry request details.
    console.error(`site-api ${c.req.method} ${c.req.path}: ${err.message}`);
    return c.json(problem('internal_error', 'Something went wrong.'), 500);
  });

export type AppType = typeof app;
