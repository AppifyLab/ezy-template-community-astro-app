import {useInfiniteQuery, useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {createRootRoute, createRoute, Link, Outlet, useParams} from '@tanstack/react-router';
import {type ChangeEvent, type FormEvent, useState} from 'react';

import {uploadFile} from '../lib/browser-session';
import {api, read} from './api';

/**
 * The portal's screens: a TanStack Router app under `/portal` (basepath),
 * served by `src/pages/portal/[...path].astro` (members only), with data from
 * the Site API through TanStack Query. Links INSIDE the portal use `<Link>`;
 * links to the Astro pages or the community app (`/`, `/blog`, `/feeds`) are
 * plain `<a href>`.
 */

type Viewer = {
  state: 'member' | 'applicant' | 'returning' | 'guest';
  profileId: number | null;
  profileSlug: string | null;
  name: string | null;
  avatar: string | null;
  roleSlug: string | null;
};
type Note = {id: number; body: string; author: string | null; createdAt: string};
type Upload = {
  id: number;
  url: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
};
type Member = {id: number; slug: string; name: string; avatar: string | null; role: string | null};
type Message = {
  id: number;
  name: string;
  email: string;
  message: string;
  profileId: number | null;
  createdAt: string;
};

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
    queryFn: () => read<{viewer: Viewer; canReadInbox: boolean}>(api.me.$get()),
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
          {me.data?.canReadInbox && <Link to="/inbox">Inbox</Link>}
          <Link to="/notes">Notes</Link>
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
      queryFn: () => read<{database: boolean; communityKey: boolean}>(api.health.$get()),
    });
    const community = useQuery({
      queryKey: ['community'],
      queryFn: () =>
        read<{community: {name: string; logo: string | null} | null}>(api.community.$get()),
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
            <p className="muted">Who is in {community.data?.community?.name ?? 'the community'}.</p>
          </Link>
          <a className="card link-card" href="/feeds">
            <h3>Community</h3>
            <p className="muted">Posts, events and conversations.</p>
          </a>
        </div>
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
    // 1. browser → CDN (presign, PUT, register)  2. this site's backend saves the URL.
    const add = useMutation({
      mutationFn: async (file: File) => {
        const uploaded = await uploadFile(file);
        return read<{upload: Upload}>(api.uploads.$post({json: uploaded}));
      },
      onSuccess: () => queryClient.invalidateQueries({queryKey: ['uploads']}),
    });
    const pick = (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) add.mutate(file);
    };
    const rows = uploads.data?.pages.flatMap(page => page.uploads) ?? [];

    return (
      <section>
        <h1>My files</h1>
        <p className="muted">
          Files go straight from your browser to the community's storage; this site keeps the link.
          Images up to 10 MB, documents up to 500 MB.
        </p>
        <label className="button upload-button">
          {add.isPending ? 'Uploading…' : 'Upload a file'}
          <input type="file" onChange={pick} disabled={add.isPending} hidden />
        </label>
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
          api.members.$get({query: {cursor: pageParam, search: term || undefined}})
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

const inboxRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/inbox',
  component: function Inbox() {
    const messages = useInfiniteQuery({
      queryKey: ['inbox'],
      initialPageParam: undefined as string | undefined,
      queryFn: ({pageParam}) =>
        read<{messages: Message[]; nextBefore: number | null}>(
          api.contact.$get({query: {before: pageParam}})
        ),
      getNextPageParam: last => (last.nextBefore ? String(last.nextBefore) : undefined),
    });
    const rows = messages.data?.pages.flatMap(page => page.messages) ?? [];
    return (
      <section>
        <h1>Inbox</h1>
        <p className="muted">Messages from the contact page. Visible to site admins only.</p>
        {messages.error && <ErrorNote error={messages.error} />}
        {rows.length === 0 && messages.isSuccess && <p className="muted">No messages yet.</p>}
        <ul className="inbox">
          {rows.map(message => (
            <li key={message.id}>
              <p className="meta">
                <strong>{message.name}</strong> ·{' '}
                <a href={`mailto:${message.email}`}>{message.email}</a> · {when(message.createdAt)}
              </p>
              <p>{message.message}</p>
            </li>
          ))}
        </ul>
        {messages.hasNextPage && (
          <button
            className="button ghost"
            onClick={() => messages.fetchNextPage()}
            disabled={messages.isFetchingNextPage}>
            Load more
          </button>
        )}
      </section>
    );
  },
});

const notesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/notes',
  component: function Notes() {
    const queryClient = useQueryClient();
    const [body, setBody] = useState('');
    const [author, setAuthor] = useState('');
    const notes = useQuery({
      queryKey: ['notes'],
      queryFn: () => read<{notes: Note[]}>(api.notes.$get({query: {before: undefined}})),
    });
    const add = useMutation({
      mutationFn: () => read<{note: Note}>(api.notes.$post({json: {body, author}})),
      onSuccess: () => {
        setBody('');
        return queryClient.invalidateQueries({queryKey: ['notes']});
      },
    });
    const submit = (event: FormEvent) => {
      event.preventDefault();
      add.mutate();
    };

    return (
      <section>
        <h1>Notes</h1>
        <p className="muted">The smallest Site Database example: a table, a list, a form.</p>
        <form className="form" onSubmit={submit}>
          <input
            value={author}
            onChange={e => setAuthor(e.target.value)}
            placeholder="Your name (optional)"
            maxLength={80}
          />
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Write a note"
            maxLength={500}
            required
          />
          <button className="button" type="submit" disabled={add.isPending}>
            Add note
          </button>
        </form>
        {add.error && <ErrorNote error={add.error} />}
        {notes.error && <ErrorNote error={notes.error} />}
        <ul className="notes">
          {notes.data?.notes.map(note => (
            <li key={note.id}>
              <Link to="/notes/$id" params={{id: String(note.id)}}>
                {note.body}
              </Link>
              <span className="meta">
                {note.author ?? 'Anonymous'} · {when(note.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    );
  },
});

const noteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/notes/$id',
  component: function NotePage() {
    const {id} = useParams({from: '/notes/$id'});
    const note = useQuery({
      queryKey: ['notes', id],
      queryFn: () => read<{note: Note}>(api.notes[':id'].$get({param: {id}})),
    });
    return (
      <section>
        <Link to="/notes">← All notes</Link>
        {note.error && <ErrorNote error={note.error} />}
        {note.data && (
          <article className="note">
            <p className="lede">{note.data.note.body}</p>
            <p className="meta">
              {note.data.note.author ?? 'Anonymous'} · {when(note.data.note.createdAt)}
            </p>
          </article>
        )}
      </section>
    );
  },
});

export const routeTree = rootRoute.addChildren([
  overviewRoute,
  uploadsRoute,
  membersRoute,
  inboxRoute,
  notesRoute,
  noteRoute,
]);
