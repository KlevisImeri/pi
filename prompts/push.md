---
description: Stage all changes, commit, and push to remote
---

Stage all changes, generate a commit message, and push to the remote branch.

## Workflow

1. Run `git status` to review changes
2. Run `git diff --staged` and `git diff` to understand what changed
3. Check for files that should **not** be committed:
   - Run `cat .gitignore` to see existing exclusions
   - Scan the changed files for sensitive data: **API keys**, tokens, passwords, secrets, credentials, private keys, or `.env` files with real values
   - Look for files that are typically excluded: `auth.json`, `credentials.json`, `.env`, `*.key`, `*.pem`, `id_rsa*`, session logs, build artifacts (`node_modules/`, `dist/`, `__pycache__/`, `.o`, `.class`)
   - If you find anything sensitive or that should be excluded, **stop and ask the user** what to do before proceeding. Suggest adding it to `.gitignore` if appropriate
4. Stage all changes: `git add .`
5. Analyze existing git log to detect the repo's commit message style:
   ```bash
   git log --oneline -20
   ```
   Match whatever convention the repo already uses (prefix style, sentence style, emoji, etc.). If there's no clear pattern, follow the [Conventional Commits](https://www.conventionalcommits.org/) spec (`feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `perf:`, `chore:`). Keep the first line under 72 characters.
6. Commit: `git commit -m "<message>"`
7. Push: `git push`

$ARGUMENTS
