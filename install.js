#!/usr/bin/env node
// agent-kit installer — copies the kit into any project.
//
//   npx github:YashPatel117/claude-agent-kit [project-path] [--dry-run] [--force]   (from GitHub)
//   node install.js [project-path] [--dry-run] [--force]           (local copy)
//   project-path defaults to the current folder.
//
//   --dry-run   show what would happen, change nothing
//   --force     also overwrite your project files (AGENTS.md, CLAUDE.md, docs/, feature command…)
//               with fresh templates. Without it they're only created when missing.
//
// Re-running is safe: kit files (hooks, dashboard, setup skills, templates) are updated,
// your files are kept, settings.json and .gitignore are merged.

const fs = require('fs');
const path = require('path');

const VERSION = (() => { try { return require('./package.json').version; } catch { return '0.0.0'; } })();
const KIT = __dirname;
const TEMPLATE = path.join(KIT, 'template');
const HOOK_MARK = 'log-activity.js';

// Seed files: created in the project from the templates only when missing (or with --force).
const SEEDS = {
  '.claude/kit/templates/AGENTS.md': 'AGENTS.md',
  '.claude/kit/templates/CLAUDE.md': 'CLAUDE.md',
  '.claude/kit/templates/ownership.md': 'docs/ownership.md',
  '.claude/kit/templates/plan.md': 'docs/plans/_template.md',
  '.claude/kit/templates/ownership.json': '.claude/ownership.json',
  '.claude/kit/templates/feature.md': '.claude/commands/feature.md',
};
const MERGED = new Set(['.claude/settings.json']);
const GITIGNORE_LINES = ['# agent-kit: local activity history', '.claude/activity/', '.claude/settings.local.json'];

const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
  const lines = fs.readFileSync(__filename, 'utf8').split('\n').slice(1);
  console.log(lines.slice(0, lines.findIndex((l) => !l.startsWith('//'))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(0);
}
const DRY = args.includes('--dry-run');
const FORCE = args.includes('--force');
const targetArg = args.find((a) => !a.startsWith('--'));
const target = path.resolve(targetArg || process.cwd());

const major = Number(process.versions.node.split('.')[0]);
if (major < 18) fail(`Node 18+ required (you have ${process.versions.node}).`);
if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) fail(`Not a folder: ${target}`);
if (path.resolve(target) === path.resolve(KIT) || target.startsWith(path.resolve(KIT) + path.sep)) fail('Target is the kit folder itself. Pass your project path.');

const report = { created: [], updated: [], kept: [], merged: [], unchanged: [] };

// 1. kit-owned files: always installed/updated
for (const rel of walk(TEMPLATE)) {
  if (MERGED.has(rel)) continue;
  put(rel, fs.readFileSync(path.join(TEMPLATE, rel)), true);
}

// 2. seed files: only when missing (or --force)
for (const [src, dest] of Object.entries(SEEDS)) {
  put(dest, fs.readFileSync(path.join(TEMPLATE, src)), FORCE);
}

// 3. agent-kit.json: create, or bump kitVersion and keep the user's config
{
  const dest = '.claude/agent-kit.json';
  const abs = path.join(target, dest);
  const existing = readJson(abs);
  if (existing && !FORCE) {
    if (existing.kitVersion !== VERSION) {
      existing.kitVersion = VERSION;
      write(abs, JSON.stringify(existing, null, 2) + '\n');
      report.updated.push(dest + ' (kitVersion)');
    } else report.unchanged.push(dest);
  } else {
    const seed = readJson(path.join(TEMPLATE, '.claude/kit/templates/agent-kit.json'));
    seed.kitVersion = VERSION;
    write(abs, JSON.stringify(seed, null, 2) + '\n');
    (existing ? report.updated : report.created).push(dest);
  }
}

// 4. settings.json: merge our hooks into whatever is there
mergeSettings();

// 5. .gitignore
{
  const abs = path.join(target, '.gitignore');
  const cur = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
  const have = new Set(cur.split(/\r?\n/).map((l) => l.trim()));
  const missing = GITIGNORE_LINES.filter((l) => !have.has(l));
  if (missing.length) {
    write(abs, cur + (cur && !cur.endsWith('\n') ? '\n' : '') + (cur ? '\n' : '') + missing.join('\n') + '\n');
    (cur ? report.merged : report.created).push('.gitignore');
  } else report.unchanged.push('.gitignore');
}

// ---- summary ----
const claudeMd = path.join(target, 'CLAUDE.md');
const needsMerge = fs.existsSync(claudeMd) && !fs.readFileSync(claudeMd, 'utf8').includes('agent-kit:orchestrator');

console.log(`\nagent-kit ${VERSION} ${DRY ? '(dry run — nothing written) ' : ''}→ ${target}\n`);
section('Created', report.created);
section('Updated (kit files)', report.updated);
section('Merged', report.merged);
section('Kept (yours, not touched)', report.kept);
if (report.unchanged.length) console.log(`Unchanged: ${report.unchanged.length} files\n`);
if (needsMerge) console.log('Note: your existing CLAUDE.md has no agent-kit section yet — /setup-agents will merge it in.\n');

console.log(`Next:
  1. Open the project in Claude Code (restart it if it was already open).
  2. Run  /setup-agents   — tell it your stack and the agents you want.
     (or in one line: /setup-agents React + FastAPI + Postgres; agents: ui, api, db, tests)
  3. Build features with  /feature <description>
  4. Watch agents live:   /dashboard   (or: node .claude/dashboard/server.js --open)
  Later: /add-agent, /add-skill, /add-command
`);

// ---------- helpers ----------
function put(rel, content, overwrite) {
  const abs = path.join(target, rel);
  if (fs.existsSync(abs)) {
    if (!overwrite) { report.kept.push(rel); return; }
    if (Buffer.compare(fs.readFileSync(abs), content) === 0) { report.unchanged.push(rel); return; }
    write(abs, content);
    report.updated.push(rel);
  } else {
    write(abs, content);
    report.created.push(rel);
  }
}

function mergeSettings() {
  const rel = '.claude/settings.json';
  const abs = path.join(target, rel);
  const ours = readJson(path.join(TEMPLATE, rel));
  let cur = {};
  if (fs.existsSync(abs)) {
    cur = readJson(abs);
    if (!cur) fail(`${rel} exists but isn't valid JSON — fix it and re-run.`);
  }
  cur.hooks = cur.hooks || {};
  let changed = false;
  for (const [event, entries] of Object.entries(ours.hooks)) {
    const list = (cur.hooks[event] = cur.hooks[event] || []);
    const present = list.some((e) => (e.hooks || []).some((h) => String(h.command || '').includes(HOOK_MARK)));
    if (!present) { list.push(...entries); changed = true; }
  }
  if (!fs.existsSync(abs)) { write(abs, JSON.stringify(cur, null, 2) + '\n'); report.created.push(rel); }
  else if (changed) { write(abs, JSON.stringify(cur, null, 2) + '\n'); report.merged.push(rel + ' (activity hooks)'); }
  else report.unchanged.push(rel);
}

function walk(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, base));
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

function write(abs, content) {
  if (DRY) return;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

function readJson(f) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}

function section(title, items) {
  if (!items.length) return;
  console.log(`${title}:`);
  for (const i of items) console.log(`  ${i}`);
  console.log('');
}

function fail(msg) {
  console.error(`agent-kit: ${msg}`);
  process.exit(1);
}
