/**
 * The shapes the Site API answers with. Browser-safe (no server code): pages,
 * the portal and `src/server/` all import them from here.
 *
 * Every one is OUR shape, built field by field from the platform's answers, so
 * nothing the platform adds later (a member's email, say) reaches a page.
 */

export interface Site {
  id: number;
  name: string;
  favIcon: string | null;
  logo: string | null;
}

export interface PostAuthor {
  id: number;
  /** Already joined. Never an email. */
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
  /** Rich-text HTML from the community's blog editor, already sanitized. */
  content: string;
}

export interface PostsPage {
  posts: PostSummary[];
  page: number;
  hasMore: boolean;
}

export type JobType = 'full-time' | 'part-time' | 'contract' | 'internship';
export const JOB_TYPES: JobType[] = ['full-time', 'part-time', 'contract', 'internship'];

export interface JobSummary {
  id: number;
  slug: string;
  title: string;
  company: string;
  location: string;
  type: string;
  remote: boolean;
  status: string;
  createdAt: string;
}

export interface Job extends JobSummary {
  description: string;
  applyUrl: string;
}

export interface JobsPage {
  jobs: JobSummary[];
  /** Pass back as `?before=` for the next page; null on the last one. */
  nextBefore: number | null;
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
  /** True only in the editor Preview's stand-in session (see `src/server/viewer.ts`). */
  preview: boolean;
}

/** What the visitor may do on THIS site (derived from their Role Manager codenames). */
export interface Abilities {
  manageJobs: boolean;
}

export interface Member {
  id: number;
  slug: string;
  name: string;
  avatar: string | null;
  role: string | null;
}

export interface UploadRow {
  id: number;
  url: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
}
