# Archon Workflow Guide

**Last Updated**: 2026-03-25

This document explains how to work with Archon CLI and Web UI together.

---

## Architecture Overview

Archon has three main components:

```
┌─────────────────────────────────────────────────────────┐
│                    Archon Web UI                        │
│              (React app on port 5173)                   │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTP/SSE
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   Archon Server                         │
│              (Hono API on port 3090)                    │
│         Stores data in ~/.archon/archon.db              │
└──────────────────────────┬──────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         ┌────────┐  ┌──────────┐  ┌────────┐
         │  CLI   │  │ Telegram │  │ GitHub │  ... adapters
         └────────┘  └──────────┘  └────────┘
```

**Key insight**: The CLI and Web UI are independent adapters that both talk to the same Archon server and database.

---

## Two Modes of Operation

### Mode 1: CLI Only (No Web UI)

When you run:
```bash
archon workflow run <workflow> --branch <branch> "message"
```

The CLI:
1. Connects directly to the workflow executor
2. Spawns Claude Code in a worktree
3. Writes run data to `~/.archon/archon.db`
4. Streams output to terminal

**Web UI is NOT required.** The workflow runs fine without it.

### Mode 2: CLI + Web UI (Full Visibility)

To see workflows in the Web UI:
1. Start the Archon server (serves API on port 3090)
2. Start the Web UI (Vite dev server on port 5173)
3. Both CLI runs and Web UI interactions appear in the dashboard

---

## Starting the Web UI

From the Archon repo (`~/git/remote-coding-agent`):

```bash
# Option 1: Start everything (server + web)
bun run dev
# → API server: http://localhost:3090
# → Web UI: http://localhost:5173

# Option 2: Start server only (for CLI monitoring)
bun run dev:server
# → API server: http://localhost:3090

# Option 3: Production mode
bun run build
bun run start
# → Both served on http://localhost:3090
```

---

## Why Workflows Might Not Appear in Web UI

### Problem 1: Server Not Running

**Symptom**: Web UI shows "Disconnected" or workflows don't appear.

**Fix**: Start the server:
```bash
cd ~/git/remote-coding-agent
bun run dev:server
```

### Problem 2: Server Running But No Workflows Visible

**Symptom**: Server is running, Web UI connects, but recent CLI workflows don't appear.

**Possible causes**:

1. **Database mismatch**: CLI and server might use different databases if run from different directories. Both should use `~/.archon/archon.db`.

2. **Project not registered**: The Web UI filters by registered projects. Click **+** next to "Project" in the sidebar and register your project path (`/Users/josephfajen/git/isee-v2`).

3. **Stale server**: If you updated Archon, restart the server to pick up changes.

### Problem 3: Web UI Started After CLI Run

**Symptom**: Started Web UI after workflow completed; workflow doesn't appear.

**Reality**: The data IS in the database. The Web UI should show it after refresh or project selection. If not, check project registration.

---

## Recommended Workflow

### For Development with Full Visibility

1. **Terminal 1** — Start Archon server + Web UI:
   ```bash
   cd ~/git/remote-coding-agent
   bun run dev
   ```

2. **Terminal 2** — Run workflows from your project:
   ```bash
   cd ~/git/isee-v2
   archon workflow run isee-implement-component --branch fix/my-feature "Fix the thing"
   ```

3. **Browser** — Open http://localhost:5173 to monitor progress

### For Quick CLI-Only Work

Just run the workflow directly — no server needed:
```bash
archon workflow run isee-implement-component --branch fix/my-feature "Fix the thing"
```

The data is still saved to `~/.archon/archon.db`. You can start the Web UI later to review.

---

## Useful Commands

```bash
# Check if Archon server is running
lsof -i :3090

# Check database location and size
ls -la ~/.archon/archon.db

# List active worktrees
archon isolation list

# Clean up merged worktrees
archon isolation cleanup --merged

# Check workflow status
archon workflow status
```

---

## Troubleshooting Checklist

| Issue | Check | Fix |
|-------|-------|-----|
| Web UI won't connect | Is server running on :3090? | `bun run dev:server` from Archon repo |
| Workflows not visible | Is project registered in Web UI? | Click + → Add project path |
| Old data showing | Server restarted recently? | Refresh browser, clear cache |
| CLI works but Web UI doesn't | Different Archon versions? | `git pull` and `bun install` in Archon repo |

---

## File Locations

| Item | Path |
|------|------|
| Archon repo | `~/git/remote-coding-agent` |
| CLI binary | `~/.bun/bin/archon` → symlinked to repo |
| Global config | `~/.archon/config.yaml` |
| Database | `~/.archon/archon.db` |
| Worktrees | `~/.archon/worktrees/` |
| Project config | `~/git/isee-v2/.archon/config.yaml` |
| Project workflows | `~/git/isee-v2/.archon/workflows/` |
