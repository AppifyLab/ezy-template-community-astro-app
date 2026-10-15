import {PrismaPostgresAdapter} from '@prisma/adapter-ppg';

import {PrismaClient} from '../generated/prisma/client';
import {config} from './config';

/**
 * The Site Database client, or `null` when this site has no Site Database yet
 * (`DATABASE_URL` is empty until the owner enables it).
 *
 * A NEW client per request: a Worker must not share I/O objects between
 * requests. `@prisma/adapter-ppg` talks to Prisma Postgres over HTTPS (and a
 * WebSocket for interactive transactions); a Worker here cannot open raw TCP,
 * so `pg`, `postgres` or `@prisma/adapter-pg` will not work.
 */
export function getDb(): PrismaClient | null {
  const url = config.databaseUrl;
  if (!url) return null;
  return new PrismaClient({adapter: new PrismaPostgresAdapter({connectionString: url})});
}
