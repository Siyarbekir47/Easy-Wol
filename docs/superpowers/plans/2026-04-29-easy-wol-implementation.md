# Easy-WoL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Docker-ready multi-site Wake-on-LAN web app with local and SSH-based senders.

**Architecture:** A Vite React frontend is served by an Express API. The backend stores sites, devices, and wake events in SQLite, sends local Magic Packets over UDP, and invokes remote Wake-on-LAN through SSH for Raspberry Pi based sites.

**Tech Stack:** TypeScript, React, Vite, Express, SQLite via `better-sqlite3`, SSH via `ssh2`, tests via Vitest and Supertest, Docker multi-stage build.

---

## File Structure

- `package.json`: scripts and dependencies for frontend, backend, tests, and Docker build.
- `vite.config.ts`: frontend build config and dev proxy.
- `tsconfig.json`: shared TypeScript configuration.
- `src/server/index.ts`: Express server startup and static frontend serving.
- `src/server/app.ts`: Express app wiring, auth middleware, API routes.
- `src/server/db.ts`: SQLite schema, seed, and repository functions.
- `src/server/validation.ts`: input validation for MAC, IPv4, ports, site/device payloads.
- `src/server/wol.ts`: Magic Packet creation and local UDP sender.
- `src/server/sshWake.ts`: SSH command execution for remote sites.
- `src/server/status.ts`: TCP status probe.
- `src/server/__tests__/*.test.ts`: backend unit/API tests.
- `src/client/main.tsx`: React entry.
- `src/client/App.tsx`: app shell, state loading, actions.
- `src/client/api.ts`: typed API client.
- `src/client/styles.css`: modern responsive Control Center UI.
- `index.html`: Vite HTML entry.
- `Dockerfile`: production image.
- `docker-compose.yml`: NAS deployment template.
- `.dockerignore`, `.gitignore`, `README.md`, `.env.example`: operational docs and hygiene.

## Tasks

### Task 1: Scaffold project and install dependencies

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `.gitignore`

- [ ] Write `package.json` with scripts `dev`, `server:dev`, `build`, `start`, `test`, and dependencies for Express, React, SQLite, SSH, and testing.
- [ ] Run `npm install`.
- [ ] Commit with `chore: scaffold TypeScript app`.

### Task 2: Backend validation and WoL core

**Files:**
- Create: `src/server/validation.ts`
- Create: `src/server/wol.ts`
- Create: `src/server/__tests__/validation.test.ts`
- Create: `src/server/__tests__/wol.test.ts`

- [ ] Write tests for MAC normalization, IPv4 validation, port validation, and Magic Packet byte layout.
- [ ] Implement validation helpers and Magic Packet creation.
- [ ] Run `npm run test -- validation wol` and verify pass.
- [ ] Commit with `feat: add validation and wol packet core`.

### Task 3: SQLite persistence

**Files:**
- Create: `src/server/db.ts`
- Create: `src/server/__tests__/db.test.ts`

- [ ] Write tests for schema initialization, site CRUD, device CRUD, and wake event insertion.
- [ ] Implement SQLite schema and repository functions.
- [ ] Run DB tests and verify pass.
- [ ] Commit with `feat: add sqlite persistence`.

### Task 4: Wake execution and API

**Files:**
- Create: `src/server/sshWake.ts`
- Create: `src/server/status.ts`
- Create: `src/server/app.ts`
- Create: `src/server/index.ts`
- Create: `src/server/__tests__/api.test.ts`

- [ ] Write API tests for login, unauthorized requests, CRUD endpoints, local wake route, and SSH wake route with mocked executors.
- [ ] Implement Express app, auth cookie, CRUD endpoints, wake endpoint, event logging, and status endpoint.
- [ ] Run API tests and verify pass.
- [ ] Commit with `feat: add authenticated wol api`.

### Task 5: Frontend Control Center

**Files:**
- Create: `src/client/main.tsx`
- Create: `src/client/App.tsx`
- Create: `src/client/api.ts`
- Create: `src/client/styles.css`

- [ ] Build login screen, dashboard, site/device forms, wake buttons, status indicators, and event log.
- [ ] Style responsive dark technical Control Center UI with non-generic color system.
- [ ] Run `npm run build` and verify pass.
- [ ] Commit with `feat: add Easy-WoL web interface`.

### Task 6: Docker and operations docs

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`
- Create: `.env.example`
- Create: `README.md`

- [ ] Add Docker multi-stage build.
- [ ] Add Compose template using `network_mode: host`, data volume, admin password env, and SSH key mount.
- [ ] Document setup for NAS and Raspberry Pi remote command prerequisites.
- [ ] Run `npm run build` and, if Docker is available, `docker build -t easy-wol .`.
- [ ] Commit with `docs: add docker deployment guide`.

## Final Verification

- [ ] Run `npm run test`.
- [ ] Run `npm run build`.
- [ ] Run `git status --short` and report remaining changes.
