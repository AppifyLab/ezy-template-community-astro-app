import {env} from 'cloudflare:workers';
import {Hono} from 'hono';
import {csrf} from 'hono/csrf';
import {createMiddleware} from 'hono/factory';
import {validator} from 'hono/validator';

import type {PrismaClient} from '../generated/prisma/client';
import {CommunityApiError, communityGet, CommunityKeyMissing} from './community';
import {getDb} from './db';
import {getViewer, getViewerPermissions, grants, type Viewer} from './viewer';

/**
 * The Site API: this site's own backend, a Hono app at `/site-api/*`.
 *
 * Mounted by ONE catch-all page, `src/pages/site-api/[...path].ts`. `/site-api`
 * is reserved for your site forever: the community app never claims it.
 * Routes are CHAINED so `AppType` carries every route to the typed `hc` client
 * (`src/portal/api.ts`). Errors are JSON `{error, message}`. `csrf()` refuses
 * cross-site form posts; keep it unless a route must accept them (a webhook).
 *
 * Three ways this server reads the platform (see AGENTS.md):
 *   - as the VISITOR: their cookies forwarded to `/api/auth/me` (`withViewer`)
 *   - as the COMMUNITY: the Community Key, `/api/site/v1/...` (`communityGet`)
 *   - its OWN data: the Site Database (`withDb`)
 */

type Problem = {error: string; message: string};

const problem = (error: string, message: string): Problem => ({error, message});

const NO_DATABASE = problem(
  'site_database_disabled',
  'This site has no Site Database yet. The community owner can turn it on with “Enable Site Database” on the Custom code page.',
);

/** The codename that may read the contact inbox: the community's site admins. */
export const INBOX_PERMISSION = 'community:site:read';

const PAGE_SIZE = 20;

/** Hands the route a Site Database client, or answers 503 when there is none. */
const withDb = createMiddleware<{Variables: {db: PrismaClient}}>(async (c, next) => {
  const db = getDb();
  if (!db) return c.json(NO_DATABASE, 503);
  c.set('db', db);
  await next();
});

/**
 * Reads the visitor from their own cookies (`src/server/viewer.ts`). Any answer
 * built from it is private to that visitor: never cached by anyone.
 */
const withViewer = createMiddleware<{Variables: {viewer: Viewer}}>(async (c, next) => {
  c.set('viewer', await getViewer(c.req.raw));
  await next();
  c.header('Cache-Control', 'private, no-store');
});

/** Signed-in, ACTIVE members only. Applicants and guests get a JSON 401/403. */
const requireMember = createMiddleware<{Variables: {viewer: Viewer}}>(async (c, next) => {
  const {state} = c.var.viewer;
  if (state === 'member') return next();
  if (state === 'applicant') {
    return c.json(problem('not_a_member', 'Your membership is not active yet.'), 403);
  }
  return c.json(problem('signed_out', 'Sign in to the community first.'), 401);
});

/**
 * Visitors whose Role Manager codenames include `codename` (after
 * `requireMember`). For guarding THIS site's own data; the App's API enforces
 * its own rules on its own data.
 */
const requirePermission = (codename: string) =>
  createMiddleware(async (c, next) => {
    if (!grants(await getViewerPermissions(c.req.raw), codename)) {
      return c.json(problem('forbidden', 'You do not have access to this.'), 403);
    }
    await next();
  });

/** A Community Key read that maps its two failures to JSON answers. */
async function keyRead<T>(
  requestUrl: string,
  path: string,
): Promise<{ok: true; data: T | null} | {ok: false; status: 502 | 503; body: Problem}> {
  try {
    return {ok: true, data: await communityGet<T>(requestUrl, path)};
  } catch (err) {
    if (err instanceof CommunityKeyMissing) {
      return {
        ok: false,
        status: 503,
        body: problem('community_key_missing', 'This site has no Community Key here.'),
      };
    }
    if (err instanceof CommunityApiError) {
      return {ok: false, status: 502, body: problem('community_api_error', err.message)};
    }
    throw err;
  }
}

/** A positive integer cursor from `?before=`, or undefined. */
function cursorOf(value: string | undefined): number | undefined {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

const noteSelect = {id: true, body: true, author: true, createdAt: true} as const;
const uploadSelect = {
  id: true,
  url: true,
  originalName: true,
  fileType: true,
  fileSize: true,
  createdAt: true,
} as const;
const messageSelect = {
  id: true,
  name: true,
  email: true,
  message: true,
  profileId: true,
  createdAt: true,
} as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** `?before=<id>`: the keyset cursor of every list here (typed for `hc`). */
const pageQuery = validator('query', value => ({
  before: typeof value.before === 'string' ? value.before : undefined,
}));

/** `?cursor=&search=` for the members directory (typed for `hc`). */
const membersQuery = validator('query', value => ({
  cursor: typeof value.cursor === 'string' ? value.cursor : undefined,
  search: typeof value.search === 'string' ? value.search : undefined,
}));

export const app = new Hono()
  .basePath('/site-api')
  .use(csrf())

  // What this site has been given. Booleans only: never echo a secret.
  .get('/health', c =>
    c.json({
      ok: true,
      database: Boolean(env.DATABASE_URL),
      communityKey: Boolean(env.EZY_COMMUNITY_KEY),
    }),
  )

  // ---- The visitor -------------------------------------------------------

  // Who is visiting, without the email. `canReadInbox` only decides what the
  // portal SHOWS; the inbox route checks the permission again itself.
  .get('/me', withViewer, async c => {
    const viewer = c.var.viewer;
    const canReadInbox =
      viewer.state === 'member' && grants(await getViewerPermissions(c.req.raw), INBOX_PERMISSION);
    return c.json({viewer, canReadInbox});
  })

  // ---- Contact (public form, admin inbox) ----------------------------------

  .post(
    '/contact',
    validator('json', (value, c) => {
      const text = (key: string) =>
        typeof value?.[key] === 'string' ? (value[key] as string).trim() : '';
      // `website` is a honeypot: hidden from people, filled by bots.
      if (text('website')) return {spam: true as const};
      const name = text('name');
      const email = text('email').toLowerCase();
      const message = text('message');
      if (!name || name.length > 80) {
        return c.json(
          problem('invalid_contact', 'Please enter your name (up to 80 characters).'),
          422,
        );
      }
      if (!EMAIL.test(email) || email.length > 254) {
        return c.json(problem('invalid_contact', 'Please enter a valid email address.'), 422);
      }
      if (message.length < 10 || message.length > 2000) {
        return c.json(problem('invalid_contact', 'A message needs 10 to 2000 characters.'), 422);
      }
      return {spam: false as const, name, email, message};
    }),
    withDb,
    withViewer,
    async c => {
      const input = c.req.valid('json');
      // A bot gets the same answer as a person, and nothing is stored.
      if (input.spam) return c.json({ok: true}, 201);
      const viewer = c.var.viewer;
      await c.var.db.contactMessage.create({
        data: {
          name: input.name,
          email: input.email,
          message: input.message,
          profileId: viewer.state === 'member' ? viewer.profileId : null,
        },
        select: {id: true},
      });
      return c.json({ok: true}, 201);
    },
  )

  // The inbox: site admins only. Contact emails are shown HERE and nowhere
  // else. Newest first, 20 a page; `?before=<id>` for the next page.
  .get(
    '/contact',
    pageQuery,
    withViewer,
    requireMember,
    requirePermission(INBOX_PERMISSION),
    withDb,
    async c => {
      const before = cursorOf(c.req.valid('query').before);
      const rows = await c.var.db.contactMessage.findMany({
        select: messageSelect,
        where: before ? {id: {lt: before}} : undefined,
        orderBy: {id: 'desc'},
        take: PAGE_SIZE + 1,
      });
      const messages = rows.slice(0, PAGE_SIZE);
      return c.json({
        messages,
        nextBefore: rows.length > PAGE_SIZE ? messages.at(-1)!.id : null,
      });
    },
  )

  // ---- Uploads (members) ----------------------------------------------------

  // The visitor's OWN uploads, newest first.
  .get('/uploads', pageQuery, withViewer, requireMember, withDb, async c => {
    const before = cursorOf(c.req.valid('query').before);
    const rows = await c.var.db.upload.findMany({
      select: uploadSelect,
      where: {profileId: c.var.viewer.profileId!, ...(before ? {id: {lt: before}} : {})},
      orderBy: {id: 'desc'},
      take: PAGE_SIZE + 1,
    });
    const uploads = rows.slice(0, PAGE_SIZE);
    return c.json({uploads, nextBefore: rows.length > PAGE_SIZE ? uploads.at(-1)!.id : null});
  })

  // Records a file the BROWSER already uploaded (presign → PUT → register, see
  // `src/portal/platform.ts`): the bytes never pass through this server.
  .post(
    '/uploads',
    validator('json', (value, c) => {
      const url = typeof value?.url === 'string' ? value.url.trim() : '';
      const originalName =
        typeof value?.originalName === 'string' ? value.originalName.trim().slice(0, 100) : '';
      const fileType = typeof value?.fileType === 'string' ? value.fileType.slice(0, 20) : 'file';
      const fileSize = Number(value?.fileSize);
      let valid = false;
      try {
        valid = new URL(url).protocol === 'https:' && url.length <= 1000;
      } catch {
        valid = false;
      }
      if (!valid || !originalName || !Number.isSafeInteger(fileSize) || fileSize < 0) {
        return c.json(problem('invalid_upload', 'That upload could not be recorded.'), 422);
      }
      return {url, originalName, fileType, fileSize};
    }),
    withViewer,
    requireMember,
    withDb,
    async c => {
      const upload = await c.var.db.upload.create({
        data: {...c.req.valid('json'), profileId: c.var.viewer.profileId!},
        select: uploadSelect,
      });
      return c.json({upload}, 201);
    },
  )

  // ---- The community, read with the Community Key ---------------------------

  // The community's name and logo. Re-projected field by field.
  .get('/community', async c => {
    const read = await keyRead<Record<string, unknown>>(c.req.url, '/site/initial-data');
    if (!read.ok) return c.json(read.body, read.status);
    const raw = read.data;
    const community = raw
      ? {name: String(raw.name ?? ''), logo: (raw.logo as string | null) ?? null}
      : null;
    return c.json({community});
  })

  // The members directory, for signed-in members only: the key reads as the
  // COMMUNITY, so the visitor's own session decides who may see it. No email
  // is ever in this answer (the key cannot read one, and we re-project).
  .get('/members', membersQuery, withViewer, requireMember, async c => {
    const params = new URLSearchParams({type: 'community', limit: '24'});
    const {cursor, search: rawSearch} = c.req.valid('query');
    if (cursor) params.set('cursor', cursor);
    const search = rawSearch?.trim();
    if (search) params.set('search', search.slice(0, 50));

    const read = await keyRead<{
      data?: Record<string, unknown>[];
      meta?: {nextCursor?: string | null; hasNextPage?: boolean};
    }>(c.req.url, `/team/members/list?${params}`);
    if (!read.ok) return c.json(read.body, read.status);

    const members = (read.data?.data ?? []).map(raw => ({
      id: Number(raw.id),
      slug: String(raw.slug ?? ''),
      name:
        String(raw.displayName ?? '').trim() ||
        [raw.firstName, raw.lastName].filter(Boolean).join(' ').trim() ||
        'Member',
      avatar: (raw.avatar as string | null) ?? null,
      role: ((raw.role as {name?: string} | null)?.name as string | undefined) ?? null,
    }));
    return c.json({
      members,
      nextCursor: read.data?.meta?.hasNextPage ? (read.data.meta.nextCursor ?? null) : null,
    });
  })

  // ---- Notes: a minimal Site Database example ------------------------------

  .get('/notes', pageQuery, withDb, async c => {
    const before = cursorOf(c.req.valid('query').before);
    const rows = await c.var.db.note.findMany({
      select: noteSelect,
      where: before ? {id: {lt: before}} : undefined,
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
    },
  )

  .get('/notes/:id', withDb, async c => {
    const id = Number(c.req.param('id'));
    const note = Number.isSafeInteger(id)
      ? await c.var.db.note.findUnique({where: {id}, select: noteSelect})
      : null;
    return note ? c.json({note}, 200) : c.json(problem('not_found', 'No such note.'), 404);
  })

  .notFound(c => c.json(problem('not_found', 'No such Site API route.'), 404))
  .onError((err, c) => {
    // The message only: an error object can carry request details.
    console.error(`site-api ${c.req.method} ${c.req.path}: ${err.message}`);
    return c.json(problem('internal_error', 'Something went wrong.'), 500);
  });

export type AppType = typeof app;
