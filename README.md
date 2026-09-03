# Pi configuration

Personal Pi coding-agent configuration with an OpenCode-style workflow.

## Defaults

- Model: `openai-codex/gpt-5.6-luna`
- Thinking: `medium`
- Theme: `github-dark-default`

## Installed extensions

The active third-party packages are:

- `pi-web-access` — web search, URL/PDF/GitHub fetching, and video analysis
- `pi-subagents` — delegation, review, implementation, and the read-focused `scout` subagent
- `@juicesharp/rpiv-ask-user-question` — structured questionnaires via `ask_user_question`
- `@juicesharp/rpiv-todo` — persistent todo overlay and `/todos`
- `@narumitw/pi-plan-mode` — Codex-like read-only `/plan` workflow
- `@gotgenes/pi-permission-system` — tool, path, and Bash permission gates
- `git:github.com/Federicocervelli/pi-theme-github-dark-default` — GitHub Dark Default theme
- `pi-show-diffs` — manual split diff review before `edit` and `write` changes
- `extensions/loaded-tools.ts` — shows active and registered tools during startup

`pi-mcp-adapter` is intentionally not installed. Use `scout` when Pi should search and map the current codebase before another agent makes changes:

```text
Use scout to inspect the authentication flow and report the relevant files and data flow. Do not edit anything.
```

## Permissions

Permission rules are configured in:

```text
extensions/pi-permission-system/config.json
```

Normal reads and non-destructive tools are allowed. `edit` and `write` changes open a manual diff review before applying. Risky shell commands and external paths require confirmation. `.env` files and similar secrets are denied.

The tool display is also available on demand with `/tools`; it distinguishes tools active in the current model request from tools registered but currently inactive (for example, during Plan mode).

## Retired local extensions

The former hand-written questionnaire and OpenCode-style workflow are preserved under `archive/` but are no longer loaded by Pi.

## Checks

Run the configuration checks with:

```bash
./scripts/check.sh
```
