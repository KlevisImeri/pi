import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { wrapTextWithAnsi, type Component, type TUI } from "@earendil-works/pi-tui";

const WIDGET_KEY = "loaded-tools";

type ToolInfo = {
  name: string;
};

function unique(names: string[]): string[] {
  return [...new Set(names)];
}

function report(pi: ExtensionAPI): { active: string[]; registered: string[]; inactive: string[] } {
  const active = unique(pi.getActiveTools());
  const registered = unique((pi.getAllTools() as ToolInfo[]).map((tool) => tool.name));
  const activeSet = new Set(active);
  const inactive = registered.filter((name) => !activeSet.has(name));
  return { active, registered, inactive };
}

type TuiTreeNode = {
  children?: unknown[];
};

function removeWidgetLeadingSpacer(tui: TUI, widget: Component): boolean {
  const visited = new Set<object>();

  function visit(node: unknown): boolean {
    if (typeof node !== "object" || node === null) return false;
    if (visited.has(node)) return false;
    visited.add(node);

    const children = (node as TuiTreeNode).children;
    if (!Array.isArray(children)) return false;

    const widgetIndex = children.indexOf(widget);
    const previous = widgetIndex > 0 ? children[widgetIndex - 1] : undefined;
    if (
      widgetIndex > 0 &&
      typeof previous === "object" &&
      previous !== null &&
      (previous as { constructor?: { name?: string } }).constructor?.name === "Spacer"
    ) {
      children.splice(widgetIndex - 1, 1);
      return true;
    }

    for (const child of children) {
      if (visit(child)) return true;
    }
    return false;
  }

  return visit(tui);
}

function installWidget(pi: ExtensionAPI, ctx: ExtensionContext): void {
  if (ctx.mode !== "tui") return;

  ctx.ui.setWidget(WIDGET_KEY, (tui, theme) => {
    const current = report(pi);
    const lines = [
      theme.fg("mdHeading", "[Tools]"),
      theme.fg("dim", `  Active: ${current.active.join(", ") || "(none)"}`),
      theme.fg("dim", `  Inactive: ${current.inactive.join(", ") || "(none)"}`),
    ];

    const widget: Component = {
      render(width: number): string[] {
        return lines.flatMap((line) =>
          line.length === 0 ? [""] : wrapTextWithAnsi(line, Math.max(1, width)),
        );
      },
      invalidate() {},
    };

    // Pi adds a leading spacer to every above-editor widget. The loaded
    // resources list already adds one after [Themes], so remove only this
    // widget's spacer to keep the sections separated by one blank line.
    queueMicrotask(() => {
      if (removeWidgetLeadingSpacer(tui, widget)) tui.requestRender();
    });

    return widget;
  });
}

function formatReport(pi: ExtensionAPI): string {
  const current = report(pi);
  return [
    "[Tools]",
    `  Active (${current.active.length}): ${current.active.join(", ") || "(none)"}`,
    `  Inactive (${current.inactive.length}): ${current.inactive.join(", ") || "(none)"}`,
  ].join("\n");
}

export default function loadedTools(pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    installWidget(pi, ctx);
  });

  // The startup list should not occupy space above the prompt during normal
  // turns. Pi's public widget API only places widgets above/below the editor,
  // so remove this startup-only widget when the first agent turn begins.
  pi.on("agent_start", async (_event, ctx) => {
    if (ctx.mode === "tui") ctx.ui.setWidget(WIDGET_KEY, undefined);
  });

  pi.registerCommand("tools", {
    description: "Show active and registered tool names",
    handler: async (_args, ctx) => {
      ctx.ui.notify(formatReport(pi), "info");
    },
  });
}
