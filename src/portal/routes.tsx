import {useInfiniteQuery, useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {createRootRoute, createRoute, Link, Outlet} from '@tanstack/react-router';
import {type ChangeEvent, type FormEvent, useState} from 'react';

import {storeFile} from '../lib/browser-session';
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

const rootRoute = createRootRoute({
  component: function Shell() {
    const me = useMe();
    return (
      <div className="portal">
        <nav className="portal-nav">
          <Link to="/" activeOptions={{exact: true}}>
            Overview
          </Link>
          <Link to="/uploads">My files</Link>
          <Link to="/members">Members</Link>
          {me.data?.abilities.manageJobs && <Link to="/jobs">Jobs</Link>}
        </nav>
        <Outlet />
      </div>
    );
  },
  notFoundComponent: () => (
    <section>
      <h1>Not found</h1>
      <p className="lede">This portal page does not exist.</p>
      <Link to="/">Back to the portal</Link>
    </section>
  ),
});

const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: function Overview() {
    const me = useMe();
    const health = useQuery({
      queryKey: ['health'],
      queryFn: () =>
        read<{preview: boolean; database: boolean; communityKey: boolean}>(api.health.$get()),
    });
    const brand = useQuery({
      queryKey: ['site'],
      queryFn: () => read<{site: {name: string} | null}>(api.site.$get()),
    });
    const viewer = me.data?.viewer;
    return (
      <section>
        <p className="eyebrow">Portal</p>
        {viewer && (
          <div className="me">
            <Avatar name={viewer.name ?? ''} src={viewer.avatar} />
            <div>
              <h1>Hi, {viewer.name}</h1>
              {viewer.profileSlug && (
                <a href={`/profile/${encodeURIComponent(viewer.profileSlug)}`}>
                  Your community profile →
                </a>
              )}
            </div>
          </div>
        )}
        {me.error && <ErrorNote error={me.error} />}
        <p className="lede">
          Your space on this site. It runs on this site's own backend (<code>/site-api</code>),
          which stores data in the Site Database and reads the community with the Community Key.
        </p>
        <div className="grid grid-3">
          <Link className="card link-card" to="/uploads">
            <h3>My files</h3>
            <p className="muted">Upload files to the community's storage.</p>
          </Link>
          <Link className="card link-card" to="/members">
            <h3>Members</h3>
            <p className="muted">Who is in {brand.data?.site?.name ?? 'the community'}.</p>
          </Link>
          <a className="card link-card" href="/feeds">
            <h3>Community</h3>
            <p className="muted">Posts, events and conversations.</p>
          </a>
        </div>
        {viewer?.preview && (
          <p className="notice">
            Editor preview: you are a stand-in member with every permission, and changes go to the
            Preview Database. Real sign-in and uploads work on your live site.
          </p>
        )}
        {health.error && <ErrorNote error={health.error} />}
        {health.data && (
          <ul className="status">
            <li>
              Site Database:{' '}
              <strong>{health.data.database ? 'connected' : 'not enabled yet'}</strong>
            </li>
            <li>
              Community Key: <strong>{health.data.communityKey ? 'available' : 'missing'}</strong>
            </li>
          </ul>
        )}
      </section>
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
      <section>
        <h1>My files</h1>
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
          <label className="button upload-button">
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
          <button
            className="button ghost"
            onClick={() => uploads.fetchNextPage()}
            disabled={uploads.isFetchingNextPage}>
            Load more
          </button>
        )}
      </section>
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
      <section>
        <h1>Members</h1>
        <p className="muted">Read by this site's server with the Community Key.</p>
        <form className="search" onSubmit={submit}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name"
            maxLength={50}
          />
          <button className="button ghost" type="submit">
            Search
          </button>
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
          <button
            className="button ghost"
            onClick={() => members.fetchNextPage()}
            disabled={members.isFetchingNextPage}>
            Load more
          </button>
        )}
      </section>
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

/** Site admins: post, edit, close and delete jobs (`/site-api/jobs`, `MANAGE_JOBS`). */
const jobsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/jobs',
  component: function Jobs() {
    const queryClient = useQueryClient();
    const [editing, setEditing] = useState<number | 'new' | null>(null);
    const [form, setForm] = useState(EMPTY_JOB);
    const jobs = useInfiniteQuery({
      queryKey: ['jobs', 'manage'],
      initialPageParam: undefined as string | undefined,
      queryFn: ({pageParam}) => read<JobsPage>(api.jobs.manage.$get({query: {before: pageParam}})),
      getNextPageParam: last => (last.nextBefore ? String(last.nextBefore) : undefined),
    });
    const refresh = () => queryClient.invalidateQueries({queryKey: ['jobs']});
    const save = useMutation({
      mutationFn: () =>
        editing === 'new'
          ? read<{job: Job}>(api.jobs.$post({json: form}))
          : read<{job: Job}>(api.jobs[':id'].$patch({param: {id: String(editing)}, json: form})),
      onSuccess: () => {
        setEditing(null);
        return refresh();
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
    const edit = async (id: number) => {
      const {job} = await read<{job: Job}>(api.jobs.manage[':id'].$get({param: {id: String(id)}}));
      setForm({
        title: job.title,
        company: job.company,
        location: job.location,
        type: job.type,
        remote: job.remote,
        description: job.description,
        applyUrl: job.applyUrl,
      });
      setEditing(id);
    };
    const field = (key: keyof typeof EMPTY_JOB) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(current => ({...current, [key]: key === 'remote' ? (event.target as HTMLInputElement).checked : event.target.value}));
    const submit = (event: FormEvent) => {
      event.preventDefault();
      save.mutate();
    };
    const rows = jobs.data?.pages.flatMap(page => page.jobs) ?? [];

    return (
      <section>
        <div className="section-head">
          <h1>Jobs</h1>
          {editing === null && (
            <button className="button" onClick={() => (setForm(EMPTY_JOB), setEditing('new'))}>
              Post a job
            </button>
          )}
        </div>
        <p className="muted">
          Listed on <a href="/jobs">/jobs</a>. Stored in this site's database; only site admins see this screen.
        </p>

        {editing !== null && (
          <form className="form wide" onSubmit={submit}>
            <h2>{editing === 'new' ? 'New job' : 'Edit job'}</h2>
            <input value={form.title} onChange={field('title')} placeholder="Title" maxLength={120} required />
            <div className="row">
              <input value={form.company} onChange={field('company')} placeholder="Company" maxLength={80} required />
              <input value={form.location} onChange={field('location')} placeholder="Location" maxLength={80} required />
            </div>
            <div className="row">
              <select value={form.type} onChange={field('type')} aria-label="Job type">
                {JOB_TYPES.map(type => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <label className="check">
                <input type="checkbox" checked={form.remote} onChange={field('remote')} /> Remote
              </label>
            </div>
            <textarea value={form.description} onChange={field('description')} placeholder="Description (blank line between paragraphs)" minLength={20} maxLength={10000} rows={8} required />
            <input value={form.applyUrl} onChange={field('applyUrl')} placeholder="Apply link: https://… or mailto:…" maxLength={500} required />
            <div className="actions">
              <button className="button" type="submit" disabled={save.isPending}>
                {save.isPending ? 'Saving…' : 'Save'}
              </button>
              <button className="button ghost" type="button" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </div>
            {save.error && <ErrorNote error={save.error} />}
          </form>
        )}

        {jobs.error && <ErrorNote error={jobs.error} />}
        {rows.length === 0 && jobs.isSuccess && <p className="muted">No jobs yet.</p>}
        <ul className="files">
          {rows.map(job => (
            <li key={job.id}>
              <div>
                <a href={`/jobs/${encodeURIComponent(job.slug)}`}>{job.title}</a>
                <span className="meta">
                  {job.company} · {job.location} · {job.status}
                </span>
              </div>
              <div className="row-actions">
                <button className="button link small-button" onClick={() => void edit(job.id)}>
                  Edit
                </button>
                <button
                  className="button link small-button"
                  onClick={() => setStatus.mutate({id: job.id, status: job.status === 'open' ? 'closed' : 'open'})}>
                  {job.status === 'open' ? 'Close' : 'Reopen'}
                </button>
                <button
                  className="button link small-button"
                  onClick={() => window.confirm(`Delete “${job.title}”?`) && remove.mutate(job.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
        {(setStatus.error || remove.error) && <ErrorNote error={(setStatus.error ?? remove.error)!} />}
        {jobs.hasNextPage && (
          <button className="button ghost" onClick={() => jobs.fetchNextPage()} disabled={jobs.isFetchingNextPage}>
            Load more
          </button>
        )}
      </section>
    );
  },
});

export const routeTree = rootRoute.addChildren([
  overviewRoute,
  uploadsRoute,
  membersRoute,
  jobsRoute,
]);
