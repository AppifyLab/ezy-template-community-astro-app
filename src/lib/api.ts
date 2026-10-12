/**
 * The community's PUBLIC API (what a signed-out visitor sees), read on the
 * SERVER by the Astro pages. For member-level reads as the Community, use the
 * Community Key in `src/server/community.ts` instead.
 *
 * WHY server-side:
 * A deployed Site Worker may fetch only the community's own hostname (and its
 * Site Database); everything else is blocked. The pages fetch here, in their
 * frontmatter, and the browser only ever receives HTML.
 *
 * WHERE the hostname comes from:
 * `EZY_SITE_URL` is the community's own site origin (e.g.
 * `https://intel.ezycommunity.com`). The platform hands it to the deployed
 * Worker; `npm run dev` reads it from `.env` (see `.env.example`). When it is
 * missing we fall back to the incoming request's origin, which is the same
 * hostname in production anyway. Every fetch carries `SELF_FETCH_HEADER`, so
 * a fetch that lands back on this site locally cannot loop (`src/middleware.ts`).
 *
 * WHY the browser-ish headers:
 * The community hostname sits behind Cloudflare, which answers 403 to a request
 * with no `User-Agent`.
 *
 * WHY every payload is re-projected below:
 * The functions here return hand-built objects, never the raw JSON. The API
 * response is the platform's to change; anything it adds later (a member email
 * on an author row, say) must NOT start silently appearing in a page. Email
 * addresses are private — that is why `toAuthor` picks fields by name.
 */
import {SELF_FETCH_HEADER, siteOrigin} from '../server/community';

export interface Site {
  id: number;
  name: string;
  favIcon: string | null;
  logo: string | null;
}

export interface PostAuthor {
  id: number;
  /** Already joined. Never an email — see the file header. */
  name: string;
  avatar: string | null;
}

export interface PostTerm {
  id: number;
  name: string;
  slug: string;
}

export interface PostSummary {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  coverUrl: string | null;
  publishedAt: string | null;
  authors: PostAuthor[];
  categories: PostTerm[];
  tags: PostTerm[];
}

export interface Post extends PostSummary {
  /** Rich-text HTML authored in the community's blog editor. */
  content: string;
}

export interface PostsPage {
  posts: PostSummary[];
  meta: {total: number; perPage: number; currentPage: number; lastPage: number};
}

async function apiGet<T>(requestUrl: URL, pathname: string): Promise<T | null> {
  try {
    const res = await fetch(`${siteOrigin(requestUrl)}${pathname}`, {
      headers: {
        accept: 'application/json',
        // Cloudflare 403s a request with no User-Agent. See the file header.
        'user-agent':
          'Mozilla/5.0 (compatible; EzyCommunitySite/1.0; +https://ezycommunity.com)',
        // Lets `src/middleware.ts` refuse a fetch that came back to this site.
        [SELF_FETCH_HEADER]: '1',
      },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {data?: T};
    return body?.data ?? null;
  } catch {
    return null;
  }
}

interface RawAuthor {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  avatar?: string | null;
}

function toAuthor(raw: RawAuthor): PostAuthor {
  const name =
    raw.displayName?.trim() ||
    [raw.firstName, raw.lastName].filter(Boolean).join(' ').trim() ||
    'Unknown author';
  return {id: raw.id, name, avatar: raw.avatar ?? null};
}

function toTerm(raw: PostTerm): PostTerm {
  return {id: raw.id, name: raw.name, slug: raw.slug};
}

function toSummary(raw: Record<string, unknown>): PostSummary {
  const list = <T>(value: unknown): T[] => (Array.isArray(value) ? value : []);
  return {
    id: raw.id as number,
    title: (raw.title as string) ?? '',
    slug: (raw.slug as string) ?? '',
    excerpt: (raw.excerpt as string | null) ?? null,
    coverUrl: (raw.coverUrl as string | null) ?? null,
    publishedAt: (raw.publishedAt as string | null) ?? null,
    authors: list<RawAuthor>(raw.authors).map(toAuthor),
    categories: list<PostTerm>(raw.categories).map(toTerm),
    tags: list<PostTerm>(raw.tags).map(toTerm),
  };
}

/**
 * `GET /api/public/site/v1/initial-data` — the brand: name, logo, favicon.
 * There is no description and no colour in this payload.
 */
export async function getSite(requestUrl: URL): Promise<Site | null> {
  const raw = await apiGet<Record<string, unknown>>(
    requestUrl,
    '/api/public/site/v1/initial-data'
  );
  if (!raw) return null;
  return {
    id: raw.id as number,
    name: (raw.name as string) ?? 'Community',
    favIcon: (raw.favIcon as string | null) ?? null,
    logo: (raw.logo as string | null) ?? null,
  };
}

/**
 * `GET /api/public/blog/post/all-posts?page=&per_page=` — published posts,
 * newest first. The page size parameter is `per_page` (`limit` is ignored).
 */
export async function listPosts(
  requestUrl: URL,
  {page = 1, perPage = 10}: {page?: number; perPage?: number} = {}
): Promise<PostsPage> {
  const current = Math.max(1, page);
  const size = Math.min(50, Math.max(1, perPage));
  const raw = await apiGet<{
    meta?: Record<string, number>;
    data?: Record<string, unknown>[];
  }>(requestUrl, `/api/public/blog/post/all-posts?page=${current}&per_page=${size}`);

  return {
    posts: (raw?.data ?? []).map(toSummary),
    meta: {
      total: raw?.meta?.total ?? 0,
      perPage: raw?.meta?.perPage ?? size,
      currentPage: raw?.meta?.currentPage ?? current,
      lastPage: raw?.meta?.lastPage ?? 1,
    },
  };
}

/**
 * `GET /api/public/blog/post/<slug>/read` — one published post with its HTML.
 * `null` for an unknown or unpublished slug, so the page can answer 404.
 */
export async function getPost(requestUrl: URL, slug: string): Promise<Post | null> {
  const raw = await apiGet<Record<string, unknown>>(
    requestUrl,
    `/api/public/blog/post/${encodeURIComponent(slug)}/read`
  );
  if (!raw) return null;
  return {...toSummary(raw), content: (raw.content as string) ?? ''};
}
