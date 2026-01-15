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
  <a href="#docker-deployment">Docker</a> •
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
- 🤖 **AI Agents** — PM, Frontend Dev, Backend Dev, QA agents
- 💬 **Natural Requests** — Ask PM in plain language, get structured tickets
- 🔒 **Local-First** — Everything runs on your machine
- 🎨 **Minimal Design** — Clean, paper-like UI inspired by fontshare.com
- 🌙 **Dark Mode** — Easy on the eyes

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

## Docker Deployment

Deploy Olly Molly with Docker Compose for persistent, production-ready deployment.

### Quick Start

```bash
# Build and start
docker compose up -d --build

# View logs
docker compose logs -f

# Open http://localhost:1234
```

### Persistent Volumes

All data persists across container restarts and removals:

| Volume | Container Path | Purpose |
|--------|----------------|---------|
| `olly-molly-data` | `/app/db` | SQLite database (projects, tickets, conversations) |
| `olly-molly-config` | `/root/.olly-molly` | Custom profile images |
| `olly-molly-claude` | `/root/.claude` | Claude Code authentication tokens |

### Claude Code Login

Login to Claude Code directly from the container:

```bash
docker compose exec -it olly-molly claude login
```

**Steps:**
1. Run the command above
2. A URL will be displayed in the terminal
3. Copy and open the URL in your host browser
4. Authenticate with your Anthropic account
5. Return to terminal - login completes automatically

**Verify login:**
```bash
docker compose exec olly-molly claude --version
```

### Container Management

```bash
# Check container status
docker compose ps

# Restart container
docker compose restart

# Stop container (data preserved)
docker compose stop

# Remove container (volumes preserved)
docker compose down

# Full reset (removes all data)
docker compose down -v

# View volume list
docker volume ls | grep olly-molly
```

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
├── app/                 # Next.js app router
│   ├── api/            # API routes
│   ├── design-system/  # Design system docs
│   └── page.tsx        # Main dashboard
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

## License

MIT © ruucm

---

<p align="center">
  <sub>Built with ❤️ for developers who love AI</sub>
</p>
