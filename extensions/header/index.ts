import { InteractiveMode, type ExtensionAPI, type ExtensionContext, type Theme } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { PiStartupHeader, type HeaderData } from "./component.ts";
import { collectLoadedStats, loadedDetails, type ResourceSnapshot } from "./resources.ts";

type Mode = {
  session?: {
    resourceLoader?: ResourceSnapshot;
    model?: HeaderData["model"];
    thinkingLevel?: string;
    sessionManager?: { getCwd(): string };
  };
};
type Factory = (tui: TUI, theme: Theme) => PiStartupHeader;
type SetHeader = (this: Mode, factory?: unknown) => unknown;
export type HeaderPrototype = { setExtensionHeader: SetHeader };
const HEADER_KEY = Symbol.for("pi.cc-extension-patches.header-owner");

/** Intercept the native header slot, so either extension load order produces one header. */
export function installHeaderSlot(prototype: HeaderPrototype, factory: (mode: Mode) => Factory): () => void {
  const host = prototype as HeaderPrototype & { [HEADER_KEY]?: { dispose(): void } };
  host[HEADER_KEY]?.dispose();
  const original = prototype.setExtensionHeader;
  let active = true;
  const installed: SetHeader = function (requested) {
    return original.call(this, active && requested !== undefined ? factory(this) : requested);
  };
  const patch = {
    dispose() {
      active = false;
      if (prototype.setExtensionHeader === installed) prototype.setExtensionHeader = original;
      if (host[HEADER_KEY] === patch) delete host[HEADER_KEY];
    },
  };
  host[HEADER_KEY] = patch;
  prototype.setExtensionHeader = installed;
  return () => patch.dispose();
}

export function registerHeader(pi: ExtensionAPI, enabled: boolean, animate = false): void {
  if (!enabled) return;
  const prototype = InteractiveMode.prototype as unknown as HeaderPrototype;
  if (typeof prototype.setExtensionHeader !== "function") return;
  let mode: Mode | undefined;
  let currentCtx: ExtensionContext | undefined;
  let currentTheme: Theme | undefined;
  let activeHeader: PiStartupHeader | undefined;
  let applyTimer: ReturnType<typeof setTimeout> | undefined;
  let shutdown = false;

  function data(): HeaderData {
    const session = mode?.session;
    let stats: HeaderData["stats"];
    try { stats = collectLoadedStats(session?.resourceLoader); } catch { /* Optional display only. */ }
    let contextAvailable = false;
    try { contextAvailable = pi.getCommands().some(command => command.name === "context"); } catch { /* Runtime is not bound during early startup. */ }
    return {
      cwd: session?.sessionManager?.getCwd() ?? currentCtx?.cwd ?? process.cwd(),
      model: session?.model ?? currentCtx?.model,
      effort: session?.thinkingLevel ?? "off",
      stats,
      contextAvailable,
    };
  }

  const factory = (host?: Mode): Factory => (tui, theme) => {
    mode = host ?? mode;
    currentTheme = theme;
    activeHeader?.dispose();
    activeHeader = new PiStartupHeader(data, () => {
      try { return currentCtx?.ui.theme ?? currentTheme!; } catch { return currentTheme!; }
    }, () => {
      if (!shutdown) tui.requestRender();
    }, animate);
    return activeHeader;
  };
  const disposeSlot = installHeaderSlot(prototype, factory);

  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI || ctx.mode !== "tui" || typeof ctx.ui.setHeader !== "function") return;
    shutdown = false;
    currentCtx = ctx;
    if (applyTimer) clearTimeout(applyTimer);
    // Covers main plugin disabled headers and /reload, after all startup handlers.
    applyTimer = setTimeout(() => {
      applyTimer = undefined;
      if (!shutdown) {
        try { ctx.ui.setHeader(factory()); } catch { /* A replaced session context is no longer usable. */ }
      }
    }, 0);
    applyTimer.unref?.();
  });

  pi.on("session_shutdown", () => {
    shutdown = true;
    if (applyTimer) clearTimeout(applyTimer);
    applyTimer = undefined;
    activeHeader?.dispose();
    activeHeader = undefined;
    disposeSlot();
    mode = undefined;
    currentCtx = undefined;
  });

  pi.registerCommand("loaded", {
    description: "Show loaded skills, prompts, extensions and themes by scope",
    handler: async () => {
      pi.sendMessage({ customType: "cc-patches-loaded", content: loadedDetails(data().stats), display: true });
    },
  });
}
