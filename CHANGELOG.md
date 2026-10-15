# Changelog

Template releases. `npm run platform -- check` says when a newer one is out;
`npm run platform -- upgrade` applies it (see `scripts/platform.mjs`).
Managed by the template: replaced on upgrade.

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
