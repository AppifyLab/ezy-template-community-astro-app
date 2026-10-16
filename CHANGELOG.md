# Changelog

Template releases. `npm run platform -- check` says when a newer one is out;
`npm run platform -- upgrade` applies it (see `scripts/platform.mjs`).
Managed by the template: replaced on upgrade.

## 0.4.4

- `AGENTS.md`: "Buttons and forms (NON-NEGOTIABLE)". Every button has
  pending (spinner + "Saving…" + `aria-busy` + disabled), disabled, per-row
  and error states. Every form is `noValidate` with labelled fields and
  in-place validation errors (on blur / submit, focus the first wrong field),
  never browser bubbles, using the same limits as the server.
- `AGENTS.md`: "Machine limits: never overload the editor". CPU and memory
  are dynamic, so the agent reads them (`nproc`, `free -m`, the cgroup
  `memory.max`) instead of assuming a size, and stops when available memory
  drops under ~15% or load stays above the CPU count. One dev server ever,
  kill what you start, no watchers, one heavy command at a time, bounded
  commands; plus the Worker's 128 MB / short-CPU limits.
- New `src/portal/ui.tsx`: `Button` (pending / disabled / variants),
  `Field` (label, hint, error, aria wiring), `useForm` + pure `rules`.
- The jobs screen uses them: labelled fields, rules mirroring
  `src/server/routes/jobs.ts`, per-row pending on Edit / Close / Delete.
  Every other portal button (Sign out, Load more, Search, Upload) shows
  pending too.
- The website: Sign out shows "Signing out…"; a GET search or filter form
  shows its button busy until the next page loads.
- CSS: `--danger` token, button disabled / busy / focus styles, spinner,
  `.field`, `.field-error`, `.form-grid`.

## 0.4.2

- `AGENTS.md`: the API reference section names the base URL
  (`https://community.ezycommunity.com`, or the community's own host) and
  every docs URL in full: community docs, agency docs, `llms.txt`,
  `llms-full.txt`, and `.md` per page. Notes there is no separate agency
  index.
- `npm run platform -- docs` falls back to `https://community.ezycommunity.com`
  for the API reference when the community's own host does not serve it.

## 0.4.1

- `AGENTS.md`: "The full API reference" — every endpoint is documented live
  at `/developer-api/llms.txt` on any community hostname (`.md` per page,
  `agency/` for the agency API). Look it up before writing logic; the
  platform rules still decide what a site may call (no admin or agency
  credential on a site).
- `npm run platform -- docs` also saves the API reference
  (`.platform/docs/developer-api/llms.txt`, `llms-full.txt`), and saves what
  it can when one of the two sources is unreachable.

## 0.4.0

- `AGENTS.md`: "Which kind of page" — signed-in, interactive screens
  (dashboards, CRMs, admin tools) are ALWAYS a single-page app (the portal,
  or one catch-all host page per app), never one `.astro` page per screen;
  SSR is for crawlable public lists and details, static for marketing pages.
  Recipe for a separate app at its own path (`/crm`).
- `AGENTS.md`: "A dashboard looks like a dashboard" — required app anatomy
  (app layout, sidebar, top bar, stat tiles, tables, loading/empty/error) and
  what never goes in an app (hero, marketing copy, site header/footer).
- The portal is now a real app shell: new `src/layouts/App.astro` (full
  height, no website header/footer, `noindex`), a grouped left sidebar that
  collapses to a drawer on mobile, a top bar with the member and Sign out,
  and an overview with stat tiles and recent files. Styles: `app-*`, `stat-*`
  in `global.css` (the old `.portal-nav` is gone).
- Fix: with `sessionStorage` blocked, an expired session reloaded the page
  on every load. It now never reloads when it cannot remember it did.

## 0.3.1

- `npm run dev` generates the Prisma client first. A fresh copy (the editor
  Preview, a new clone) failed with "Failed to load url
  ../generated/prisma/client" because the client is git-ignored and only the
  build script generated it.

## 0.3.0

- `src/platform/` is the template's managed core (platform API client,
  visitor auth, guards, permissions, browser session, sanitizer, config).
  Upgrades replace it wholesale; your code lives everywhere else.
- `npm run platform -- docs | check | upgrade`: live platform docs, release
  check, and a 3-way merge upgrade that keeps your changes.
- `template.json` records which template version this site is on.

## 0.2.0

- Hono backend for every page and screen, called in-process by pages.
- Blog (publication style, search), job board (search, filters, detail,
  admin CRUD), sectioned home, about.
- Visitor auth borrowed from the community session; editor Preview stand-in.
- Server-verified uploads; cross-site write guard; per-request auth memo.
