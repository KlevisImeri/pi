#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

printf 'Checking settings JSON...\n'
node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))' "$ROOT/settings.json"

printf 'Checking permission config JSON...\n'
node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))' "$ROOT/extensions/pi-permission-system/config.json"

printf 'Checking diff approval config JSON...\n'
node - "$ROOT/extensions/pi-show-diffs.json" <<'NODE'
const fs = require("node:fs");
const config = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (config.autoApprove !== false) throw new Error("Diff approval must remain in manual review mode");
if (config.diffColorMode !== "default") throw new Error("Diff approval must use the visible default diff colors");
NODE

printf 'Checking selected packages...\n'
node - "$ROOT/settings.json" <<'NODE'
const fs = require("node:fs");
const settings = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const packages = settings.packages ?? [];
const required = [
  "npm:pi-web-access",
  "npm:pi-subagents",
  "npm:@juicesharp/rpiv-ask-user-question",
  "npm:@juicesharp/rpiv-todo",
  "npm:@narumitw/pi-plan-mode",
  "npm:@gotgenes/pi-permission-system",
  "git:github.com/Federicocervelli/pi-theme-github-dark-default",
  "npm:pi-show-diffs",
];
for (const name of required) {
  if (!packages.includes(name)) throw new Error(`Missing package: ${name}`);
}
if (packages.some((name) => name.includes("pi-mcp-adapter"))) {
  throw new Error("pi-mcp-adapter must remain uninstalled");
}
NODE

printf 'Checking extension syntax...\n'
while IFS= read -r -d '' file; do
  node --check "$file"
done < <(find "$ROOT/extensions" -type f -name '*.ts' -print0)

if command -v pi >/dev/null 2>&1; then
  printf 'Checking that Pi loads the extensions and Luna model...\n'
  model_output="$(PI_CODING_AGENT_DIR="$ROOT" pi --list-models gpt-5.6-luna)"
  if ! grep -qE '^openai-codex[[:space:]]+gpt-5\.6-luna[[:space:]]' <<<"$model_output"; then
    printf '%s\n' "$model_output" >&2
    printf 'Expected openai-codex/gpt-5.6-luna was not found.\n' >&2
    exit 1
  fi
else
  printf 'Skipping Pi load check because pi is not on PATH.\n'
fi

printf 'All Pi configuration checks passed.\n'
