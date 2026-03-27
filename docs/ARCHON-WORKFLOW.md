# Archon Workflow Guide

**Last Updated**: 2026-03-27

This document explains how to work with Archon CLI and Web UI together, specifically for the ISEE v2 project.

---

## Architecture Overview

When developing ISEE v2, you run three services simultaneously:

```
┌─────────────────────────────────────────────────────────┐
│                  ISEE v2 Server                         │
│              (Bun server on port 3000)                  │
│         Main app: http://localhost:3000                 │
│         Dashboard: http://localhost:3000/dashboard      │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                    Archon Web UI                        │
│              (Vite dev server on port 5173)             │
│         http://localhost:5173                           │
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

**Port Summary:**
| Service | Port | URL |
|---------|------|-----|
| ISEE v2 | 3000 | http://localhost:3000 |
| Archon API | 3090 | http://localhost:3090 |
| Archon Web UI | 5173 | http://localhost:5173 |

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

## Starting All Services

### Quick Start (3 Terminals)

**Terminal 1** — ISEE v2 server:
```bash
cd ~/git/isee-v2
bun run dev
# → http://localhost:3000
```

**Terminal 2** — Archon server (must use PORT=3090 to avoid conflict):
```bash
cd ~/git/remote-coding-agent
PORT=3090 bun run dev:server
# → http://localhost:3090
```

**Terminal 3** — Archon Web UI:
```bash
cd ~/git/remote-coding-agent
bun run dev:web
# → http://localhost:5173
```

### Alternative: Start Archon Server + Web Together

```bash
cd ~/git/remote-coding-agent
PORT=3090 bun run dev
# → API server: http://localhost:3090
# → Web UI: http://localhost:5173
```

**Important**: Always set `PORT=3090` when running Archon, otherwise it defaults to port 3000 which conflicts with ISEE.

---

## Why Workflows Might Not Appear in Web UI

### Problem 1: Server Not Running

**Symptom**: Web UI shows "Disconnected" or workflows don't appear.

**Fix**: Start the server with the correct port:
```bash
cd ~/git/remote-coding-agent
PORT=3090 bun run dev:server
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

### Problem 4: Port Conflict with ISEE

**Symptom**: ISEE stops responding, or Archon server fails to start.

**Cause**: Both ISEE and Archon default to port 3000.

**Fix**: Always start Archon with `PORT=3090`:
```bash
PORT=3090 bun run dev        # or
PORT=3090 bun run dev:server
```

**Verify ports are correct**:
```bash
lsof -i :3000  # Should show ISEE (bun)
lsof -i :3090  # Should show Archon (bun)
lsof -i :5173  # Should show Archon Web UI (node/vite)
```

---

## Recommended Workflow

### For Development with Full Visibility

1. **Terminal 1** — Start ISEE server:
   ```bash
   cd ~/git/isee-v2
   bun run dev
   ```

2. **Terminal 2** — Start Archon server + Web UI:
   ```bash
   cd ~/git/remote-coding-agent
   PORT=3090 bun run dev
   ```

3. **Terminal 3** — Run workflows or Claude Code:
   ```bash
   cd ~/git/isee-v2
   archon workflow run isee-implement-component --branch fix/my-feature "Fix the thing"
   ```

4. **Browser tabs**:
   - http://localhost:3000 — ISEE app
   - http://localhost:3000/dashboard — ISEE operations dashboard
   - http://localhost:5173 — Archon workflow monitoring

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
| Web UI won't connect | Is server running on :3090? | `PORT=3090 bun run dev:server` from Archon repo |
| Workflows not visible | Is project registered in Web UI? | Click project dropdown → select `joseph-fajen/isee-v2` |
| Old data showing | Server restarted recently? | Refresh browser, clear cache |
| CLI works but Web UI doesn't | Different Archon versions? | `git pull` and `bun install` in Archon repo |
| Port conflict with ISEE | Did you set PORT=3090? | Archon defaults to port 3000, same as ISEE |
| ISEE not responding | Is Archon using port 3000? | Kill Archon, restart with `PORT=3090` |

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
