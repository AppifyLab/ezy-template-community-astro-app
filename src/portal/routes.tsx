import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {createRootRoute, createRoute, Link, Outlet, useParams} from '@tanstack/react-router';
import {type FormEvent, useState} from 'react';

import {api, read} from './api';

/**
 * The portal's pages: a TanStack Router app under `/portal` (basepath), served
 * by `src/pages/portal/[...path].astro`, data through TanStack Query from the
 * Site API. Links INSIDE the portal use `<Link>`; links to the Astro pages or
 * to the community app (`/`, `/blog`, `/feeds`) are plain `<a href>`.
 */

type Note = {id: number; body: string; author: string | null; createdAt: string};

const when = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {dateStyle: 'medium', timeStyle: 'short'}).format(
    new Date(iso)
  );

function ErrorNote({error}: {error: Error}) {
  return <p className="notice">{error.message}</p>;
}

const rootRoute = createRootRoute({
  component: () => (
    <div className="portal">
      <nav className="portal-nav">
        <Link to="/" activeOptions={{exact: true}}>
          Overview
        </Link>
        <Link to="/notes">Notes</Link>
        <Link to="/community">Community</Link>
      </nav>
      <Outlet />
    </div>
  ),
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
    const health = useQuery({
      queryKey: ['health'],
      queryFn: () =>
        read<{database: boolean; communityKey: boolean}>(api.health.$get()),
    });
    return (
      <section>
        <p className="eyebrow">Portal</p>
        <h1>Your app</h1>
        <p className="lede">
          A React app inside your site. It talks to your own backend at <code>/site-api</code>,
          which stores data in your Site Database and reads your community as the Community.
        </p>
        {health.error && <ErrorNote error={health.error} />}
        {health.data && (
          <ul className="status">
            <li>
              Site Database: <strong>{health.data.database ? 'connected' : 'not enabled yet'}</strong>
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

const notesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/notes',
  component: function Notes() {
    const queryClient = useQueryClient();
    const [body, setBody] = useState('');
    const [author, setAuthor] = useState('');
    const notes = useQuery({
      queryKey: ['notes'],
      queryFn: () => read<{notes: Note[]}>(api.notes.$get()),
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
        <p className="muted">Stored in your Site Database.</p>
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

const communityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/community',
  component: function Community() {
    type Info = {community: {name: string; logo: string | null} | null};
    const info = useQuery({
      queryKey: ['community'],
      queryFn: () => read<Info>(api.community.$get()),
    });
    const community = info.data?.community;
    return (
      <section>
        <h1>Community</h1>
        <p className="muted">Read by your server with the Community Key.</p>
        {info.error && <ErrorNote error={info.error} />}
        {community && (
          <p className="lede">
            {community.logo && <img src={community.logo} alt="" height={32} />} {community.name}
          </p>
        )}
        {/* The community app, outside this site: a plain link. */}
        <a href="/feeds">Open the community →</a>
      </section>
    );
  },
});

export const routeTree = rootRoute.addChildren([
  overviewRoute,
  notesRoute,
  noteRoute,
  communityRoute,
]);
