# 2026-06-15-2110 — AgentTemplate model field + Anthropic credential UI

## Task
- Add `model` field to AgentTemplate (dashboard + API default)
- Improve Anthropic credential UI with explicit labeled fields

## What changed

### packages/api/src/config/agent-templates.service.ts
- Changed default `model` from `"claude-opus-4-5"` → `"claude-sonnet-4-6"` in both `create` and `update`

### packages/api/src/config/agent-templates.service.test.ts (new)
- 4 new tests covering default model behavior and explicit model override for create/update

### packages/dashboard/src/api/client.ts
- `AgentTemplateItem`: added `model: string` field

### packages/dashboard/src/pages/Config.tsx
- `AgentTemplateDialog`: added Model text input (default `claude-sonnet-4-6`, placeholder shown)
- Agent Templates table: added Model column (monospace, between Name and Max Turns)
- `CredentialDialog`: when `kind === "anthropic"`, renders explicit fields:
  - Base URL text input → `meta.baseUrl`
  - Auth Token password input → `secrets.apiKey` (relabeled)
  - Meta JSON field with `baseUrl` in placeholder for guidance
  - All other kinds continue to use generic Meta JsonField + secret key list

## Tests
- 4 new unit tests in agent-templates.service.test.ts — all passing
- Dashboard builds cleanly (tsc + vite)
- Total: 45 passing, 3 pre-existing webhook failures unchanged

## Follow-ups
- None
