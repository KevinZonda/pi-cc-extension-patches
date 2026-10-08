import { join } from "node:path";
import { getAgentDir, UserMessageComponent, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Loader } from "@earendil-works/pi-tui";
import { loadConfig } from "./config.ts";
import { registerHeader } from "./header/index.ts";
import { spinnerFrames } from "./spinner.ts";
import { pickVerb } from "./verbs.ts";
import { installCompactUserMessages, type MessagePrototype } from "./user-messages.ts";
import { installWorkingVerb, replaceWorkingPrefix, type DisplayPrototype } from "./working-verb.ts";

export default function patches(pi: ExtensionAPI): void {
  const configPath = join(getAgentDir(), "pi-cc-extension-patches.json");
  const { config, warning } = loadConfig(configPath);
  registerHeader(pi, config.headerEnabled, config.headerAnimationEnabled);
  let currentVerb = "Working";
  let turnActive = false;
  let supported = false;
  let disposeVerb: (() => void) | undefined;
  let disposeUserMessages: (() => void) | undefined;
  let indicatorUi: ExtensionContext["ui"] | undefined;
  // A distinct owner per factory prevents an old shutdown handler resetting a new installation.
  const owner = {};
  const ownerKey = Symbol.for("pi.cc-extension-patches.indicator-owner");
  const host = globalThis as typeof globalThis & { [ownerKey]?: object };

  function setSpinner(ctx: ExtensionContext): void {
    if (!supported || !config.spinnerEnabled || !ctx.hasUI) return;
    ctx.ui.setWorkingIndicator({
      frames: spinnerFrames(frame => ctx.ui.theme.fg("accent", frame)),
      intervalMs: config.intervalMs,
    });
    indicatorUi = ctx.ui;
    host[ownerKey] = owner;
  }

  pi.on("session_start", (_event, ctx) => {
    turnActive = false;
    currentVerb = "Working";
    disposeVerb?.();
    disposeVerb = undefined;
    disposeUserMessages?.();
    disposeUserMessages = undefined;
    if (!ctx.hasUI || ctx.mode !== "tui") return;
    if (config.compactUserMessages) {
      disposeUserMessages = installCompactUserMessages(UserMessageComponent.prototype as unknown as MessagePrototype);
    }
    supported = typeof ctx.ui.setWorkingIndicator === "function";
    if (!supported) {
      ctx.ui.notify("pi-cc-extension-patches requires Pi with setWorkingIndicator() (tested on 1.1.0).", "warning");
      return;
    }
    if (warning) ctx.ui.notify(warning, "warning");
    if (config.verbsEnabled) {
      disposeVerb = installWorkingVerb(Loader.prototype as unknown as DisplayPrototype, message =>
        turnActive ? replaceWorkingPrefix(message, currentVerb) : message);
    }
    setSpinner(ctx);
  });

  pi.on("turn_start", (_event, ctx) => {
    turnActive = true;
    currentVerb = pickVerb(config.verbs);
    // Also refresh theme colors. Setting the indicator redraws an existing working loader.
    setSpinner(ctx);
  });

  pi.on("turn_end", () => { turnActive = false; });
  pi.on("agent_end", () => { turnActive = false; });
  pi.on("session_shutdown", () => {
    turnActive = false;
    disposeVerb?.();
    disposeVerb = undefined;
    disposeUserMessages?.();
    disposeUserMessages = undefined;
    if (host[ownerKey] === owner) {
      delete host[ownerKey];
      try { indicatorUi?.setWorkingIndicator(); } catch { /* Context may already be replaced. */ }
    }
    indicatorUi = undefined;
  });

  pi.registerCommand("ccpatches", {
    description: "Show personal UI patch settings",
    handler: async (_args, ctx) => {
      ctx.ui.notify([
        `Claude-style header: ${config.headerEnabled ? "on" : "off"}`,
        `Header animation: ${config.headerAnimationEnabled ? "on" : "off"}`,
        `Compact user messages: ${config.compactUserMessages ? "on" : "off"}`,
        `Star spinner: ${config.spinnerEnabled ? "on" : "off"} (${config.intervalMs}ms)`,
        `Random verbs: ${config.verbsEnabled ? "on" : "off"} (${config.verbs.length} words)`,
        `Config: ${configPath} (apply with /reload)`,
      ].join("\n"), "info");
    },
  });
}
