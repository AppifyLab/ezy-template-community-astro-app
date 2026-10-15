# Changelog

Template releases. `npm run platform -- check` says when a newer one is out;
`npm run platform -- upgrade` applies it (see `scripts/platform.mjs`).
Managed by the template: replaced on upgrade.

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
