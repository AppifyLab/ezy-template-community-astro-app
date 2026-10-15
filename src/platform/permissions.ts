import {communityGet} from './api';
import {getViewer, getViewerPermissions, grants} from './viewer';

/**
 * AUTHORIZATION for this site, on the community's own Role Manager.
 *
 * A Site cannot create roles or codenames: the community's admins manage
 * roles in the community dashboard, and this site decides what each of ITS
 * features needs by naming an existing codename. So "who may use my CRM" is
 * answered by the community's roles, with no second user system here.
 *
 *   await can(request, CODENAMES.MEMBER_READ)      one check (memoized per request)
 *   requirePermission(CODENAMES.MEMBER_READ)       the same, as Site API middleware
 *   await getRoles(request)                        roles + their codenames (admins only)
 *
 * The full codename list of THIS community is in `getRoles()` (every role's
 * grants, wildcards expanded). `CODENAMES` below are the ones custom apps
 * usually need; pick the narrowest that matches the feature.
 */
export const CODENAMES = {
  /** Open the community dashboard at all: a general "staff" signal. */
  DASHBOARD_READ: 'community:dashboard:read',
  /** See member management data (an admin-level member view, a CRM's contacts). */
  MEMBER_READ: 'community:member:read',
  /** Change members (a CRM that edits contact records about members). */
  MEMBER_UPDATE: 'community:member:update',
  /** See the community's analytics (reports, dashboards with numbers). */
  ANALYTICS_READ: 'community:analytics:read',
  /** Read the Role Manager itself (a "who can do what" screen). */
  ROLES_READ: 'community:rm:read',
  /** See this site's admin data. */
  SITE_READ: 'community:site:read',
  /** Change this site's own content (jobs, pages, settings stored here). */
  SITE_UPDATE: 'community:site:update',
} as const;

export type Codename = (typeof CODENAMES)[keyof typeof CODENAMES] | (string & {});

/**
 * Does the visitor hold `codename` (exactly, or by a wildcard parent)? Only an
 * ACTIVE member can; the editor Preview's stand-in holds everything.
 * Memoized per request: call it as often as needed.
 */
export async function can(request: Request, codename: Codename): Promise<boolean> {
  const [viewer, permissions] = await Promise.all([
    getViewer(request),
    getViewerPermissions(request),
  ]);
  return viewer.state === 'member' && grants(permissions, codename);
}

export interface Role {
  id: number;
  name: string;
  slug: string;
  isSystem: boolean;
  /** Codenames this role grants, wildcards already expanded. */
  permissions: string[];
}

/**
 * The community's roles and what each grants (`/api/site/v1/roles`, with the
 * Community Key). ADMIN DATA: returns `null` unless the visitor holds
 * `community:rm:read`; never show it to anyone else. Match a member to a role
 * by `viewer.roleSlug`.
 */
export async function getRoles(request: Request): Promise<Role[] | null> {
  if (!(await can(request, CODENAMES.ROLES_READ))) return null;
  const raw = await communityGet<Record<string, unknown>[]>(request.url, '/roles');
  return (raw ?? []).map(row => ({
    id: Number(row.id),
    name: String(row.name ?? ''),
    slug: String(row.slug ?? ''),
    isSystem: row.isSystem === true,
    permissions: Array.isArray(row.permissions)
      ? row.permissions.filter((p): p is string => typeof p === 'string')
      : [],
  }));
}
