import {Hono} from 'hono';

import type {Site} from '../../lib/types';
import {publicGet} from '../../platform/api';

/**
 * `GET /site-api/site` — the community's brand: name, logo, favicon, read from
 * `/api/public/site/v1/initial-data`. There is no description and no colour
 * in that payload. Re-projected field by field.
 */
export const siteRoutes = new Hono().get('/', async c => {
  const raw = await publicGet<Record<string, unknown>>(c.req.url, '/site/v1/initial-data', {
    ttlSeconds: 60,
  }).catch(
    () => null
  );
  const site: Site | null = raw
    ? {
        id: Number(raw.id),
        name: String(raw.name ?? '') || 'Community',
        favIcon: (raw.favIcon as string | null) ?? null,
        logo: (raw.logo as string | null) ?? null,
      }
    : null;
  return c.json({site});
});
