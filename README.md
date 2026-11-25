# agent-kit

A stack-agnostic setup for running a **team of AI agents in parallel** in Claude Code, installable into any project.

You install it, tell it your stack and the agents you want, and it generates the agents, skills, commands, ownership rules, and project instructions for that stack. A live dashboard shows what every agent is doing and keeps a history of every task.

## Install

Requires Node 18+ and Claude Code. Run inside your project folder:

```bash
npx github:YashPatel117/claude-agent-kit              # latest
npx github:YashPatel117/claude-agent-kit#v1.0.0       # a pinned version (git tag)
npx github:YashPatel117/claude-agent-kit --dry-run    # preview only
npx github:YashPatel117/claude-agent-kit ../other-project   # install somewhere else
```

Without hosting, from a local copy: `node path/to/agent/install.js [project-path]`.

Re-run the same command any time to update the kit; your files are kept.

Then, in Claude Code inside that project (restart it if it was open):

```
/setup-agents
```

It inspects the project, asks about your stack, the contract between areas, which agents you want, skills, commands and checks. It shows a summary, and after you confirm it generates everything. You can also give it all at once:

```
/setup-agents Angular 20 + .NET 9 + SQL Server; agents: ui, client-logic, api, domain, tests, reviewer
```

## Use

| Command | What it does |
|---|---|
| `/feature <description>` | The orchestrator writes the contract and plan, runs all builder agents **in parallel**, integrates, runs checks, and reports back |
| `/dashboard` | Opens the live activity dashboard (http://localhost:4317) |
| `/add-agent <role>` | Add, change or remove an agent; keeps ownership and config in sync |
| `/add-skill <recipe>` | Create a stack-specific skill and link it to the agents that use it |
| `/add-command <name: what>` | Create a slash command that drives the team |
| `/setup-agents` | Re-run to reconfigure or adjust the team |

## How it works

```
/feature "…"
   │
   ▼
orchestrator (main session)
   1. contract + plan     ← pins every name shared between agents
   2. packages
   3. launch builders IN PARALLEL ──┬→ agent A  (owns its folders only)
                                    ├→ agent B
                                    └→ agent C …
   4. integrate: wiring, full check, fixes, review agents
   5. report
```

- **Shared context lives in files, not in a shared chat:** the contract (OpenAPI, GraphQL, .proto, shared types…), generated code, and the feature plan.
- **No collisions:** each agent owns separate paths (`docs/ownership.md`). Only the orchestrator runs git, installs packages, runs codegen, and runs full builds.
- **Portable rules:** `AGENTS.md` is the open standard that Codex, Cursor, Copilot, Gemini CLI and others read. `CLAUDE.md` imports it and adds the orchestration workflow.

## What gets installed

| Path | Owner | On re-install |
|---|---|---|
| `.claude/hooks/log-activity.js` | kit | updated |
| `.claude/dashboard/` | kit | updated |
| `.claude/skills/{setup-agents,add-agent,add-skill,add-command}/` | kit | updated |
| `.claude/commands/dashboard.md` | kit | updated |
| `.claude/kit/templates/` | kit | updated |
| `.claude/settings.json` | merged | activity hooks added if missing; your settings kept |
| `.gitignore` | merged | adds `.claude/activity/` |
| `AGENTS.md`, `CLAUDE.md`, `docs/ownership.md`, `docs/plans/_template.md`, `.claude/ownership.json`, `.claude/commands/feature.md` | **yours** | created only if missing (`--force` overwrites) |
| `.claude/agent-kit.json` | **yours** | only `kitVersion` is bumped |

`/setup-agents` then generates `.claude/agents/*.md`, `.claude/skills/*`, extra `.claude/commands/*`, and `scripts/check` / `scripts/codegen`.

Existing `AGENTS.md` / `CLAUDE.md` are never overwritten by the installer. `/setup-agents` merges into them and keeps your content.

## Dashboard

Hooks log every prompt, tool call, and subagent start/stop to `.claude/activity/events.jsonl`, the stored history. The dashboard shows:
- tasks (one per prompt), with history
- per-agent cards: status, current action, duration, tool count, files
- a parallel timeline
- a filterable activity log
- files changed per agent
- each agent's final report

Delete `.claude/activity/` to clear the history. Hooks add roughly 50–100 ms per tool call.

## Publishing a new version

1. Change files, then bump `version` in `package.json`.
2. `git commit`, `git tag v1.1.0`, `git push --follow-tags`.
3. Projects update by re-running `npx github:YashPatel117/claude-agent-kit` (or `#v1.1.0`).

## Uninstall

Delete `.claude/hooks/log-activity.js`, `.claude/dashboard/`, `.claude/kit/`, the four kit skills, `.claude/commands/dashboard.md`, `.claude/agent-kit.json`, and the `log-activity.js` entries in `.claude/settings.json`. Generated agents, skills, and docs are yours; keep or delete them.
