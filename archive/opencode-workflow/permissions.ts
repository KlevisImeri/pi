import { homedir } from "node:os";
import { resolve } from "node:path";

export interface PermissionRequest {
	key: string;
	rule: string;
	detail: string;
}

interface BashAskRule {
	pattern: string;
	matches: (command: string) => boolean;
}

// Mirrors the ask rules in ~/.config/opencode/opencode.json.
const BASH_ASK_RULES: BashAskRule[] = [
	{ pattern: "curl * | sh", matches: (c) => /^curl\b.*\|\s*sh(?:\s|$)/.test(c) },
	{ pattern: "curl * | bash", matches: (c) => /^curl\b.*\|\s*bash(?:\s|$)/.test(c) },
	{ pattern: "find * -exec *", matches: (c) => /^find\b.*-exec(?:dir)?(?:\s|$)/.test(c) },
	{ pattern: "find * | xargs *", matches: (c) => /^find\b.*\|\s*xargs(?:\s|$)/.test(c) },
	{ pattern: "find * -delete", matches: (c) => /^find\b.*-delete(?:\s|$)/.test(c) },
	{ pattern: "git reset --hard *", matches: (c) => /^git\s+reset\b.*--hard(?:\s|$)/.test(c) },
	{ pattern: "git branch -D *", matches: (c) => /^git\s+branch\b.*(?:^|\s)-D(?:\s|$)/.test(c) },
	{ pattern: "git push *", matches: (c) => /^git\s+push(?:\s|$)/.test(c) },
	{ pattern: "git clean *", matches: (c) => /^git\s+clean(?:\s|$)/.test(c) },
	{ pattern: "npm publish *", matches: (c) => /^npm\s+publish(?:\s|$)/.test(c) },
	{ pattern: "docker rm *", matches: (c) => /^docker\s+rm(?:\s|$)/.test(c) },
	{ pattern: "docker rmi *", matches: (c) => /^docker\s+rmi(?:\s|$)/.test(c) },
	{ pattern: "sed -i *", matches: (c) => /^sed\b.*(?:^|\s)-i[^\s]*(?:\s|$)/.test(c) },
	{ pattern: "wget * -O *", matches: (c) => /^wget\b.*(?:^|\s)-O(?:\s|$)/.test(c) },
	{ pattern: "* | sh", matches: (c) => /\|\s*sh(?:\s|$)/.test(c) },
	{ pattern: "* | bash", matches: (c) => /\|\s*bash(?:\s|$)/.test(c) },
	{ pattern: "* | zsh", matches: (c) => /\|\s*zsh(?:\s|$)/.test(c) },
	{ pattern: "* >> *", matches: (c) => /\s>>\s/.test(c) },
	{ pattern: "* > *", matches: (c) => /\s>\s/.test(c) },
	{ pattern: "rm *", matches: (c) => /^rm(?:\s|$)/.test(c) },
	{ pattern: "mv *", matches: (c) => /^mv(?:\s|$)/.test(c) },
	{ pattern: "cp *", matches: (c) => /^cp(?:\s|$)/.test(c) },
	{ pattern: "chmod *", matches: (c) => /^chmod(?:\s|$)/.test(c) },
	{ pattern: "chown *", matches: (c) => /^chown(?:\s|$)/.test(c) },
	{ pattern: "truncate *", matches: (c) => /^truncate(?:\s|$)/.test(c) },
	{ pattern: "kill *", matches: (c) => /^kill(?:\s|$)/.test(c) },
	{ pattern: "pkill *", matches: (c) => /^pkill(?:\s|$)/.test(c) },
	{ pattern: "killall *", matches: (c) => /^killall(?:\s|$)/.test(c) },
	{ pattern: "ssh *", matches: (c) => /^ssh(?:\s|$)/.test(c) },
	{ pattern: "scp *", matches: (c) => /^scp(?:\s|$)/.test(c) },
	{ pattern: "systemctl *", matches: (c) => /^systemctl(?:\s|$)/.test(c) },
	{ pattern: "crontab *", matches: (c) => /^crontab(?:\s|$)/.test(c) },
];

function commandCandidates(command: string): string[] {
	const candidates = [command, ...command.split(/\s*(?:&&|\|\||;|\n)\s*/)]
		.map((candidate) => candidate.trim())
		.filter(Boolean);
	return [...new Set(candidates)];
}

function normalizePath(cwd: string, path: string): string {
	const cleanPath = path.replace(/^@/, "");
	if (cleanPath === "~") return homedir();
	if (cleanPath.startsWith("~/")) return resolve(homedir(), cleanPath.slice(2));
	return resolve(cwd, cleanPath);
}

export function permissionForTool(
	toolName: string,
	input: Record<string, unknown>,
	cwd: string,
): PermissionRequest | undefined {
	if (toolName === "edit" || toolName === "write") {
		const path = typeof input.path === "string" ? input.path : "(unknown path)";
		return {
			key: `edit:${normalizePath(cwd, path)}`,
			rule: 'edit: "ask"',
			detail: `[${toolName}] ${path}`,
		};
	}

	if (toolName !== "bash") return undefined;

	const command = typeof input.command === "string" ? input.command.trim() : "";
	const rule = BASH_ASK_RULES.find(({ matches }) => commandCandidates(command).some(matches));
	if (!rule) return undefined;

	return {
		key: `bash:${rule.pattern}`,
		rule: `bash: "${rule.pattern}"`,
		detail: command,
	};
}
