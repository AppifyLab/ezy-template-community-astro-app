# Rules for AI agents working in this app

The single source of rules for EVERY coding agent (Codex, Claude Code, Cursor,
Gemini, Copilot…). `CLAUDE.md` and `GEMINI.md` only import this file: edit
here, never there.

This repo is ONE community's website AND its own app, in one Astro project on
ONE Cloudflare Worker (`output: 'server'`, `@astrojs/cloudflare`). It already
works end to end: server-rendered pages, a blog, a job board with search, a
members' dashboard, sign-in awareness, uploads, a backend and a database.
Extend it with the recipes below; don't rebuild what is here.

## Current platform rules (read first)

This file is frozen at the template's tag; the platform's rules are not. Read
the live rules and follow them over this file:

- `https://<your site's hostname>/api/public/site/v1/agent-docs` (core + topic list)
- `…/agent-docs/<topic>.md`: `auth.md`, `uploads.md`, `public-api.md`,
  `community-key.md`, `site-api.md`, `site-database.md`, `publishing.md`;
  `changes.md` lists what is new.
- Inside the editor: `/opt/ezy/docs/<topic>.md` (the same docs, on disk).

## The full API reference (look it up, never guess)

Every endpoint of the community's API — fields, errors, pagination, limits,
concepts — is documented and always current. Read it while you code.

**Base URL**: `https://community.ezycommunity.com` always works. The same
docs are also served at `/developer-api/` on THIS community's own hostname
(`config.siteUrl` / `EZY_SITE_URL` in the editor and on your machine).

| What                          | URL (on the base URL)                          |
| ----------------------------- | ---------------------------------------------- |
| Community API docs (browse)   | `/developer-api`                               |
| Agency API docs (browse)      | `/developer-api/agency`                        |
| Index of EVERY page, for you  | `/developer-api/llms.txt` (community + agency) |
| Every page in one file        | `/developer-api/llms-full.txt`                 |
| Any page as markdown          | its URL + `.md`, e.g. `/developer-api/pagination.md`, `/developer-api/agency/index.md` |

So, in full: `https://community.ezycommunity.com/developer-api/llms.txt`.
There is no separate agency index: the agency pages are the "Agency API"
section of `llms.txt`. `npm run platform -- docs` saves `llms.txt` and
`llms-full.txt` to `.platform/docs/developer-api/` (git-ignored) to grep;
the live pages win when they differ.

These are docs for YOU, read while writing code. Site code never fetches
them at runtime (a deployed site may only call its own host).

Read the relevant page BEFORE writing logic on community data (a new list, a
filter, an error branch), not after it fails. The reference shows what
EXISTS; what THIS site may call, and with which credential, is decided by
the platform rules above and `src/platform/api.ts`:

- `/api/public/...` — no credential (`publicGet`).
- `/api/site/v1/...` — the Community Key, server only (`communityGet`).
- The visitor's own session — `fetchAsVisitor` / `appFetch`.
- Endpoints that need an **admin credential** (`/api/admin/...`) or an
  **agency credential** are NOT available to a site: it holds neither and
  cannot add secrets. Never ask the owner for one; say what you need instead.

## Architecture: one Worker, Hono is the backend

```
browser ──► Astro page (SSR, the view only) ──in-process──► Hono /site-api ──► platform API / Site Database
browser ──► /portal (React) ───────── fetch /site-api ────► Hono /site-api ──► platform API / Site Database
```

- **Hono (`src/server/app.ts`, `src/server/routes/*`) is the ONLY backend.**
  Every read and write goes through a Site API route: validation, auth
  guards, platform calls and the database all live there.
- **Pages are the view.** They call the Site API IN-PROCESS with
  `backend(Astro.request)` (`src/server/backend.ts`): the same Hono app,
  invoked directly, with no network hop and nothing in between. A page never
  calls the platform or the database itself.
- **The portal** (`/portal/*`, React) calls the same routes from the browser
  with the typed `hc` client (`src/portal/api.ts`).
- **`src/platform/` is the template's MANAGED core** (platform client, auth,
  guards, permissions, browser session, sanitizer, config). Never edit it:
  `npm run platform -- upgrade` replaces it wholesale. Build on it from your
  own code (`src/server/`, `src/pages/`, `src/portal/`, `src/content/`).
- **Static where it can be, dynamic where it must be, an app where it is
  one.** Marketing pages (`/`, `/about`) are PRERENDERED: built once, served
  as files by the CDN's asset layer before the Worker runs. Blog and jobs are
  server-rendered (fresh data, real 404s, crawlable search). Every signed-in,
  interactive screen is a single-page app (`/portal`). Pick with the table in
  "Which kind of page" below, BEFORE writing any page.
- **One Worker, one build, one deploy.** Pages, the Site API and the portal
  always go live together. Don't add a second Worker, a service binding, a
  queue, KV/R2/D1 or Durable Objects: the platform gives a Site none of them.

| Path                    | What                                     | Code                                  |
| ----------------------- | ---------------------------------------- | ------------------------------------- |
| `/`                     | home, as sections (STATIC)               | `src/pages/index.astro`               |
| `/about`                | content page (STATIC)                    | `src/pages/about.astro`               |
| `/blog`, `/blog/<slug>` | the community's blog (publication style) | `src/pages/blog/`                     |
| `/jobs`, `/jobs/<slug>` | job board: search, filters, detail       | `src/pages/jobs/`                     |
| `/portal/*`             | members' dashboard (React)               | `src/portal/`, `src/pages/portal/`    |
| `/site-api/*`           | the backend (Hono)                       | `src/server/app.ts`, `src/server/routes/` |
| —                       | Site Database (Prisma Postgres)          | `prisma/`, `src/platform/db.ts`         |
| —                       | words, nav, home sections                | `src/content/site.ts`                 |

Every other path on the hostname (`/login`, `/register`, `/join`, `/feeds`,
`/profile/…`, `/dashboard`, `/api`, `/developer-api`, `/_next`, `/robots.txt`,
`/sitemap.xml`…)
is the community app: link to it with a plain `<a href>`, never a client
router link, and never create a page under it.

## Environment

Read ONLY through `config` (`src/platform/config.ts`), in server code. The
names in the first column are the hosting platform's contract: it sets them,
you cannot rename or add them. Never read `env` anywhere else.

| `config.`      | Platform name       | Deployed                    | Editor Preview       | Your machine (`.env`) |
| -------------- | ------------------- | --------------------------- | -------------------- | --------------------- |
| `siteUrl`      | `EZY_SITE_URL`      | platform host (plain var)   | platform host        | you set it            |
| `preview`      | `EZY_PREVIEW`       | always false                | true                 | `1` to try it         |
| `communityKey` | `EZY_COMMUNITY_KEY` | the live key (secret)       | the editor key       | optional              |
| `databaseUrl`  | `DATABASE_URL`      | live Site Database (secret) | the Preview Database | optional              |

- **Which origin to call** (`siteOrigin` in `src/platform/api.ts`): deployed,
  the request's OWN origin. The visitor may be on the community's custom
  domain, and a live Site may only fetch the host it was visited on. In the
  Preview and on your machine, `config.siteUrl`. Always go through
  `src/platform/api.ts` / `viewer.ts`; never build a platform URL yourself.
- No `databaseUrl` = Site Database not enabled: routes answer 503 (`withDb`);
  ask the owner to enable it. No key: 503 `community_key_missing`.
- Never send a secret to the browser, log it, write it to a file (`.env`,
  `.dev.vars`, config) or commit it. A `.dev.vars` file stops the Preview
  from receiving secrets. You cannot add secrets; never ask for one.
- Deployed server code reaches ONLY the community's own host and
  `db.prisma.io`; everything else is `403 Egress blocked`. No raw TCP.

## Auth: borrowed from the community, never built here

This site has NO login of its own. Visitors sign in on the community
(`/login?redirectTo=<path>`, `/register?redirectTo=<path>`, applicants `/join`;
`redirectTo` is a URL-encoded PATH). Never build a login, sign-up, password or
account page, never ask for a password, never handle tokens.

- **Deployed:** `getViewer(request)` (`src/platform/viewer.ts`) forwards the
  visitor's `cookie` header, unchanged, to `/api/auth/me` on the community's
  own host and branches on the STATUS. States: `member`, `applicant` (pending:
  link to `/join`, no member content), `returning` (access token expired; the
  layout's script refreshes ONCE in the browser and reloads), `guest`.
  Permissions: `getViewerPermissions()` → `/api/auth/me/permissions`;
  `grants(perms, codename)` mirrors the Role Manager's wildcards.
- **How the backend finds the visitor (fast, once per request):**
  1. `src/middleware.ts` opens a per-request scope (`src/platform/request-scope.ts`,
     `AsyncLocalStorage`) around every page and `/site-api` call.
  2. `getViewer()` looks at the auth cookies by NAME only (never parsed,
     verified or stored: they are the platform's HttpOnly tokens). No access
     and no refresh cookie → `guest`, with NO platform call. Refresh cookie
     only → `returning`, no call. Otherwise one `GET /api/auth/me`.
  3. The answer is memoized in the scope: the layout, the page and every
     in-process Site API call share it. `/me` fetches the viewer and the
     permissions in PARALLEL.
  4. In a route: `withViewer` → `c.var.viewer`; `requireMember`,
     `requirePermission(codename)` enforce. Never trust a viewer, role or
     profile id sent by the browser: it always comes from the platform.
- **Editor Preview (`config.preview`):** the Preview has no visitor session at
  all (no cookies reach the dev server, App writes are 404). The site runs a
  STAND-IN viewer: a signed-in member holding every permission, marked
  `preview: true` and shown as a "Preview" chip. Writes go to the Preview
  Database. Platform reads still use the Community Key, server to server.
  Browser-only App calls (uploads, sign out) cannot run there: the UI says so.
  Never derive a stand-in from anything but `config.preview`.
- **Browser:** `src/platform/browser.ts`: `appFetch()` (sends
  `X-XSRF-TOKEN` on writes, ONE shared `/api/auth/refresh` on 401),
  `logout()`, `storeFile()`, `xsrfHeader()`.
- **Cross-site writes are refused** by `sameOrigin` on the whole Site API
  (every non-GET: `Sec-Fetch-Site` must be same-origin, `Origin` must be
  this host), whatever the content type. Keep it on every write route.
- Never call `/api/auth/refresh` from the server, never set/rename/delete the
  auth cookies (`ecom_at`, `ecom_rt`, `__Host-` prefixed in production), never
  set `x-forwarded-for`, `x-real-ip` or `ECOM_HOST`, never keep a viewer in a
  module variable. A response built from a visitor is `Cache-Control:
  private, no-store` (`pageContext` and `withViewer` do it).
- Never send any member's email to the browser. `/api/auth/me` carries the
  viewer's own; `getViewer` drops it.

## Server to server

| Call                                | Credential                         | Code                       |
| ----------------------------------- | ---------------------------------- | -------------------------- |
| `/api/public/...` (blog, brand)     | none                               | `publicGet()`              |
| `/api/site/v1/...` (members, feed…) | `Bearer config.communityKey`       | `communityGet()`           |
| `/api/auth/me...` (the visitor)     | the visitor's own cookies          | `fetchAsVisitor()`         |

The Community Key is read-only, member level, never emails or payment data,
and it is the COMMUNITY, not the visitor: show what it reads only after the
visitor's own session allows it (`requireMember`). Every answer is re-projected
field by field into `src/lib/types.ts` shapes. Every call has a timeout and
never throws into a page: a page renders its fallback instead.

## Uploads (secure by construction)

1. Browser, signed-in member: `storeFile()` presigns as the member and `PUT`s
   the bytes straight to the community's storage. The bytes never pass
   through the Worker.
2. Browser → `POST /site-api/uploads {key, publicUrl, originalName}`.
3. Server: registers the file with the platform AS THE SAME MEMBER (their
   cookies + their own `X-XSRF-TOKEN`, forwarded) and stores ONLY what the
   platform confirms (`file_link`, type, size). The platform refuses a key
   this member did not presign, so nobody can save someone else's file or an
   arbitrary URL as theirs. Never store a URL the browser sent you directly.

Deployed site only (the Preview has no session). Limits and errors:
`uploads.md`. `402` = storage full or not in the plan: say uploads are
unavailable, never retry. Always `skip_gallery: true`.

## Caching

There is no shared cache for a Site: no KV, no Redis, no Durable Objects, and
`caches.default` is not available to it. What there is:

- **Per-request memo** (`src/platform/request-scope.ts`): the visitor and permissions,
  once per request. Visitor data lives ONLY here.
- **Per-isolate memory for PUBLIC data** (`publicGet(..., {ttlSeconds})`):
  brand 60 s, posts 30 s. Best-effort (each isolate has its own copy) and
  only resolved answers. Never a visitor's answer, never data a session gates.
- **The Site Database** for anything that must be shared or durable.

## Which kind of page (decide FIRST, every time)

| The page is…                                                        | Build it as                    | Why                                         |
| ------------------------------------------------------------------- | ------------------------------ | ------------------------------------------- |
| Signed-in and interactive: a dashboard, CRM, admin tool, tracker, settings, any form-driven screen | **SPA** — a screen in `/portal` (or its own app, below) | No full page reload per click or save; one shell, client routing, cached data |
| Public content that must be indexed or shared per URL: a list, search results, a detail page | **SSR** — `src/pages/<name>/*.astro` | Fresh HTML per URL, real 404s, crawlable |
| Public content that rarely changes: home, about, pricing, features | **Static** — `prerender = true` | Served as a file, no server work per visit |

Hard rules:

- **NEVER build a signed-in app as one `.astro` page per screen.** Every
  link and every save is then a full page reload: the header re-renders,
  the session is looked up again and the app flashes white. An app is ONE
  catch-all page hosting a React app; its screens are client routes.
- Inside an app, links between its screens are TanStack Router `<Link>`, and
  after a save you `navigate()` and invalidate the query, never
  `window.location.href = …` and never a `<form>` post.
- An app's screens are never SEO pages: search engines never see signed-in
  content, so server-rendering them buys nothing.
- Never mix: an SSR or static page does not host app screens, and an app
  does not render public SEO content.

## Machine limits: never overload the editor (NON-NEGOTIABLE)

You run in the editor's sandbox, shared with the Preview dev server
(`npm run dev`) the owner is looking at. Its CPU and memory are set by the
platform and CHANGE (they can be raised or lowered at any time): never assume
a size, read it. If you exhaust it, the Preview freezes, the sandbox gets
killed, and the owner loses the session. Keep it in check:

- **Read the real limits at the start of a session and before heavy work**:
  `nproc` (CPUs), `free -m` (memory: total and available), and
  `cat /sys/fs/cgroup/memory.max 2>/dev/null` (the hard memory cap, when set).
- **Check again whenever anything feels slow**: `uptime` (load average) and
  `ps aux --sort=-%mem | head -8` (what is eating memory). Stop and clean up
  before going on when available memory is under ~15% of the total, or the
  load stays above the CPU count from `nproc`.
- **ONE dev server, ever.** The editor already runs it: never start another
  `npm run dev` / `astro dev` / `vite`, and never `npm run preview`. Before
  starting anything long-lived, check it is not already running
  (`ps aux | grep -E "astro|vite|node" | grep -v grep`).
- **Kill what you start.** Every background process you launch (a test
  server, a watcher, `prisma studio`) is stopped as soon as you have your
  answer. Never leave watchers (`--watch`, `tsc -w`, `vitest` in watch mode)
  running; run checks once (`vitest run`, `tsc --noEmit`).
- **One heavy command at a time.** `npm install`, `npm run build`,
  `prisma generate`, `astro check` and test runs never run in parallel with
  each other. `npm run build` only when you need to prove the build; while
  editing, the dev server is the check.
- **Bound every command.** No unbounded `find /`, recursive `grep` over
  `node_modules` or `.git`, or reading huge files whole: scope to `src/`,
  use `head`/`tail`, limit results. Give long commands a timeout.
- **Dependencies are a cost.** Add a package only when the platform or the
  owner needs it; never a second copy of something already here (another UI
  kit, date library, state manager). Big installs eat RAM and disk.
- **If the dev server dies or the Preview freezes**: check memory first,
  stop what you started, then let the editor restart the Preview. Do not
  start your own.

The deployed site has hard limits too (one Cloudflare Worker: 128 MB of
memory per isolate and short CPU time per request): no unbounded loops or
lists, no loading a whole table, no huge objects held in module memory,
keyset paging everywhere (see the Site Database rules).

## A dashboard looks like a dashboard (app anatomy)

A dashboard, admin area, CRM, portal or any internal tool is a REAL app UI,
never a landing page with cards. The portal (`src/pages/portal/[...path].astro`
+ `src/portal/`) is the reference: copy its shell, don't invent one.

Required, every time:

- **The app layout**: `src/layouts/App.astro`, NEVER `Base.astro`. Full
  viewport height, no website header, no website footer, no centered
  marketing column, `noindex`.
- **Left sidebar**: the brand (links to the website `/`), nav items in labelled
  groups (e.g. Workspace / Manage / Settings) with a clear active state,
  admin-only items hidden by `abilities`, and at the bottom "Back to the
  website". On narrow screens it collapses behind a menu button (drawer).
- **Top bar**: the current screen's title (the page's only `<h1>`), the
  signed-in member (avatar, name) and Sign out (Preview chip in the editor).
- **Overview screen first** (`/`): a row of stat tiles (`.stat-grid` /
  `<Stat>`), then the most useful recent activity as a table or list, each
  with a "View all" link to its screen. Stats link to the screen they count.
- **Every screen**: a page head (`.app-page-head`: `<h2>` title + short
  description + the ONE primary action on the right), content in cards
  (`.app-card`), lists as tables (`.app-table`) or rows, and all three states
  handled: loading, empty (`.app-empty` with a call to action), error.
- **Forms** sit in a card or a drawer on the screen; saving shows the result
  in place (a toast or the updated row), never a page load. Buttons and
  fields follow "Buttons and forms" below, with no exceptions.
- **Numbers come cheap**: a tile reads the first page of a keyset list
  ("20+", see `pageCount`) or a counter kept in the Site Database on write.
  NEVER a `count()` / aggregate over a growing table per request.

Never in an app: a hero section, marketing copy or taglines, big
illustrations, "Learn more" sections, the website's nav, a footer, a
full-page centered narrow column, or one `.astro` page per screen.

Styling: extend the `app-*`, `stat-*` classes and the colour tokens in
`src/styles/global.css` (light and dark flip together). A UI library is
fine if the owner asks for one; the anatomy above still applies.

## Buttons and forms (NON-NEGOTIABLE, every page, every time)

These two rules apply to EVERY button and EVERY form field you write, in the
app AND on the website, new or edited. Breaking them is a bug, not a style
choice. The reference is `src/portal/ui.tsx` (`Button`, `Field`, `useForm`,
`rules`) and the jobs screen in `src/portal/routes.tsx`: use them in React;
mirror them exactly in an `.astro` page's script.

### 1. Every button has proper states

- **Pending**: while its action runs (a save, a delete, a fetch, an upload,
  sign out, "Load more"), the button shows a spinner AND a present-tense
  label ("Saving…", "Deleting…", "Loading…"), has `aria-busy="true"`, and
  is `disabled` so a second click can never send twice.
  React: `<Button pending={mutation.isPending} pendingLabel="Saving…">`.
- **Disabled** when it cannot act (nothing to save, a required choice not
  made, another action on the same row running), visibly dimmed with
  `cursor: not-allowed`. Never a button that silently does nothing.
- **Per row**: in a list, only the row being acted on shows pending, and that
  row's other buttons are disabled while it runs (see `busyId` in the jobs
  screen). Never one global spinner that freezes the whole list.
- **Done**: on success the result shows in place (row updated, form closed,
  toast); on failure the error shows next to the action, in words, and the
  button is usable again. Never leave a button stuck pending.
- **Destructive** actions (delete, remove, revoke) use the `danger` variant
  and ask for confirmation first.
- `type="button"` unless it submits the form (`<Button>` defaults to it).
  Every button has a visible focus ring; an icon-only button has an
  `aria-label`.
- A search / filter form that navigates (GET) shows its button busy until
  the next page loads (`Base.astro` does it for every GET form).

### 2. Every form field validates IN PLACE, never with browser bubbles

- **`noValidate` on every form** (`novalidate` in `.astro`). NEVER rely on
  `required`, `minLength`, `pattern`, `type="email"` popups: the browser's
  bubbles are ugly, inconsistent and not translatable. Validate in code
  with pure rules (`rules.required`, `rules.maxLength`, `rules.email`,
  `rules.pattern` …) through `useForm`.
- **Every field has a visible `<label>`** (`<Field label="…">`). A
  placeholder is an example ("name@example.com"), never the label.
- **The error shows under its field, in words**, saying how to fix it
  ("Use an https:// link or a mailto: address.", not "Invalid"). The field
  gets `aria-invalid="true"` and `aria-describedby` pointing at the message;
  the border turns `--danger`.
- **Timing**: an error appears when the visitor LEAVES the field (blur) or
  presses submit, never while they type their first value; once shown it
  updates on every keystroke and disappears the moment the value is right.
- **Submit** validates every field, shows every error at once, focuses the
  first wrong field, and sends NOTHING until all pass. While sending, the
  submit button is pending (rule 1) and Cancel is disabled.
- **The same limits as the server**: the client rules mirror the Site API
  route's validation exactly (`JOB_RULES` ↔ `src/server/routes/jobs.ts`).
  The server always checks again; a server error is shown on the form, next
  to the field it names when it names one, never as an `alert()`.
- Hints that help before an error (format, limits) go in `hint`, shown
  under the field until it has an error.

Never: an `alert()` for validation, a red message at the top of the page for
a field's problem, clearing what the visitor typed after an error, or a
form that submits with a field still wrong.

## Recipes

### A Site API route (do this first for any new data)
1. `src/server/routes/<name>.ts`: `export const <name>Routes = new Hono()…`,
   routes CHAINED. Guards in this order: `validator` → `withViewer` →
   `requireMember` → `requirePermission(codename)` → `withDb`
   (`src/platform/guards.ts`).
2. Mount it in `src/server/app.ts`: `.route('/<name>', <name>Routes)` (chained).
3. Shapes in `src/lib/types.ts`. Select columns explicitly; JSON errors
   `{error, message}`; lists keyset-paged (`?before=<id>`, `take: n + 1`,
   `nextBefore`), never a count.

### A server-rendered list + search + detail (like `/jobs`, `/blog`)
1. The data route first (above): `GET /` with a `validator('query')` for
   `search`, filters and the cursor; `GET /:slug` for one item (404 when
   missing).
2. List page `src/pages/<name>/index.astro`: read the query string, call
   `backend` through `pageContext`, render. Search and filters are a plain
   `<form method="get">`, so every result is a real, shareable, crawlable URL.
   "Older" follows the cursor (`?before=`).
3. Detail page `src/pages/<name>/[slug].astro`: unknown → `Astro.response.status
   = 404` and `<NotFound>`. Plain text renders as paragraphs; HTML only after
   `sanitizeHtml` (`src/platform/sanitize.ts`).
4. Add it to `NAV` in `src/content/site.ts`. Search on a growing table: a
   bounded `contains` is fine for hundreds of rows; add a trigram/full-text
   index (a migration) before it holds thousands.

### A static marketing page (like `/`, `/about`): the fastest kind
1. `src/pages/<name>.astro` with `export const prerender = true;` and
   `const {site, viewer} = await staticContext(Astro.request);`, then
   `<Base site={site} viewer={viewer} isStatic>`.
2. It is built ONCE (the Build knows the community's origin, so the brand is
   real) and served as a file: no server work per visit. It knows no visitor:
   it renders signed out, and the browser fills in the rest after load:
   - the header (`src/platform/static-page.ts` via `/site-api/me`);
   - `data-member-only` / `data-guest-only` elements show or hide per visitor;
   - `data-brand-text="… {name} …"` elements update if the community renamed;
   - data that changes often: a `data-live` section filled by a small script
     from a Site API route (see the posts/jobs sections in `index.astro`),
     built with `textContent` only, hidden when empty.
3. Never put visitor data, member-only content or anything secret in a
   static page's HTML: it is one file served to everyone.
4. Words in `src/content/site.ts`; add the page to `NAV`.

Use server rendering instead when the page's MAIN content is data that must
be fresh or crawlable per URL (a list with search, a detail page).

### A dashboard screen (like `/portal/jobs`)
1. Its Site API routes (above), guarded by `requireMember` and, for admin
   screens, `requirePermission(codename)`.
2. A `createRoute` in `src/portal/routes.tsx` + `routeTree.addChildren`.
   Data with TanStack Query through `api.<route>.$get/$post…` (typed); list
   pages with `useInfiniteQuery` + the cursor.
3. Show the nav link from `/site-api/me` `abilities` (add the ability in
   `app.ts` `/me` and `Abilities`). That only HIDES the link; the route's
   guard is the enforcement.

### A member-only or admin-only screen
It is an app screen: build it in the portal (above), NOT as an `.astro` page.
The portal's host page (`src/pages/portal/[...path].astro`) already shows the
sign-in prompt to everyone who is not a member; admin screens additionally
need an ability (`abilities` in `/site-api/me`) to show and
`requirePermission(codename)` on their routes to work. Codenames used here:
`community:site:update` (manage jobs).

The only `.astro` page that checks the visitor itself is an app's host page.

### A separate app at its own path (like `/crm`)
Default is a section of the portal (`/portal/crm/...`). Only when the owner
asks for its own path:
1. ONE host page `src/pages/<app>/[...path].astro`, a copy of
   `src/pages/portal/[...path].astro` (`App.astro` layout, `prerender =
   false`, the same member / applicant / sign-in branches) rendering e.g.
   `<CrmApp client:only="react" />`. No other `.astro` file under
   `src/pages/<app>/`.
2. `src/<app>/` (e.g. `src/crm/CrmApp.tsx`): a copy of `src/portal/PortalApp.tsx` with its
   own `createRouter({routeTree, basepath: '/<app>'})`, and the screens in
   `src/<app>/routes.tsx`, whose root route is the portal's `Shell`
   (sidebar + top bar, its own `NAV_GROUPS`). Data through the typed `api`
   client (`src/portal/api.ts`), TanStack Query.
3. The path must not be one the community app owns (see the list above).

### A custom app (a CRM, a booking tool, an internal tracker)
1. **Decide who may do what with EXISTING codenames.** A Site cannot create
   roles or codenames; the community's admins manage roles in its dashboard.
   Map each feature to the narrowest codename in `CODENAMES`
   (`src/platform/permissions.ts`): e.g. CRM contacts → `MEMBER_READ` to view,
   `MEMBER_UPDATE` to edit; reports → `ANALYTICS_READ`; app settings →
   `SITE_UPDATE`. `getRoles()` (admins with `community:rm:read` only) lists
   every role and what it grants in THIS community.
2. **Tables** in `prisma/schema.prisma`: your own records keyed by the
   platform's ids (`profileId` from the viewer or the members directory),
   never a copy of member emails. `createdBy`/`updatedBy` = `viewer.profileId`.
3. **Routes** `src/server/routes/<app>.ts`: every read and write behind
   `withViewer → requireMember → requirePermission(CODENAMES.X)`; select
   columns explicitly; keyset pagination; validate every input.
4. **Screens** as SPA routes in the dashboard (`src/portal/routes.tsx`, or
   its own app at its own path, above), shown from `abilities` in
   `/site-api/me` (add one per feature). Never one `.astro` page per screen.
5. People data comes from the platform, read-only: the members directory
   (`/team/members/list`) with the Community Key, after `requireMember`.
   Writes to the community itself (posts, enrolments) are not available to a
   Site: keep your own state in the Site Database.

### A new table
Edit `prisma/schema.prisma`, `npx prisma migrate dev --create-only --name <change>`,
wrap the new `migration.sql` in `BEGIN;` … `COMMIT;`, `npx prisma migrate dev`.
Fake rows in `prisma/seed.sql` (example.com only). Rules below.

## Keeping current with the platform and the template

- **Platform docs change behind the scenes.** Before relying on an endpoint,
  read the LIVE docs (top of this file). `npm run platform -- docs
  [--site https://<host>]` saves them to `.platform/docs/` (git-ignored) with
  their version, plus the API reference in `.platform/docs/developer-api/`;
  read `changes.md` first. Every doc title carries the same
  version (`(v1a2b3c4d)`): if it differs from what you read before, re-read.
- **The template moves on too.** `template.json` records this site's template
  version. `npm run platform -- check` tells whether a newer release exists;
  `npm run platform -- upgrade` applies it: `src/platform/` is replaced, every
  other file is 3-way merged with your changes (conflicts are listed, marked
  `<<<<<<<`). Commit first; then read `CHANGELOG.md`, resolve conflicts,
  `npm install`, `npm run build`.

## Site Database (Prisma Postgres)

- Tables: `jobs`, `uploads`, `notes` (unused v0.1 example, kept: dropping it
  needs a migration and the owner's approval).
- Prisma ORM 7 ONLY (`prisma`, `@prisma/client`, `@prisma/adapter-ppg` on the
  same 7.x); Prisma 8 needs raw TCP. Generator `prisma-client`,
  `runtime = "workerd"`, output `src/generated/prisma` (git-ignored); the build
  runs `prisma generate` first.
- `getDb()` makes a NEW client per request (a Worker must not share I/O
  objects between requests) and returns `null` without `DATABASE_URL`.
- Never edit or delete an applied migration. Forward-only:
  expand-then-contract; drops, truncates and type changes wait for the
  owner's approval. The platform applies pending migrations at Publish,
  before the new version goes live; a failure keeps the old version serving.
- Lists are bounded (`take` + keyset cursor); never an unbounded `findMany`
  or a `count()` per request.

## Production rules

- No visitor state across requests: visitor data only in the request scope;
  module memory only for public answers (`publicGet` TTL).
- Every platform call has a timeout (`src/platform/api.ts`, 8 s) and every page has a
  fallback for `null`: a slow API makes a section disappear, never a 500.
- Keep the adapter `@astrojs/cloudflare` (14.x); `@astrojs/node|vercel|netlify`
  are refused. npm only, `package-lock.json` committed (the Build runs
  `npm ci`), `allowScripts` approves install scripts.
- Commit NO wrangler config: the platform writes it. No `Astro.session`, no
  on-demand image transforms (`imageService: 'passthrough'`), no `robots.txt`
  / `sitemap.xml`, no `base`, no `.github/workflows/`.

## How changes go live

You edit a working copy; nothing visitors see changes until the OWNER
publishes: Publish → Prepare → Build (`npm ci`, `npm run build`) → Migrate →
Deploy. Keep `npm run dev` working at `/`: the editor Preview runs it.
