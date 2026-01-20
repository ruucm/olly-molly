<p align="center">
  <img src="app-icon.png" width="80" height="80" alt="Olly Molly">
</p>

<h1 align="center">Olly Molly</h1>

<p align="center">
  <strong>Your AI Development Team, Running Locally</strong>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#features">Features</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/olly-molly?style=flat-square" alt="npm version">
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="license">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs welcome">
</p>

---

**Olly Molly** is a local-first AI development team manager. Assign tasks to AI agents (PM, Frontend, Backend, QA) and watch them work on your codebase—all from a beautiful kanban board interface.

## Quick Start

```bash
npx olly-molly
```

That's it. Open `http://localhost:1234` and start managing your AI team.

## Features

- 🎯 **Kanban Board** — Drag-and-drop task management
- 🤖 **AI Agents** — PM, Frontend Dev, Backend Dev, QA, DevOps, Bug Hunter
- 💬 **Natural Requests** — Ask PM in plain language, get structured tickets
- 🔒 **Local-First** — Everything runs on your machine
- 🎨 **Minimal Design** — Clean, paper-like UI inspired by fontshare.com
- 🌙 **Dark Mode** — Easy on the eyes

## AI Agents

Olly Molly comes with 6 specialized AI agents, each designed for specific development tasks:

| Agent | Role | Description |
|-------|------|-------------|
| 👔 **PM Agent** | Project Manager | Creates tickets, assigns tasks, sets priorities, tracks progress |
| 🎨 **Frontend Developer** | FE_DEV | React/Next.js UI development, responsive design, API integration |
| ⚙️ **Backend Developer** | BACKEND_DEV | REST APIs, database design, server-side logic, testing |
| 🔍 **QA Engineer** | QA | Automated testing with Chrome DevTools/Playwright MCP, bug reporting |
| 🚀 **DevOps Engineer** | DEVOPS | CI/CD pipelines, deployment, infrastructure, monitoring |
| 🐛 **Bug Hunter** | BUG_HUNTER | Full-stack debugging, error analysis, regression testing |

### Adding Custom Agents

Create a new file in `agents/` directory:

```typescript
// agents/my-agent.ts
import type { AgentDefinition } from './types';

export const myAgent: AgentDefinition = {
  id: 'my-agent-001',
  role: 'MY_ROLE',
  name: 'My Custom Agent',
  avatar: '🤖',
  profile_image: null,
  system_prompt: `Your agent's system prompt here...`,
  is_default: 1,
  can_generate_images: 0,
  can_log_screenshots: 0,
};
```

Then add it to `agents/index.ts`:

```typescript
import { myAgent } from './my-agent';

export const DEFAULT_AGENTS: AgentDefinition[] = [
  // ... existing agents
  myAgent,
];
```

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│                      Olly Molly                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  You ──▶ PM Agent ──▶ Creates Tickets                  │
│              │                                          │
│              ▼                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │  TODO  │  PROGRESS  │  REVIEW  │  DONE  │ HOLD  │   │
│  │   📋   │     🔄     │    👀    │   ✅   │  ⏸️   │   │
│  └─────────────────────────────────────────────────┘   │
│              │                                          │
│              ▼                                          │
│  Agents (FE/BE/QA) work on assigned tickets            │
│              │                                          │
│              ▼                                          │
│  Code changes in YOUR local project                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Setup

### Prerequisites

- Node.js 18+
- One of the following CLI tools: [Codex CLI](https://www.npmjs.com/package/@openai/codex), [OpenCode](https://github.com/sst/opencode), or [Claude CLI](https://github.com/anthropics/claude-code)

### Run with npx (Recommended)

```bash
npx olly-molly
```

On macOS (arm64/x64) and Windows x64, `npx olly-molly` will use prebuilt bundles
from GitHub Releases when available. Asset naming:

```
olly-molly-darwin-arm64.tar.gz
olly-molly-darwin-x64.tar.gz
olly-molly-win32-x64.tar.gz
```

### Or install globally

```bash
npm install -g olly-molly
olly-molly
```

### Development

```bash
git clone https://github.com/ruucm/olly-molly.git
cd olly-molly
npm install
npm run dev
```

### AI CLI Tools (Required for Agent Execution)

To run AI agents, you need to install Codex CLI, OpenCode, or Claude CLI:

**macOS (via Homebrew):**
```bash
# OpenCode
brew install sst/tap/opencode

# Codex CLI
npm install -g @openai/codex

# Claude CLI
brew install anthropics/tap/claude-code
```

**Windows:**
```bash
# OpenCode (via npm)
npm install -g opencode-ai

# Codex CLI (via npm)
npm install -g @openai/codex

# Claude CLI (via npm)
npm install -g @anthropic-ai/claude-code
```

> **Note:** Windows npm packages may not be officially supported. If installation fails, consider using WSL (Windows Subsystem for Linux) with Homebrew.

## Project Selection

1. Click "Select Project" in the header
2. Add your project path (e.g., `/Users/you/my-app`)
3. AI agents will work within that directory

## Contributing

We love contributions! Here's how you can help:

### Ways to Contribute

- 🐛 **Bug Reports** — Found a bug? Open an issue
- 💡 **Feature Requests** — Have an idea? Let's discuss
- 🔧 **Pull Requests** — Code contributions are welcome
- 📖 **Documentation** — Help improve our docs
- 🎨 **Design** — UI/UX improvements

### Development Setup

```bash
# Clone the repo
git clone https://github.com/ruucm/olly-molly.git
cd olly-molly

# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:1234
```

### Releasing a New Version

```bash
scripts/build-prebuilt-macos.sh
```

```bash
npm version major|minor|patch
npm publish
```

```bash
git push origin main
```

```bash
gh release create v0.2.21 \
  dist/prebuilt/olly-molly-darwin-arm64.tar.gz \
```

for windows:
```bash
powershell -ExecutionPolicy Bypass -File scripts/build-prebuilt-windows.ps1
```

```bash
gh release upload v0.2.21 dist/prebuilt/olly-molly-win32-x64.tar.gz --clobber
```

### Project Structure

```
olly-molly/
├── agents/             # AI agent definitions
│   ├── index.ts       # Agent exports & DEFAULT_AGENTS
│   ├── types.ts       # AgentDefinition type
│   ├── pm.ts          # PM Agent
│   ├── fe-dev.ts      # Frontend Developer
│   ├── be-dev.ts      # Backend Developer
│   ├── qa.ts          # QA Engineer
│   ├── devops.ts      # DevOps Engineer
│   └── bug-hunter.ts  # Bug Hunter
├── app/                # Next.js app router
│   ├── api/           # API routes
│   ├── design-system/ # Design system docs
│   └── page.tsx       # Main dashboard
├── components/         # React components
│   ├── kanban/        # Kanban board
│   ├── ui/            # Reusable UI components
│   └── ...
├── db/                 # SQLite schemas
└── lib/               # Utilities
```

### Code Style

- TypeScript for type safety
- Functional components with hooks
- CSS variables for theming
- Minimal dependencies

## Tech Stack

- **Framework**: Next.js 16
- **UI**: React 19, Tailwind CSS 4
- **Database**: TanStack DB (@tanstack/react-db) with IndexedDB persistence
- **Drag & Drop**: dnd-kit
- **AI**: Codex CLI / OpenCode / Claude CLI

## Troubleshooting

### App stuck on "Loading..."

This is usually caused by **IndexedDB lock**. IndexedDB allows only one connection per database at a time, and if a previous browser session didn't close properly, the lock may persist.

**Solutions:**
1. **Force quit browser** — Completely close Chrome/browser and reopen
2. **Hard refresh** — `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
3. **Close duplicate tabs** — Make sure only one tab has Olly Molly open
4. **Clear site data** — DevTools → Application → Storage → Clear site data

**Why this happens:**
- Browser crashed or was force-quit while the app was running
- Multiple tabs trying to access the same IndexedDB
- Browser extension interfering with IndexedDB

## License

MIT © ruucm

---

<p align="center">
  <sub>Built with ❤️ for developers who love AI</sub>
</p>
