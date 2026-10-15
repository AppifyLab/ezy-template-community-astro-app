# `src/platform/` — the template's managed core

Everything in this folder belongs to the template, not to this site. It is
how the site talks to the community platform safely:

| File               | What                                                                 |
| ------------------ | -------------------------------------------------------------------- |
| `config.ts`        | the platform's environment, read in one place                        |
| `api.ts`           | platform calls: public API, Community Key, origin rule, public cache |
| `viewer.ts`        | who is visiting (their own session; editor Preview stand-in)         |
| `permissions.ts`   | `can()`, `CODENAMES`, `getRoles()` on the community's Role Manager   |
| `guards.ts`        | Site API middleware: `sameOrigin`, `withViewer`, `requireMember`, `requirePermission`, `withDb` |
| `request-scope.ts` | per-request memo of the visitor                                      |
| `db.ts`            | the Site Database client (a new one per request)                     |
| `browser.ts`       | browser: session refresh, sign out, CSRF header, file storage        |
| `sanitize.ts`      | cleans platform HTML before a page renders it                        |
| `types.ts`         | shared shapes (`Site`, `Viewer`)                                     |

**Do not edit these files.** `npm run platform -- upgrade` replaces this
folder wholesale with the next template release, so a change here is lost.
Build on it from your own code (`src/server/`, `src/pages/`, `src/portal/`):
wrap a helper, add a route, add a guard of your own next to it. If something
here is wrong or missing, ask for it upstream.
