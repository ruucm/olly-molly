# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Olly Molly is a local-first AI development team manager. Users assign tasks to AI agents (PM, Frontend Dev, Backend Dev, QA, DevOps, Bug Hunter) via a kanban board interface. Agents execute via CLI tools (Claude CLI, OpenCode, or Codex CLI) and modify the user's codebase.

## Development Commands

```bash
npm run dev      # Start dev server at http://localhost:1234
npm run build    # Production build
npm run start    # Run production build
npm run lint     # ESLint
```

## Architecture

### Tech Stack
- **Framework**: Next.js 16 (App Router) with React 19
- **Database**: Server-side JSON files (`~/.olly-molly/data/`) + memory-only TanStack DB collections
- **Styling**: Tailwind CSS 4 with CSS variables for theming
- **Drag & Drop**: dnd-kit
- **AI Execution**: Spawns CLI processes (claude, opencode, codex)

### Key Directories
- `app/` - Next.js App Router pages and API routes
- `app/api/` - Backend endpoints (agent execution, tickets, projects, members, data sync)
- `components/` - React components organized by feature (kanban/, pm/, project/, team/, ui/)
- `lib/` - Core logic
  - `client-db.ts` - Memory-only TanStack DB collections with server sync
  - `server-data-store.ts` - Server-side JSON file persistence
  - `agent-jobs.ts` - AI agent execution
- `db/` - SQLite schema with default agent definitions
- `bin/cli.js` - CLI entry point that downloads/runs the app

### Data Flow
1. **Server storage**: JSON files at `~/.olly-molly/data/` via `lib/server-data-store.ts`
2. **Client memory**: TanStack DB collections (memory-only, no IndexedDB)
3. **Sync pattern**: Fire-and-forget - optimistic local update + async server sync
4. **Reactive queries**: `useLiveQuery` hooks for real-time UI updates
5. **Services**: `memberService`, `ticketService`, `projectService` etc. handle CRUD + sync
6. **AI agents**: Spawned as child processes in `lib/agent-jobs.ts`, output streamed to UI

### Multi-Tab Architecture
The app uses server-side storage to avoid IndexedDB blocking issues:
- **Why no IndexedDB**: Continuous writes (e.g., during workflow execution) block `openDB()` in other tabs indefinitely
- **Server as source of truth**: All data persisted to JSON files on the server
- **Memory-only collections**: TanStack DB provides reactivity without persistence
- **Real-time sync**: Mutations sync to server immediately via `/api/data/sync`
- **User email**: Stored in localStorage for instant retrieval on app startup

### Core Data Types (lib/client-db.ts)
- `Member` - Team members with system prompts and capabilities
- `Ticket` - Tasks with status (TODO, IN_PROGRESS, IN_REVIEW, NEED_FIX, COMPLETE, ON_HOLD)
- `Conversation` - Agent execution records with provider type
- `AgentWorkLog` - History of agent runs with output and duration

### Agent Execution (lib/agent-jobs.ts)
- Supports three providers: `claude`, `opencode`, `codex`
- Jobs stored in memory Map, not persisted
- Work logs written to `AGENT_WORK_LOG.md` in target projects
- Model selection via environment variables (CLAUDE_MODEL, OPENCODE_MODEL, CODEX_MODEL)

## Code Conventions

- TypeScript with strict mode
- Functional components with hooks
- CSS variables for theming (--bg-primary, --text-secondary, etc.)
- Path alias: `@/*` maps to project root
- Commit messages: present tense, imperative mood, <72 chars first line
