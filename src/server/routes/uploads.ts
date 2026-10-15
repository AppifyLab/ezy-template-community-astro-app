import {Hono} from 'hono';
import {validator} from 'hono/validator';

import type {UploadRow} from '../../lib/types';
import {problem, requireMember, withDb, withViewer} from '../guards';

/**
 * A member's files. The BYTES never come here: the browser uploads them
 * straight to the community's CDN (presign → PUT → register, `uploadFile()` in
 * `src/lib/browser-session.ts`), then saves the returned link with POST.
 *
 *   GET  /site-api/uploads?before=   the visitor's OWN files, newest first
 *   POST /site-api/uploads           record one uploaded file
 */
const PAGE_SIZE = 20;

const select = {id: true, url: true, originalName: true, fileType: true, fileSize: true, createdAt: true} as const;

const pageQuery = validator('query', value => ({
  before: typeof value.before === 'string' ? value.before : undefined,
}));

const uploadBody = validator('json', (value, c) => {
  const v = (value ?? {}) as Record<string, unknown>;
  const url = typeof v.url === 'string' ? v.url.trim() : '';
  const originalName = typeof v.originalName === 'string' ? v.originalName.trim().slice(0, 100) : '';
  const fileType = typeof v.fileType === 'string' ? v.fileType.slice(0, 20) : 'file';
  const fileSize = Number(v.fileSize);
  let https = false;
  try {
    https = new URL(url).protocol === 'https:' && url.length <= 1000;
  } catch {
    https = false;
  }
  if (!https || !originalName || !Number.isSafeInteger(fileSize) || fileSize < 0) {
    return c.json(problem('invalid_upload', 'That upload could not be recorded.'), 422);
  }
  return {url, originalName, fileType, fileSize};
});

const toRow = (row: {createdAt: Date} & Omit<UploadRow, 'createdAt'>): UploadRow => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
});

export const uploadRoutes = new Hono()
  .get('/', pageQuery, withViewer, requireMember, withDb, async c => {
    const before = Number(c.req.valid('query').before);
    const rows = await c.var.db.upload.findMany({
      select,
      where: {
        profileId: c.var.viewer.profileId!,
        ...(Number.isSafeInteger(before) && before > 0 ? {id: {lt: before}} : {}),
      },
      orderBy: {id: 'desc'},
      take: PAGE_SIZE + 1,
    });
    const uploads = rows.slice(0, PAGE_SIZE).map(toRow);
    return c.json({uploads, nextBefore: rows.length > PAGE_SIZE ? uploads.at(-1)!.id : null});
  })

  .post('/', uploadBody, withViewer, requireMember, withDb, async c => {
    const row = await c.var.db.upload.create({
      data: {...c.req.valid('json'), profileId: c.var.viewer.profileId!},
      select,
    });
    return c.json({upload: toRow(row)}, 201);
  });
