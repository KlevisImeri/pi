/**
 * OpenCode-style workflow for Pi.
 *
 * Adds Plan/Build modes, plan execution tracking, and permission prompts
 * matching the policy in ~/.config/opencode/opencode.json.
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import { permissionForTool } from "./permissions.ts";
import { extractTodoItems, isSafeCommand, markCompletedSteps, type TodoItem } from "./utils.ts";

const PLAN_MODE_TOOLS = ["read", "bash", "grep", "find", "ls", "question"];
const NORMAL_MODE_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls", "question"];
const PLAN_MODE_DISABLED_TOOLS = new Set<string>(["edit", "write"]);
const PLAN_MANAGED_TOOLS = new Set<string>([...PLAN_MODE_TOOLS, ...NORMAL_MODE_TOOLS]);

const ALLOW_ONCE = "Allow once";
const ALLOW_SESSION = "Allow this rule for this session";
const DENY = "Deny";

interface WorkflowState {
	enabled: boolean;
	todos?: TodoItem[];
	executing?: boolean;
	toolsBeforePlanMode?: string[];
	approvals?: string[];
}

// Type guard for assistant messages
function isAssistantMessage(m: AgentMessage): m is AssistantMessage {
	return m.role === "assistant" && Array.isArray(m.content);
}

// Extract text content from an assistant message
function getTextContent(message: AssistantMessage): string {
	return message.content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

export default function planModeExtension(pi: ExtensionAPI): void {
	let planModeEnabled = false;
	let executionMode = false;
	let todoItems: TodoItem[] = [];
	let toolsBeforePlanMode: string[] | undefined;
	let sessionApprovals = new Set<string>();

	pi.registerFlag("plan", {
		description: "Start in plan mode (read-only exploration)",
		type: "boolean",
		default: false,
	});

	function updateStatus(ctx: ExtensionContext): void {
		// Footer status
		if (executionMode && todoItems.length > 0) {
			const completed = todoItems.filter((t) => t.completed).length;
			ctx.ui.setStatus("workflow-mode", ctx.ui.theme.fg("accent", `BUILD · 📋 ${completed}/${todoItems.length}`));
		} else if (planModeEnabled) {
			ctx.ui.setStatus("workflow-mode", ctx.ui.theme.fg("warning", "PLAN"));
		} else {
			ctx.ui.setStatus("workflow-mode", ctx.ui.theme.fg("success", "BUILD"));
		}

		// Widget showing todo list
		if (executionMode && todoItems.length > 0) {
			const lines = todoItems.map((item) => {
				if (item.completed) {
					return (
						ctx.ui.theme.fg("success", "☑ ") + ctx.ui.theme.fg("muted", ctx.ui.theme.strikethrough(item.text))
					);
				}
				return `${ctx.ui.theme.fg("muted", "☐ ")}${item.text}`;
			});
			ctx.ui.setWidget("plan-todos", lines);
		} else {
			ctx.ui.setWidget("plan-todos", undefined);
		}
	}

	function uniqueToolNames(toolNames: string[]): string[] {
		return [...new Set(toolNames)];
	}

	function getPlanModeTools(activeToolNames: string[]): string[] {
		return uniqueToolNames([
			...activeToolNames.filter((name) => !PLAN_MODE_DISABLED_TOOLS.has(name)),
			...PLAN_MODE_TOOLS,
		]);
	}

	function getNormalModeTools(activeToolNames: string[]): string[] {
		return uniqueToolNames([
			...NORMAL_MODE_TOOLS,
			...activeToolNames.filter((name) => !PLAN_MANAGED_TOOLS.has(name)),
		]);
	}

	function enablePlanModeTools(): void {
		if (toolsBeforePlanMode === undefined) {
			toolsBeforePlanMode = pi.getActiveTools();
		}
		pi.setActiveTools(getPlanModeTools(toolsBeforePlanMode));
	}

	function restoreNormalModeTools(): void {
		pi.setActiveTools(toolsBeforePlanMode ?? getNormalModeTools(pi.getActiveTools()));
		toolsBeforePlanMode = undefined;
	}

	function persistState(): void {
		pi.appendEntry("opencode-workflow", {
			enabled: planModeEnabled,
			todos: todoItems,
			executing: executionMode,
			toolsBeforePlanMode,
			approvals: [...sessionApprovals],
		});
	}

	function enterPlanMode(ctx: ExtensionContext): void {
		if (planModeEnabled) {
			ctx.ui.notify("Already in Plan mode.", "info");
			return;
		}
		planModeEnabled = true;
		executionMode = false;
		todoItems = [];
		enablePlanModeTools();
		ctx.ui.notify("Plan mode enabled. File changes and mutating shell commands are blocked.");
		updateStatus(ctx);
		persistState();
	}

	function enterBuildMode(ctx: ExtensionContext): void {
		if (!planModeEnabled && !executionMode) {
			ctx.ui.notify("Already in Build mode.", "info");
			return;
		}
		planModeEnabled = false;
		executionMode = false;
		todoItems = [];
		restoreNormalModeTools();
		ctx.ui.notify("Build mode enabled. OpenCode-style permissions are active.");
		updateStatus(ctx);
		persistState();
	}

	function togglePlanMode(ctx: ExtensionContext): void {
		if (planModeEnabled) enterBuildMode(ctx);
		else enterPlanMode(ctx);
	}

	pi.registerCommand("plan", {
		description: "Enter read-only Plan mode",
		handler: async (_args, ctx) => enterPlanMode(ctx),
	});

	pi.registerCommand("build", {
		description: "Enter writable Build mode",
		handler: async (_args, ctx) => enterBuildMode(ctx),
	});

	pi.registerCommand("mode", {
		description: "Choose Plan or Build mode",
		handler: async (_args, ctx) => {
			const choice = await ctx.ui.select("Choose working mode", ["Plan (read-only)", "Build (permissions enabled)"]);
			if (choice?.startsWith("Plan")) enterPlanMode(ctx);
			if (choice?.startsWith("Build")) enterBuildMode(ctx);
		},
	});

	pi.registerCommand("todos", {
		description: "Show current plan progress",
		handler: async (_args, ctx) => {
			if (todoItems.length === 0) {
				ctx.ui.notify("No active plan.", "info");
				return;
			}
			const list = todoItems.map((item, i) => `${i + 1}. ${item.completed ? "✓" : "○"} ${item.text}`).join("\n");
			ctx.ui.notify(`Plan Progress:\n${list}`, "info");
		},
	});

	pi.registerShortcut(Key.ctrlAlt("p"), {
		description: "Toggle Plan/Build mode",
		handler: async (ctx) => togglePlanMode(ctx),
	});

	pi.on("tool_call", async (event, ctx) => {
		if (planModeEnabled) {
			if (event.toolName === "edit" || event.toolName === "write") {
				return { block: true, reason: "Plan mode is read-only. Use /build before modifying files." };
			}
			if (event.toolName === "bash") {
				const command = typeof event.input.command === "string" ? event.input.command : "";
				if (!isSafeCommand(command)) {
					return {
						block: true,
						reason: `Plan mode: command blocked because it is not read-only. Use /build first.\nCommand: ${command}`,
					};
				}
			}
			return;
		}

		const permission = permissionForTool(
			event.toolName,
			event.input as Record<string, unknown>,
			ctx.cwd,
		);
		if (!permission || sessionApprovals.has(permission.key)) return;

		if (!ctx.hasUI) {
			return {
				block: true,
				reason: `Permission required but no interactive UI is available (${permission.rule}).`,
			};
		}

		const choice = await ctx.ui.select(
			`Permission required\n\n${permission.detail}\n\nMatched rule: ${permission.rule}`,
			[ALLOW_ONCE, ALLOW_SESSION, DENY],
		);

		if (choice === ALLOW_ONCE) return;
		if (choice === ALLOW_SESSION) {
			sessionApprovals.add(permission.key);
			persistState();
			return;
		}

		return { block: true, reason: `User denied ${permission.detail}` };
	});

	// Filter out stale plan mode context when not in plan mode
	pi.on("context", async (event) => {
		if (planModeEnabled) return;

		return {
			messages: event.messages.filter((m) => {
				const msg = m as AgentMessage & { customType?: string };
				if (msg.customType === "plan-mode-context") return false;
				if (msg.role !== "user") return true;

				const content = msg.content;
				if (typeof content === "string") {
					return !content.includes("[PLAN MODE ACTIVE]");
				}
				if (Array.isArray(content)) {
					return !content.some(
						(c) => c.type === "text" && (c as TextContent).text?.includes("[PLAN MODE ACTIVE]"),
					);
				}
				return true;
			}),
		};
	});

	// Inject plan/execution context before agent starts
	pi.on("before_agent_start", async () => {
		if (planModeEnabled) {
			return {
				message: {
					customType: "plan-mode-context",
					content: `[PLAN MODE ACTIVE]
You are in plan mode - a read-only exploration mode for safe code analysis.

Restrictions:
- Built-in edit and write tools are disabled
- Other currently active tools remain available
- Bash is restricted to an allowlist of read-only commands

Ask clarifying questions using the question tool whenever the user needs to make a decision.

Create a detailed numbered plan under a "Plan:" header:

Plan:
1. First step description
2. Second step description
...

Do NOT attempt to make changes - just describe what you would do.`,
					display: false,
				},
			};
		}

		if (executionMode && todoItems.length > 0) {
			const remaining = todoItems.filter((t) => !t.completed);
			const todoList = remaining.map((t) => `${t.step}. ${t.text}`).join("\n");
			return {
				message: {
					customType: "plan-execution-context",
					content: `[EXECUTING PLAN - Full tool access enabled]

Remaining steps:
${todoList}

Execute each step in order.
After completing a step, include a [DONE:n] tag in your response.`,
					display: false,
				},
			};
		}
	});

	// Track progress after each turn
	pi.on("turn_end", async (event, ctx) => {
		if (!executionMode || todoItems.length === 0) return;
		if (!isAssistantMessage(event.message)) return;

		const text = getTextContent(event.message);
		if (markCompletedSteps(text, todoItems) > 0) {
			updateStatus(ctx);
		}
		persistState();
	});

	// Handle plan completion and plan mode UI
	pi.on("agent_end", async (event, ctx) => {
		// Check if execution is complete
		if (executionMode && todoItems.length > 0) {
			if (todoItems.every((t) => t.completed)) {
				const completedList = todoItems.map((t) => `~~${t.text}~~`).join("\n");
				pi.sendMessage(
					{ customType: "plan-complete", content: `**Plan Complete!** ✓\n\n${completedList}`, display: true },
					{ triggerTurn: false },
				);
				executionMode = false;
				todoItems = [];
				updateStatus(ctx);
				persistState(); // Save cleared state so resume doesn't restore old execution mode
			}
			return;
		}

		if (!planModeEnabled || !ctx.hasUI) return;

		// Extract todos from last assistant message
		const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
		if (lastAssistant) {
			const extracted = extractTodoItems(getTextContent(lastAssistant));
			if (extracted.length > 0) {
				todoItems = extracted;
			}
		}

		if (todoItems.length === 0) return;
		persistState();

		// Show plan steps and prompt for next action
		const todoListText = todoItems.map((t, i) => `${i + 1}. ☐ ${t.text}`).join("\n");
		const planTodoListMessage = {
			customType: "plan-todo-list",
			content: `**Plan Steps (${todoItems.length}):**\n\n${todoListText}`,
			display: true,
		};

		const choice = await ctx.ui.select("Plan mode - what next?", [
			"Execute the plan (track progress)",
			"Stay in plan mode",
			"Refine the plan",
		]);

		if (choice?.startsWith("Execute")) {
			const firstTodoItem = todoItems[0];
			if (!firstTodoItem) return;

			planModeEnabled = false;
			executionMode = true;
			restoreNormalModeTools();
			updateStatus(ctx);
			persistState();

			const remainingList = todoItems.map((t) => `${t.step}. ${t.text}`).join("\n");
			const execMessage = `Execute the plan.

Remaining steps:
${remainingList}

Start with: ${firstTodoItem.text}
After completing a step, include a [DONE:n] tag in your response.`;
			pi.sendMessage(planTodoListMessage, { deliverAs: "followUp" });
			pi.sendMessage(
				{ customType: "plan-mode-execute", content: execMessage, display: true },
				{ triggerTurn: true, deliverAs: "followUp" },
			);
		} else if (choice === "Refine the plan") {
			const refinement = await ctx.ui.editor("Refine the plan:", "");
			if (refinement?.trim()) {
				pi.sendMessage(planTodoListMessage, { deliverAs: "followUp" });
				pi.sendUserMessage(refinement.trim(), { deliverAs: "followUp" });
			}
		}
	});

	// Restore state on session start/resume
	pi.on("session_start", async (_event, ctx) => {
		const entries = ctx.sessionManager.getBranch();

		// Restore mode and session approvals from the active branch.
		const workflowEntry = entries
			.filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === "opencode-workflow")
			.pop() as { data?: WorkflowState } | undefined;

		if (workflowEntry?.data) {
			planModeEnabled = workflowEntry.data.enabled ?? planModeEnabled;
			todoItems = workflowEntry.data.todos ?? todoItems;
			executionMode = workflowEntry.data.executing ?? executionMode;
			toolsBeforePlanMode = workflowEntry.data.toolsBeforePlanMode ?? toolsBeforePlanMode;
			sessionApprovals = new Set(workflowEntry.data.approvals ?? []);
		}

		if (pi.getFlag("plan") === true) {
			planModeEnabled = true;
			executionMode = false;
		}

		// On resume: re-scan messages to rebuild completion state
		// Only scan messages AFTER the last "plan-mode-execute" to avoid picking up [DONE:n] from previous plans
		const isResume = workflowEntry !== undefined;
		if (isResume && executionMode && todoItems.length > 0) {
			// Find the index of the last plan-mode-execute entry (marks when current execution started)
			let executeIndex = -1;
			for (let i = entries.length - 1; i >= 0; i--) {
				const entry = entries[i] as {
					type: string;
					message?: { customType?: string };
				};
				if (entry.type === "message" && entry.message?.customType === "plan-mode-execute") {
					executeIndex = i;
					break;
				}
			}

			// Only scan messages after the execute marker
			const messages: AssistantMessage[] = [];
			for (let i = executeIndex + 1; i < entries.length; i++) {
				const entry = entries[i];
				if (entry.type === "message" && "message" in entry && isAssistantMessage(entry.message as AgentMessage)) {
					messages.push(entry.message as AssistantMessage);
				}
			}
			const allText = messages.map(getTextContent).join("\n");
			markCompletedSteps(allText, todoItems);
		}

		if (planModeEnabled) {
			enablePlanModeTools();
		}
		updateStatus(ctx);
	});
}
