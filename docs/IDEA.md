# JiGit

An orchestrator for AI Agents that work with Jira & GitLab.

## Overview

- Work with Jira: Create Issues, Sub-tasks, Agent's WorkLogs
- Work with GitLab: Clone code, Create new branch, Create Merge Requests, Comment on Merge Requests
- Report status via: Telegram (MVP), Microsoft Teams (Phase 2)
- Receive assignments from Jira via webhook: New tasks/issues assigned
- Receive events from GitLab: new merge requests, Agent mentioning in Comments, Build Failures

## Components

- Orchestrator
- Agent Manager: Manage SKILLs, Agent Templates, Jira credentials, GitLab credentials
- Dashboard UI: Display token-used dashboard, multi-step jobs & states & controls (Start, Stop, Pause)
- Webhook Receivers

## Connections

- Jira MCP
- Jira REST APIs
- Webhooks for JIRA
- GitLab MCP
- GitLab REST APIs
- Webhooks for GitLab
- Telegram channels (MVP)
- Teams channels (Phase 2)

## Frameworks

Frontend: ReactJS, ShaDCN UI, Vite, Typescript
Backend: LangGraph (Typescript), GoLang

## Functional Requirements

- Rules to matching Jira ISSUE ID with GitLab branch (with conventional branch prefixes)
- An Agent Template can be used to spawn multiple agents at once, with a limit number (For example: max 3 agents)
- Use CodeBurn to export local usage logs, upload to server, view data on dashboard
- Limit max number of retries (apply for tool calls, job retries, etc.)
- UI to view jobs, approve steps
