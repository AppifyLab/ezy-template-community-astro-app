/**
 * Platform shapes shared by the platform layer and the app. Browser-safe.
 * Managed by the template: see `src/platform/README.md`.
 */

export interface Site {
  id: number;
  name: string;
  favIcon: string | null;
  logo: string | null;
}

export type ViewerState = 'member' | 'applicant' | 'returning' | 'guest';

export interface Viewer {
  state: ViewerState;
  /** The community profile (`profile.id`), when signed in. */
  profileId: number | null;
  /** `/profile/<slug>` in the App. */
  profileSlug: string | null;
  name: string | null;
  avatar: string | null;
  /** `profile.role.slug`: match against `/api/site/v1/roles`. Display only. */
  roleSlug: string | null;
  /** True only in the editor Preview's stand-in session (see `src/platform/viewer.ts`). */
  preview: boolean;
}

