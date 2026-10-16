import {useInfiniteQuery, useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {createRootRoute, createRoute, Link, Outlet, useRouterState} from '@tanstack/react-router';
import {type ChangeEvent, type FormEvent, useState} from 'react';

import {logout, storeFile} from '../platform/browser';
import {
  type Abilities,
  type Job,
  JOB_TYPES,
  type JobsPage,
  type Member,
  type UploadRow as Upload,
  type Viewer,
} from '../lib/types';
import {api, read} from './api';
import {Button, Field, rules, useForm} from './ui';

/**
 * The portal's screens: a TanStack Router app under `/portal` (basepath),
 * served by `src/pages/portal/[...path].astro` (members only), with data from
 * the Site API through TanStack Query. Links INSIDE the portal use `<Link>`;
 * links to the Astro pages or the community app (`/`, `/blog`, `/feeds`) are
 * plain `<a href>`.
 */

const when = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {dateStyle: 'medium', timeStyle: 'short'}).format(
    new Date(iso)
  );

const bytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase() ?? '')
    .join('');

function ErrorNote({error}: {error: Error}) {
  return <p className="notice">{error.message}</p>;
}

function Avatar({name, src}: {name: string; src: string | null}) {
  return src ? (
    <img className="avatar" src={src} alt="" width={40} height={40} />
  ) : (
    <span className="avatar avatar-fallback" aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/** Who is signed in, and what the portal may show them. Shared by every screen. */
function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => read<{viewer: Viewer; abilities: Abilities}>(api.me.$get()),
    staleTime: 60_000,
  });
}

/** The brand, for the sidebar. Public and cached on the server. */
function useSite() {
  return useQuery({
    queryKey: ['site'],
    queryFn: () => read<{site: {name: string} | null}>(api.site.$get()),
    staleTime: 5 * 60_000,
  });
}

/**
 * The sidebar, in groups. `ability` hides an item the visitor may not use;
 * that only HIDES it, the route's guard is the enforcement. Add a screen:
 * its route below + one item here.
 */
const NAV_GROUPS: {
  label: string;
  items: {to: string; label: string; exact?: boolean; ability?: keyof Abilities}[];
}[] = [
  {
    label: 'Workspace',
    items: [
      {to: '/', label: 'Overview', exact: true},
      {to: '/uploads', label: 'My files'},
      {to: '/members', label: 'Members'},
    ],
  },
  {label: 'Manage', items: [{to: '/jobs', label: 'Jobs', ability: 'manageJobs'}]},
];

/** The screen's title for the top bar: the deepest sidebar item it is under. */
function useScreenTitle() {
  const path = useRouterState({select: s => s.location.pathname.replace(/^\/portal/, '') || '/'});
  const items = NAV_GROUPS.flatMap(group => group.items);
  const match = items
    .filter(item => (item.exact ? path === item.to : path === item.to || path.startsWith(`${item.to}/`)))
    .sort((a, b) => b.to.length - a.to.length)[0];
  return match?.label ?? 'Dashboard';
}

/**
 * The app shell: a full-height sidebar (brand, grouped nav, way back to the
 * website) and a top bar (screen title, visitor, sign out), the screen in
 * between. Every screen renders inside it; nothing here reloads the page.
 */
const rootRoute = createRootRoute({
  component: function Shell() {
    const me = useMe();
    const site = useSite();
    const title = useScreenTitle();
    const [open, setOpen] = useState(false);
    // `logout()` reloads the page when it is done, so pending never needs resetting.
    const [signingOut, setSigningOut] = useState(false);
    const viewer = me.data?.viewer;
    const abilities = me.data?.abilities;
    return (
      <div className="app-shell" data-nav-open={open ? '' : undefined}>
        <aside className="app-sidebar">
          <a className="app-brand" href="/">
            {site.data?.site?.name ?? 'Community'}
          </a>
          <nav aria-label="Dashboard" onClick={() => setOpen(false)}>
            {NAV_GROUPS.map(group => {
              const items = group.items.filter(item => !item.ability || abilities?.[item.ability]);
              if (!items.length) return null;
              return (
                <div className="app-nav-group" key={group.label}>
                  <p className="app-nav-label">{group.label}</p>
                  {items.map(item => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className="app-nav-link"
                      activeOptions={{exact: item.exact ?? false}}>
                      {item.label}
                    </Link>
                  ))}
                </div>
              );
            })}
          </nav>
          <div className="app-sidebar-foot">
            <a className="app-nav-link" href="/">
              ← Back to the website
            </a>
            <a className="app-nav-link" href="/feeds">
              Community
            </a>
          </div>
        </aside>

        <div className="app-main">
          <header className="app-topbar">
            <button
              type="button"
              className="app-menu-button"
              aria-label="Menu"
              aria-expanded={open}
              onClick={() => setOpen(value => !value)}>
              ☰
            </button>
            <h1 className="app-title">{title}</h1>
            {viewer && (
              <div className="app-viewer">
                <Avatar name={viewer.name ?? ''} src={viewer.avatar} />
                <span className="app-viewer-name">{viewer.name}</span>
                {viewer.preview ? (
                  <span className="chip" title="Editor preview: a stand-in signed-in member">
                    Preview
                  </span>
                ) : (
                  <Button
                    variant="link"
                    size="sm"
                    pending={signingOut}
                    pendingLabel="Signing out…"
                    onClick={() => {
                      setSigningOut(true);
                      void logout();
                    }}>
                    Sign out
                  </Button>
                )}
              </div>
            )}
          </header>
          <main className="app-content">
            <Outlet />
          </main>
        </div>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="app-empty">
      <h2>Not found</h2>
      <p className="muted">This dashboard page does not exist.</p>
      <Link className="button" to="/">
        Back to the overview
      </Link>
    </div>
  ),
});

/** One number on the overview. `value` null = still loading. */
function Stat({label, value, hint, to}: {label: string; value: string | null; hint?: string; to?: string}) {
  const body = (
    <>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value ?? '—'}</p>
      {hint && <p className="stat-hint">{hint}</p>}
    </>
  );
  return to ? (
    <Link className="stat stat-link" to={to}>
      {body}
    </Link>
  ) : (
    <div className="stat">{body}</div>
  );
}

/**
 * A count for a stat tile from the FIRST page of a keyset list: "12", or
 * "20+" when there are more. Never a COUNT query per request; a total that
 * must be exact comes from a counter kept in the Site Database on write.
 */
const pageCount = (rows: unknown[] | undefined, more: boolean) =>
  rows ? `${rows.length}${more ? '+' : ''}` : null;

const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: function Overview() {
    const me = useMe();
    const viewer = me.data?.viewer;
    const manageJobs = me.data?.abilities.manageJobs ?? false;
    const health = useQuery({
      queryKey: ['health'],
      queryFn: () =>
        read<{preview: boolean; database: boolean; communityKey: boolean}>(api.health.$get()),
    });
    // Under the screens' query keys (['uploads'], ['jobs']): a save there
    // invalidates these too, so the numbers never go stale.
    const uploads = useQuery({
      queryKey: ['uploads', 'first'],
      queryFn: () =>
        read<{uploads: Upload[]; nextBefore: number | null}>(api.uploads.$get({query: {before: undefined}})),
    });
    const jobs = useQuery({
      queryKey: ['jobs', 'manage', 'first'],
      queryFn: () => read<JobsPage>(api.jobs.manage.$get({query: {before: undefined}})),
      enabled: manageJobs,
    });
    const recent = uploads.data?.uploads.slice(0, 5) ?? [];

    return (
      <div className="app-page">
        <div className="app-page-head">
          <div>
            <h2>{viewer ? `Welcome back, ${viewer.name}` : 'Welcome back'}</h2>
            <p className="muted">What is happening on your site.</p>
          </div>
          <Link className="button" to="/uploads">
            Upload a file
          </Link>
        </div>

        {me.error && <ErrorNote error={me.error} />}
        {viewer?.preview && (
          <p className="notice">
            Editor preview: you are a stand-in member with every permission, and changes go to the
            Preview Database. Real sign-in and uploads work on your live site.
          </p>
        )}

        <div className="stat-grid">
          <Stat
            label="My files"
            value={pageCount(uploads.data?.uploads, Boolean(uploads.data?.nextBefore))}
            to="/uploads"
          />
          {manageJobs && (
            <Stat
              label="Jobs"
              value={pageCount(jobs.data?.jobs, Boolean(jobs.data?.nextBefore))}
              to="/jobs"
            />
          )}
          <Stat
            label="Site Database"
            value={health.data ? (health.data.database ? 'Connected' : 'Off') : null}
            hint={health.data && !health.data.database ? 'Ask the owner to enable it.' : undefined}
          />
          <Stat
            label="Community Key"
            value={health.data ? (health.data.communityKey ? 'Available' : 'Missing') : null}
          />
        </div>

        <section className="app-card">
          <div className="app-card-head">
            <h3>Recent files</h3>
            <Link to="/uploads">View all</Link>
          </div>
          {uploads.error ? (
            <ErrorNote error={uploads.error} />
          ) : uploads.isPending ? (
            <p className="muted">Loading…</p>
          ) : recent.length ? (
            <table className="app-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Size</th>
                  <th>Added</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(file => (
                  <tr key={file.id}>
                    <td>
                      <a href={file.url} target="_blank" rel="noreferrer">
                        {file.originalName}
                      </a>
                    </td>
                    <td className="muted">{bytes(file.fileSize)}</td>
                    <td className="muted">{when(file.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="app-empty">
              <p className="muted">No files yet.</p>
              <Link className="button ghost" to="/uploads">
                Upload your first file
              </Link>
            </div>
          )}
        </section>
      </div>
    );
  },
});

const uploadsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/uploads',
  component: function Uploads() {
    const queryClient = useQueryClient();
    const uploads = useInfiniteQuery({
      queryKey: ['uploads'],
      initialPageParam: undefined as string | undefined,
      queryFn: ({pageParam}) =>
        read<{uploads: Upload[]; nextBefore: number | null}>(
          api.uploads.$get({query: {before: pageParam}})
        ),
      getNextPageParam: last => (last.nextBefore ? String(last.nextBefore) : undefined),
    });
    // 1. browser → storage (presign, PUT)  2. the Site API registers it as this member and saves it.
    const add = useMutation({
      mutationFn: async (file: File) => {
        const stored = await storeFile(file);
        return read<{upload: Upload}>(api.uploads.$post({json: stored}));
      },
      onSuccess: () => queryClient.invalidateQueries({queryKey: ['uploads']}),
    });
    const pick = (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) add.mutate(file);
    };
    const rows = uploads.data?.pages.flatMap(page => page.uploads) ?? [];
    const preview = useMe().data?.viewer.preview ?? false;

    return (
      <div className="app-page">
        <h2>My files</h2>
        <p className="muted">
          Files go straight from your browser to the community's storage; this site keeps the link.
          Images up to 10 MB, documents up to 500 MB.
        </p>
        {preview ? (
          <p className="notice">
            Uploads go from a signed-in member's browser to the community's storage, so they only
            work on your live site, not in the editor preview.
          </p>
        ) : (
          // A file picker needs a <label>; it follows the same busy rules as <Button>.
          <label
            className="button upload-button"
            aria-busy={add.isPending || undefined}
            aria-disabled={add.isPending || undefined}>
            {add.isPending && <span className="spinner" aria-hidden="true" />}
            {add.isPending ? 'Uploading…' : 'Upload a file'}
            <input type="file" onChange={pick} disabled={add.isPending} hidden />
          </label>
        )}
        {add.error && <ErrorNote error={add.error} />}
        {uploads.error && <ErrorNote error={uploads.error} />}
        {rows.length === 0 && uploads.isSuccess && <p className="muted">No files yet.</p>}
        <ul className="files">
          {rows.map(file => (
            <li key={file.id}>
              {file.fileType === 'image' ? (
                <img src={file.url} alt="" width={56} height={56} loading="lazy" />
              ) : (
                <span className="file-icon" aria-hidden="true">
                  {file.originalName.split('.').pop()?.toUpperCase()}
                </span>
              )}
              <div>
                <a href={file.url} target="_blank" rel="noreferrer">
                  {file.originalName}
                </a>
                <span className="meta">
                  {bytes(file.fileSize)} · {when(file.createdAt)}
                </span>
              </div>
            </li>
          ))}
        </ul>
        {uploads.hasNextPage && (
          <Button
            variant="ghost"
            onClick={() => uploads.fetchNextPage()}
            pending={uploads.isFetchingNextPage}
            pendingLabel="Loading…">
            Load more
          </Button>
        )}
      </div>
    );
  },
});

const membersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/members',
  component: function Members() {
    const [search, setSearch] = useState('');
    const [term, setTerm] = useState('');
    const members = useInfiniteQuery({
      queryKey: ['members', term],
      initialPageParam: undefined as string | undefined,
      queryFn: ({pageParam}) =>
        read<{members: Member[]; nextCursor: string | null}>(
          api.members.$get({query: {cursor: pageParam, search: term}})
        ),
      getNextPageParam: last => last.nextCursor ?? undefined,
    });
    const submit = (event: FormEvent) => {
      event.preventDefault();
      setTerm(search.trim());
    };
    const rows = members.data?.pages.flatMap(page => page.members) ?? [];

    return (
      <div className="app-page">
        <h2>Members</h2>
        <p className="muted">Read by this site's server with the Community Key.</p>
        <form className="search" onSubmit={submit}>
          <input
            type="search"
            aria-label="Search members by name"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name"
            maxLength={50}
          />
          <Button
            variant="ghost"
            type="submit"
            pending={members.isFetching && !members.isFetchingNextPage}
            pendingLabel="Searching…">
            Search
          </Button>
        </form>
        {members.error && <ErrorNote error={members.error} />}
        {rows.length === 0 && members.isSuccess && <p className="muted">No members found.</p>}
        <ul className="members">
          {rows.map(member => (
            <li key={member.id}>
              <Avatar name={member.name} src={member.avatar} />
              <div>
                <a href={`/profile/${encodeURIComponent(member.slug)}`}>{member.name}</a>
                {member.role && <span className="meta">{member.role}</span>}
              </div>
            </li>
          ))}
        </ul>
        {members.hasNextPage && (
          <Button
            variant="ghost"
            onClick={() => members.fetchNextPage()}
            pending={members.isFetchingNextPage}
            pendingLabel="Loading…">
            Load more
          </Button>
        )}
      </div>
    );
  },
});

const EMPTY_JOB = {
  title: '',
  company: '',
  location: '',
  type: 'full-time',
  remote: false,
  description: '',
  applyUrl: '',
};

/** The job form's rules: the SAME limits `src/server/routes/jobs.ts` enforces. */
const JOB_RULES = {
  title: [rules.required('Enter a title.'), rules.maxLength(120)],
  company: [rules.required('Enter the company.'), rules.maxLength(80)],
  location: [rules.required('Enter a location, or "Anywhere".'), rules.maxLength(80)],
  description: [
    rules.required('Describe the job.'),
    rules.minLength(20, 'Write at least 20 characters so applicants know what it is.'),
    rules.maxLength(10000),
  ],
  applyUrl: [
    rules.required('Add where to apply.'),
    rules.pattern(/^(https:\/\/|mailto:)\S+$/i, 'Use an https:// link or a mailto: address.'),
    rules.maxLength(500),
  ],
};

/** Site admins: post, edit, close and delete jobs (`/site-api/jobs`, `MANAGE_JOBS`). */
const jobsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/jobs',
  component: function Jobs() {
    const queryClient = useQueryClient();
    const [editing, setEditing] = useState<number | 'new' | null>(null);
    const form = useForm(EMPTY_JOB, JOB_RULES);
    const jobs = useInfiniteQuery({
      queryKey: ['jobs', 'manage'],
      initialPageParam: undefined as string | undefined,
      queryFn: ({pageParam}) => read<JobsPage>(api.jobs.manage.$get({query: {before: pageParam}})),
      getNextPageParam: last => (last.nextBefore ? String(last.nextBefore) : undefined),
    });
    const refresh = () => queryClient.invalidateQueries({queryKey: ['jobs']});
    const close = () => {
      setEditing(null);
      form.reset();
    };
    const save = useMutation({
      mutationFn: (values: typeof EMPTY_JOB) =>
        editing === 'new'
          ? read<{job: Job}>(api.jobs.$post({json: values}))
          : read<{job: Job}>(api.jobs[':id'].$patch({param: {id: String(editing)}, json: values})),
      onSuccess: () => {
        close();
        return refresh();
      },
    });
    const open = useMutation({
      mutationFn: (id: number) =>
        read<{job: Job}>(api.jobs.manage[':id'].$get({param: {id: String(id)}})),
      onSuccess: ({job}, id) => {
        form.reset({
          title: job.title,
          company: job.company,
          location: job.location,
          type: job.type,
          remote: job.remote,
          description: job.description,
          applyUrl: job.applyUrl,
        });
        save.reset();
        setEditing(id);
      },
    });
    const setStatus = useMutation({
      mutationFn: ({id, status}: {id: number; status: string}) =>
        read(api.jobs[':id'].$patch({param: {id: String(id)}, json: {status}})),
      onSuccess: refresh,
    });
    const remove = useMutation({
      mutationFn: (id: number) => read(api.jobs[':id'].$delete({param: {id: String(id)}})),
      onSuccess: refresh,
    });
    // Which ROW is busy: only that row's buttons show it, and the row cannot be acted on twice.
    const busyId =
      (open.isPending && open.variables) ||
      (setStatus.isPending && setStatus.variables?.id) ||
      (remove.isPending && remove.variables) ||
      null;
    const rows = jobs.data?.pages.flatMap(page => page.jobs) ?? [];

    return (
      <div className="app-page">
        <div className="app-page-head">
          <h2>Jobs</h2>
          {editing === null && (
            <Button
              onClick={() => {
                form.reset();
                save.reset();
                setEditing('new');
              }}>
              Post a job
            </Button>
          )}
        </div>
        <p className="muted">
          Listed on <a href="/jobs">/jobs</a>. Stored in this site's database; only site admins see this screen.
        </p>

        {editing !== null && (
          <form className="app-card form-card" onSubmit={form.submit(values => save.mutate(values))} noValidate>
            <h3>{editing === 'new' ? 'New job' : 'Edit job'}</h3>
            <div className="form-grid">
              <Field id="f-title" label="Title" error={form.error('title')}>
                <input {...form.field('title')} autoComplete="off" />
              </Field>
              <Field id="f-company" label="Company" error={form.error('company')}>
                <input {...form.field('company')} autoComplete="organization" />
              </Field>
              <Field id="f-location" label="Location" error={form.error('location')}>
                <input {...form.field('location')} />
              </Field>
              <Field id="f-type" label="Job type">
                <select {...form.field('type')}>
                  {JOB_TYPES.map(type => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="check full">
                <input
                  type="checkbox"
                  checked={Boolean(form.values.remote)}
                  onChange={event => form.set('remote', event.target.checked)}
                />{' '}
                Remote
              </label>
              <div className="full">
                <Field
                  id="f-description"
                  label="Description"
                  hint="Leave a blank line between paragraphs."
                  error={form.error('description')}>
                  <textarea {...form.field('description')} rows={8} />
                </Field>
              </div>
              <div className="full">
                <Field
                  id="f-applyUrl"
                  label="Apply link"
                  hint="An https:// link or a mailto: address."
                  error={form.error('applyUrl')}>
                  <input {...form.field('applyUrl')} inputMode="url" />
                </Field>
              </div>
            </div>
            {save.error && <ErrorNote error={save.error} />}
            <div className="actions">
              <Button type="submit" pending={save.isPending} pendingLabel="Saving…">
                {editing === 'new' ? 'Post job' : 'Save changes'}
              </Button>
              <Button variant="ghost" onClick={close} disabled={save.isPending}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {jobs.error && <ErrorNote error={jobs.error} />}
        {jobs.isPending && <p className="muted">Loading…</p>}
        {rows.length === 0 && jobs.isSuccess && (
          <div className="app-empty">
            <p className="muted">No jobs yet.</p>
          </div>
        )}
        <ul className="files">
          {rows.map(job => {
            const busy = busyId === job.id;
            return (
              <li key={job.id} aria-busy={busy || undefined}>
                <div>
                  <a href={`/jobs/${encodeURIComponent(job.slug)}`}>{job.title}</a>
                  <span className="meta">
                    {job.company} · {job.location} · {job.status}
                  </span>
                </div>
                <div className="row-actions">
                  <Button
                    variant="link"
                    size="sm"
                    pending={open.isPending && open.variables === job.id}
                    pendingLabel="Opening…"
                    disabled={busy || save.isPending}
                    onClick={() => open.mutate(job.id)}>
                    Edit
                  </Button>
                  <Button
                    variant="link"
                    size="sm"
                    pending={setStatus.isPending && setStatus.variables?.id === job.id}
                    pendingLabel={job.status === 'open' ? 'Closing…' : 'Reopening…'}
                    disabled={busy}
                    onClick={() => setStatus.mutate({id: job.id, status: job.status === 'open' ? 'closed' : 'open'})}>
                    {job.status === 'open' ? 'Close' : 'Reopen'}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    pending={remove.isPending && remove.variables === job.id}
                    pendingLabel="Deleting…"
                    disabled={busy}
                    onClick={() => window.confirm(`Delete “${job.title}”?`) && remove.mutate(job.id)}>
                    Delete
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
        {(open.error || setStatus.error || remove.error) && (
          <ErrorNote error={(open.error ?? setStatus.error ?? remove.error)!} />
        )}
        {jobs.hasNextPage && (
          <Button
            variant="ghost"
            onClick={() => jobs.fetchNextPage()}
            pending={jobs.isFetchingNextPage}
            pendingLabel="Loading…">
            Load more
          </Button>
        )}
      </div>
    );
  },
});

export const routeTree = rootRoute.addChildren([
  overviewRoute,
  uploadsRoute,
  membersRoute,
  jobsRoute,
]);
