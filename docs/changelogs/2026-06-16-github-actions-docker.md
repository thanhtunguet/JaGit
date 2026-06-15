# GitHub Actions — Docker images

**Date:** 2026-06-16

## Task

CI workflow: test, build multi-arch Docker images (api, dashboard, worker), push to GHCR.

## Changes

- `.github/workflows/docker.yml` — test job (Postgres + migrate) + matrix docker build (amd64/arm64) → `ghcr.io/<repo>/<image>`
- `packages/dashboard/Dockerfile` + `nginx.conf` — standalone dashboard image
- `.dockerignore` — smaller build context
- `webhooks.controller.test.ts` — thêm `DASHBOARD_API_TOKEN` để CI pass

## Images

| Image | Dockerfile |
|-------|------------|
| `ghcr.io/<owner>/<repo>/api` | `packages/api/Dockerfile` |
| `ghcr.io/<owner>/<repo>/dashboard` | `packages/dashboard/Dockerfile` |
| `ghcr.io/<owner>/<repo>/worker` | `packages/worker/Dockerfile` |

Tags: `latest` (main), `sha`, semver on `v*` tags.

PR: build only, no push.

## Follow-ups

- Thêm `dashboard` service vào `docker-compose.yml` nếu cần chạy tách API.
