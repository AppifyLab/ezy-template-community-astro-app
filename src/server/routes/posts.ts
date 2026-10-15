import {Hono} from 'hono';
import {validator} from 'hono/validator';

import {sanitizeHtml} from '../../platform/sanitize';
import type {Post, PostAuthor, PostsPage, PostSummary, PostTerm} from '../../lib/types';
import {publicGet} from '../../platform/api';

/**
 * The community's blog, from the PUBLIC API (`/api/public/blog/...`):
 *
 *   GET /site-api/posts?page=&search=&perPage=   published posts, newest first
 *   GET /site-api/posts/:slug                    one post (HTML sanitized here)
 *   GET /site-api/posts/:slug/related            up to 3 related posts
 *
 * Paging is by page number with `hasMore`; the platform gives no total.
 */

interface RawAuthor {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  avatar?: string | null;
}

const list = <T>(value: unknown): T[] => (Array.isArray(value) ? value : []);

function toAuthor(raw: RawAuthor): PostAuthor {
  const name =
    raw.displayName?.trim() ||
    [raw.firstName, raw.lastName].filter(Boolean).join(' ').trim() ||
    'Unknown author';
  return {id: Number(raw.id), name, avatar: raw.avatar ?? null};
}

const toTerm = (raw: PostTerm): PostTerm => ({id: raw.id, name: raw.name, slug: raw.slug});

function toSummary(raw: Record<string, unknown>): PostSummary {
  return {
    id: Number(raw.id),
    title: String(raw.title ?? ''),
    slug: String(raw.slug ?? ''),
    excerpt: (raw.excerpt as string | null) ?? null,
    coverUrl: (raw.coverUrl as string | null) ?? null,
    publishedAt: (raw.publishedAt as string | null) ?? null,
    authors: list<RawAuthor>(raw.authors).map(toAuthor),
    categories: list<PostTerm>(raw.categories).map(toTerm),
    tags: list<PostTerm>(raw.tags).map(toTerm),
  };
}

const listQuery = validator('query', value => {
  const num = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isSafeInteger(n) && n > 0 ? n : fallback;
  };
  return {
    page: num(value.page, 1),
    perPage: Math.min(50, num(value.perPage, 10)),
    search: typeof value.search === 'string' ? value.search.trim().slice(0, 100) : '',
  };
});

export const postRoutes = new Hono()
  .get('/', listQuery, async c => {
    const {page, perPage, search} = c.req.valid('query');
    const params = new URLSearchParams({page: String(page), per_page: String(perPage)});
    if (search) params.set('search', search);
    const raw = await publicGet<{data?: unknown; meta?: {hasMore?: boolean; lastPage?: number}}>(
      c.req.url,
      `/blog/post/all-posts?${params}`,
      {ttlSeconds: 30}
    ).catch(() => null);
    const result: PostsPage = {
      posts: list<Record<string, unknown>>(raw?.data).map(toSummary),
      page,
      hasMore: Boolean(raw?.meta?.hasMore ?? (raw?.meta?.lastPage ?? 1) > page),
    };
    return c.json(result);
  })

  .get('/:slug', async c => {
    const raw = await publicGet<Record<string, unknown>>(
      c.req.url,
      `/blog/post/${encodeURIComponent(c.req.param('slug'))}/read`,
      {ttlSeconds: 30}
    ).catch(() => null);
    if (!raw) return c.json({error: 'not_found', message: 'No such post.'}, 404);
    // Sanitized HERE, so no page can render the raw editor HTML by mistake.
    const post: Post = {...toSummary(raw), content: sanitizeHtml(String(raw.content ?? ''))};
    return c.json({post});
  })

  .get('/:slug/related', async c => {
    const raw = await publicGet<{posts?: unknown}>(
      c.req.url,
      `/blog/post/${encodeURIComponent(c.req.param('slug'))}/related`,
      {ttlSeconds: 60}
    ).catch(() => null);
    return c.json({posts: list<Record<string, unknown>>(raw?.posts).slice(0, 3).map(toSummary)});
  });
