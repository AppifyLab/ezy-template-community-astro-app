import {Hono} from 'hono';
import {validator} from 'hono/validator';

import type {UploadRow} from '../../lib/types';
import {problem, requireMember, withDb, withViewer} from '../../platform/guards';
import {fetchAsVisitor} from '../../platform/viewer';

/**
 * A member's files. The BYTES never come here: the browser puts them straight
 * into the community's storage (presign → PUT, `storeFile()` in
 * `src/platform/browser.ts`). Then:
 *
 *   POST /site-api/uploads {key, publicUrl, originalName}
 *     registers the file with the platform AS THE SAME MEMBER (their cookies
 *     and their CSRF header, forwarded) and stores ONLY what the platform
 *     confirms: its link, type and size. The platform refuses a key that this
 *     member did not presign, so nobody can save someone else's file or an
 *     arbitrary URL as "theirs".
 *   GET  /site-api/uploads?before=   the visitor's OWN files, newest first
 */
const PAGE_SIZE = 20;

const select = {id: true, url: true, originalName: true, fileType: true, fileSize: true, createdAt: true} as const;

const pageQuery = validator('query', value => ({
  before: typeof value.before === 'string' ? value.before : undefined,
}));

const uploadBody = validator('json', (value, c) => {
  const v = (value ?? {}) as Record<string, unknown>;
  const key = typeof v.key === 'string' ? v.key.trim() : '';
  const publicUrl = typeof v.publicUrl === 'string' ? v.publicUrl.trim() : '';
  const originalName = typeof v.originalName === 'string' ? v.originalName.trim().slice(0, 100) : '';
  if (!key || key.length > 500 || !publicUrl || publicUrl.length > 1000 || !originalName) {
    return c.json(problem('invalid_upload', 'That upload could not be recorded.'), 422);
  }
  return {key, publicUrl, originalName};
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
    const input = c.req.valid('json');
    const res = await fetchAsVisitor(c.req.raw, '/api/gallery/uploads/register', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // The browser's own CSRF token, passed on unchanged (never built from the cookie).
        'x-xsrf-token': c.req.header('x-xsrf-token') ?? '',
      },
      body: JSON.stringify({
        key: input.key,
        public_url: input.publicUrl,
        original_name: input.originalName,
        skip_gallery: true,
      }),
    }).catch(() => null);

    if (!res?.ok) {
      const status = res?.status ?? 502;
      const message =
        status === 401 ? 'Sign in to upload files.'
        : status === 402 ? 'Uploads are not available for this community right now.'
        : status === 403 ? 'That file is not yours to register.'
        : status === 422 ? 'The file is not in storage. Upload it again.'
        : 'The upload could not be saved.';
      return c.json(problem('upload_not_registered', message), status === 401 ? 401 : status === 403 ? 403 : 422);
    }

    const data = ((await res.json().catch(() => null)) as {data?: Record<string, unknown>} | null)?.data;
    const url = typeof data?.file_link === 'string' ? data.file_link : '';
    if (!url.startsWith('https://')) {
      return c.json(problem('upload_not_registered', 'The upload could not be saved.'), 502);
    }
    const row = await c.var.db.upload.create({
      data: {
        profileId: c.var.viewer.profileId!,
        url: url.slice(0, 1000),
        originalName: String(data?.original_name ?? input.originalName).slice(0, 100),
        fileType: String(data?.file_type ?? 'file').slice(0, 20),
        fileSize: Number.isSafeInteger(Number(data?.file_size)) ? Number(data?.file_size) : 0,
      },
      select,
    });
    return c.json({upload: toRow(row)}, 201);
  });
