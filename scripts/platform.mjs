#!/usr/bin/env node
/**
 * Keeps this site current with the platform and the template it started from.
 * Runs on a development machine or in the editor (never deployed). Node 22+,
 * plus `tar` and `git` on the PATH. No dependencies.
 *
 *   npm run platform -- docs       live platform docs → .platform/docs/ (git-ignored)
 *   npm run platform -- check      is a newer template release out?
 *   npm run platform -- upgrade [--to vX.Y.Z] [--dry-run]
 *
 * UPGRADE, file by file, from the version in `template.json` to the target:
 *   - MANAGED paths (`src/platform/**`, this script, `CHANGELOG.md`) are the
 *     template's own: replaced wholesale. Do not edit them; extend them from
 *     your own code instead.
 *   - Everything else is a 3-way merge (`git merge-file`): base = the old
 *     template, ours = your file, theirs = the new template. Your changes are
 *     kept; a clash is written with conflict markers and listed at the end.
 *   - A file you deleted stays deleted; a file the template added is added
 *     (unless you already have one at that path, which is merged).
 * Then `template.json` records the new version. Review with `git diff`, solve
 * the listed conflicts, run `npm install`, `npm run build`.
 */
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, relative} from 'node:path';

const ROOT = process.cwd();
const MANIFEST = join(ROOT, 'template.json');
const MANAGED = [/^src\/platform\//, /^scripts\/platform\.mjs$/, /^CHANGELOG\.md$/];
const NEVER = [/^\.git\//, /^node_modules\//, /^dist\//, /^\.astro\//, /^src\/generated\//, /^template\.json$/, /^\.env$/, /^\.dev\.vars/];
const SKIP_IN_MERGE = [/^package-lock\.json$/];

const [command = 'help', ...args] = process.argv.slice(2);
const flag = name => args.includes(name);
const option = name => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

function readManifest() {
  if (!existsSync(MANIFEST)) throw new Error('template.json not found: run this from the project root.');
  return JSON.parse(readFileSync(MANIFEST, 'utf8'));
}

const semver = tag => tag.replace(/^v/, '').split('.').map(Number);
const newer = (a, b) => {
  const [x, y] = [semver(a), semver(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};

async function github(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {accept: 'application/vnd.github+json', 'user-agent': 'community-site-platform-script'},
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${path}`);
  return res;
}

async function latestTag(repo) {
  const tags = await (await github(`/repos/${repo}/tags?per_page=100`)).json();
  const versions = tags.map(t => t.name).filter(n => /^v\d+\.\d+\.\d+$/.test(n));
  if (!versions.length) throw new Error(`no release tags on ${repo}`);
  return versions.reduce((best, tag) => (newer(tag, best) ? tag : best));
}

/** Downloads and unpacks `repo@tag`; returns the folder holding the project. */
async function fetchTemplate(repo, tag, into) {
  const res = await github(`/repos/${repo}/tarball/${tag}`);
  const file = join(into, `${tag}.tar.gz`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  const dir = join(into, tag);
  mkdirSync(dir, {recursive: true});
  execFileSync('tar', ['-xzf', file, '-C', dir, '--strip-components=1']);
  return dir;
}

function listFiles(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(base, full).split('\\').join('/');
    if (NEVER.some(re => re.test(rel + (statSync(full).isDirectory() ? '/' : '')))) continue;
    if (statSync(full).isDirectory()) listFiles(full, base, out);
    else out.push(rel);
  }
  return out;
}

const read = path => (existsSync(path) ? readFileSync(path) : null);
const same = (a, b) => a !== null && b !== null && Buffer.compare(a, b) === 0;

function write(path, data, dryRun) {
  if (dryRun) return;
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, data);
}

/** Where the API reference always answers; a community's own host serves the same docs. */
const API_DOCS_BASE = 'https://community.ezycommunity.com';

async function docs() {
  const site = (option('--site') ?? process.env.EZY_SITE_URL ?? '').replace(/\/+$/, '');
  if (!site) throw new Error('pass --site https://<your community host> (or set EZY_SITE_URL).');
  const out = join(ROOT, '.platform', 'docs');
  mkdirSync(out, {recursive: true});
  const get = url => fetch(url, {headers: {'user-agent': 'community-site-platform-script'}}).catch(() => null);

  // 1. The platform rules for Sites (core + topics).
  const base = `${site}/api/public/site/v1/agent-docs`;
  const index = await get(base);
  if (index?.ok) {
    const core = await index.text();
    writeFileSync(join(out, 'core.md'), core);
    const topics = [...new Set([...core.matchAll(/([a-z0-9-]+(?:\/[a-z0-9-]+)?)\.md/g)].map(m => m[1]))];
    let saved = 1;
    for (const topic of topics) {
      const res = await get(`${base}/${topic}.md`);
      if (!res?.ok) continue;
      write(join(out, `${topic}.md`), await res.text(), false);
      saved++;
    }
    const version = core.match(/\(v([0-9a-f]{6,})\)/)?.[1] ?? 'unknown';
    writeFileSync(join(out, 'VERSION'), `${version}\n`);
    console.log(`saved ${saved} docs (platform rules v${version}) to .platform/docs/ — read changes.md first.`);
  } else {
    console.warn(`platform rules not saved: ${base} answered ${index?.status ?? 'no response'}.`);
  }

  // 2. The full API reference (community + agency): the index, and every page in one file to
  //    grep. Pages are `<site>/developer-api/<path>.md`; the live copy always wins over this one.
  //    The community's own host first, then the platform's docs host (same docs, always up).
  let reference = 0;
  for (const file of ['llms.txt', 'llms-full.txt']) {
    let res = await get(`${site}/developer-api/${file}`);
    if (!res?.ok) res = await get(`${API_DOCS_BASE}/developer-api/${file}`);
    if (!res?.ok) continue;
    write(join(out, 'developer-api', file), await res.text(), false);
    reference++;
  }
  if (reference) {
    console.log('saved the API reference to .platform/docs/developer-api/ (llms.txt = index, llms-full.txt = every page).');
  } else {
    console.warn(`API reference not saved: read it live at ${API_DOCS_BASE}/developer-api/llms.txt.`);
  }
  if (!index?.ok && !reference) throw new Error(`nothing saved from ${site}: is it a community hostname?`);
}

async function check() {
  const manifest = readManifest();
  const latest = await latestTag(manifest.repo);
  const current = `v${manifest.version}`;
  if (newer(latest, current)) {
    console.log(`template ${current} → ${latest} is available. Read its CHANGELOG, then: npm run platform -- upgrade`);
    process.exitCode = 10;
  } else {
    console.log(`up to date (template ${current}).`);
  }
}

async function upgrade() {
  const manifest = readManifest();
  const dryRun = flag('--dry-run');
  const from = `v${manifest.version}`;
  const to = option('--to') ?? (await latestTag(manifest.repo));
  if (!newer(to, from)) return console.log(`nothing to do: ${from} is not older than ${to}.`);
  if (!dryRun) {
    try {
      const dirty = execFileSync('git', ['status', '--porcelain'], {cwd: ROOT}).toString().trim();
      if (dirty && !flag('--force')) {
        throw new Error('commit or stash your changes first (or pass --force), so the upgrade is one reviewable diff.');
      }
    } catch (error) {
      if (error.message.startsWith('commit')) throw error;
    }
  }

  const work = mkdtempSync(join(tmpdir(), 'site-upgrade-'));
  try {
    const [oldDir, newDir] = await Promise.all([
      fetchTemplate(manifest.repo, from, work),
      fetchTemplate(manifest.repo, to, work),
    ]);
    const files = new Set([...listFiles(oldDir), ...listFiles(newDir)]);
    const report = {replaced: [], merged: [], added: [], removed: [], conflicts: [], kept: []};

    for (const rel of [...files].sort()) {
      const base = read(join(oldDir, rel));
      const theirs = read(join(newDir, rel));
      const oursPath = join(ROOT, rel);
      const ours = read(oursPath);
      if (same(base, theirs)) continue; // the template did not change this file

      if (MANAGED.some(re => re.test(rel))) {
        if (theirs === null) {
          if (ours !== null && !dryRun) rmSync(oursPath);
          report.removed.push(rel);
        } else {
          write(oursPath, theirs, dryRun);
          report.replaced.push(rel);
        }
        continue;
      }
      if (SKIP_IN_MERGE.some(re => re.test(rel))) {
        report.kept.push(`${rel} (regenerate with npm install)`);
        continue;
      }
      if (theirs === null) {
        report.kept.push(`${rel} (removed upstream; delete it yourself if unused)`);
        continue;
      }
      if (ours === null) {
        if (base === null) {
          write(oursPath, theirs, dryRun);
          report.added.push(rel);
        } else {
          report.kept.push(`${rel} (you deleted it; upstream changed it)`);
        }
        continue;
      }
      if (same(ours, base) || same(ours, theirs)) {
        write(oursPath, theirs, dryRun);
        report.merged.push(rel);
        continue;
      }
      // 3-way merge: ours ← (base → theirs)
      const tmpOurs = join(work, 'ours'), tmpBase = join(work, 'base'), tmpTheirs = join(work, 'theirs');
      writeFileSync(tmpOurs, ours);
      writeFileSync(tmpBase, base ?? Buffer.alloc(0));
      writeFileSync(tmpTheirs, theirs);
      let conflicts = 0;
      try {
        execFileSync('git', ['merge-file', '-L', 'yours', '-L', from, '-L', to, tmpOurs, tmpBase, tmpTheirs]);
      } catch (error) {
        conflicts = error.status ?? 1;
      }
      write(oursPath, readFileSync(tmpOurs), dryRun);
      (conflicts ? report.conflicts : report.merged).push(conflicts ? `${rel} (${conflicts})` : rel);
    }

    if (!dryRun) writeFileSync(MANIFEST, `${JSON.stringify({...manifest, version: to.replace(/^v/, '')}, null, 2)}\n`);

    const show = (title, list) => list.length && console.log(`\n${title}:\n  ${list.join('\n  ')}`);
    console.log(`${dryRun ? '[dry run] ' : ''}template ${from} → ${to}`);
    show('replaced (managed)', report.replaced);
    show('merged', report.merged);
    show('added', report.added);
    show('removed (managed)', report.removed);
    show('left as is', report.kept);
    show('CONFLICTS — search for <<<<<<< and resolve', report.conflicts);
    console.log('\nnext: read CHANGELOG.md, resolve conflicts, npm install, npm run build, git diff.');
    if (report.conflicts.length) process.exitCode = 2;
  } finally {
    rmSync(work, {recursive: true, force: true});
  }
}

const commands = {docs, check, upgrade};
if (!commands[command]) {
  console.log('usage: npm run platform -- docs [--site URL] | check | upgrade [--to vX.Y.Z] [--dry-run] [--force]');
} else {
  commands[command]().catch(error => {
    console.error(`platform ${command}: ${error.message}`);
    process.exitCode = 1;
  });
}
