import {Hono} from 'hono';
import {validator} from 'hono/validator';

import type {Member} from '../../lib/types';
import {platformProblem, requireMember, withViewer} from '../../platform/guards';
import {communityGet} from '../../platform/api';

/**
 * `GET /site-api/members?search=&cursor=` — the members directory, read
 * SERVER TO SERVER with the Community Key (`/api/site/v1/team/members/list`).
 *
 * The key reads as the COMMUNITY, so the visitor's own session decides who may
 * see it: members only (`requireMember` runs first). Search is the platform's
 * display-name prefix. No email is ever in this answer: the key cannot read
 * one, and the rows are re-projected field by field anyway.
 */
const membersQuery = validator('query', value => ({
  cursor: typeof value.cursor === 'string' ? value.cursor : undefined,
  search: typeof value.search === 'string' ? value.search.trim().slice(0, 50) : '',
}));

export const memberRoutes = new Hono().get('/', membersQuery, withViewer, requireMember, async c => {
  const {cursor, search} = c.req.valid('query');
  const params = new URLSearchParams({type: 'community', limit: '24'});
  if (cursor) params.set('cursor', cursor);
  if (search) params.set('search', search);

  try {
    const raw = await communityGet<{
      data?: Record<string, unknown>[];
      meta?: {nextCursor?: string | null; hasNextPage?: boolean};
    }>(c.req.url, `/team/members/list?${params}`);

    const members: Member[] = (raw?.data ?? []).map(row => ({
      id: Number(row.id),
      slug: String(row.slug ?? ''),
      name:
        String(row.displayName ?? '').trim() ||
        [row.firstName, row.lastName].filter(Boolean).join(' ').trim() ||
        'Member',
      avatar: (row.avatar as string | null) ?? null,
      role: (row.role as {name?: string} | null)?.name ?? null,
    }));
    return c.json({
      members,
      nextCursor: raw?.meta?.hasNextPage ? (raw.meta.nextCursor ?? null) : null,
    });
  } catch (err) {
    const {status, body} = platformProblem(err);
    return c.json(body, status);
  }
});
