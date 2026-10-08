import { Theme, ToolExecutionComponent, type ThemeColor } from "@earendil-works/pi-coding-agent";
import { Container } from "@earendil-works/pi-tui";

const BRAILLE = new Set(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]);
const PATCH_KEY = Symbol.for("pi.cc-extension-patches.tool-status-dots");
type Tool = { executionStarted?: boolean; isPartial?: boolean; result?: unknown; children?: Tool[] };

export function toolStatusDot(now: number, running: boolean): string {
  return !running || Math.floor(now / 500) % 2 === 0 ? "●" : " ";
}

function running(tool: Tool): boolean {
  if (Array.isArray(tool.children) && !(tool instanceof ToolExecutionComponent)) return tool.children.some(running);
  return tool.executionStarted === true && (!tool.result || tool.isPartial === true);
}

function isTool(value: unknown): value is Tool & { render(width: number): string[] } {
  if (value instanceof ToolExecutionComponent) return true;
  const candidate = value as { toolName?: string; toolCallId?: string } | undefined;
  return candidate?.toolName === "Tool group" && candidate.toolCallId?.startsWith("ccstyle-tool-group-") === true;
}

/** Scope icon substitution to actual tool/group rendering, leaving output and other UI text alone. */
export function installToolStatusDots(): () => void {
  const container = Container.prototype;
  const theme = Theme.prototype;
  const host = container as typeof container & { [PATCH_KEY]?: { dispose(): void } };
  host[PATCH_KEY]?.dispose();
  const originalRender = container.render;
  const originalFg = theme.fg;
  let scope: Tool | undefined;
  let active = true;

  const fg: typeof theme.fg = function (this: Theme, color: ThemeColor, text: string) {
    if (active && scope && color === "accent" && BRAILLE.has(text)) {
      const animating = running(scope);
      return originalFg.call(this, animating ? "success" : "dim", toolStatusDot(Date.now(), animating));
    }
    return originalFg.call(this, color, text);
  };
  const render: typeof container.render = function (this: Container, width) {
    if (!active) return originalRender.call(this, width);
    const undo: Array<() => void> = [];
    try {
      for (const child of this.children) {
        if (!isTool(child)) continue;
        const descriptor = Object.getOwnPropertyDescriptor(child, "render");
        const original = child.render;
        child.render = function (this: typeof child, childWidth) {
          const previous = scope;
          scope = child as Tool;
          try { return original.call(this, childWidth); } finally { scope = previous; }
        };
        undo.push(() => {
          if (descriptor) Object.defineProperty(child, "render", descriptor);
          else delete (child as unknown as { render?: unknown }).render;
        });
      }
      return originalRender.call(this, width);
    } finally {
      for (const restore of undo.toReversed()) restore();
    }
  };
  const patch = {
    dispose() {
      active = false;
      scope = undefined;
      if (container.render === render) container.render = originalRender;
      if (theme.fg === fg) theme.fg = originalFg;
      if (host[PATCH_KEY] === patch) delete host[PATCH_KEY];
    },
  };
  host[PATCH_KEY] = patch;
  container.render = render;
  theme.fg = fg;
  return () => patch.dispose();
}
