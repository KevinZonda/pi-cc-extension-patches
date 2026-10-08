import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Loader } from "@earendil-works/pi-tui";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import patches from "../extensions/index.ts";
import { loadConfig, normalizeConfig } from "../extensions/config.ts";
import { spinnerFrames } from "../extensions/spinner.ts";
import { pickVerb } from "../extensions/verbs.ts";
import { installWorkingVerb, replaceWorkingPrefix } from "../extensions/working-verb.ts";

test("star animation travels out and back, with themed frames", () => {
  assert.deepEqual(spinnerFrames(frame => `<${frame}>`),
    ["·", "✢", "✳", "✶", "✻", "✽", "✽", "✻", "✶", "✳", "✢", "·"].map(frame => `<${frame}>`));
});

test("verb selection uses the provided list", () => {
  assert.equal(pickVerb(["Baking", "Thinking"], () => 0), "Baking");
  assert.equal(pickVerb(["Baking", "Thinking"], () => 0.99), "Thinking");
});

test("replace only Working prefix, preserving all main-plugin status text", () => {
  assert.equal(replaceWorkingPrefix("Working... (↓ 1,234 tokens · 12s)", "Baking"),
    "Baking… (↓ 1,234 tokens · 12s)");
  assert.equal(replaceWorkingPrefix("Working…", "Thinking"), "Thinking…");
  assert.equal(replaceWorkingPrefix("Working...", "$&"), "$&…");
  for (const text of ["Running... · 9s, bash×1", "Retrying (1/3)", "Compacting context...", "Loading...", "Working...Something"]) {
    assert.equal(replaceWorkingPrefix(text, "Baking"), text);
  }
});

test("display wrapper restores stored message even if rendering throws", () => {
  const rendered: string[] = [];
  const prototype = { updateDisplay(this: { message: string }) {
    rendered.push(this.message);
    throw new Error("render failed");
  } };
  const original = prototype.updateDisplay;
  const dispose = installWorkingVerb(prototype, message => replaceWorkingPrefix(message, "Baking"));
  const loader = Object.assign(Object.create(prototype), { kind: "working", message: "Working..." });
  assert.throws(() => loader.updateDisplay(), /render failed/);
  assert.equal(loader.message, "Working...");
  assert.deepEqual(rendered, ["Baking…"]);
  dispose();
  assert.equal(prototype.updateDisplay, original);
});

test("reload replaces old patch, and stale disposal cannot remove the new patch", () => {
  const rendered: string[] = [];
  const prototype = { updateDisplay(this: { message: string }) { rendered.push(this.message); } };
  const original = prototype.updateDisplay;
  const disposeOld = installWorkingVerb(prototype, message => replaceWorkingPrefix(message, "Baking"));
  const disposeNew = installWorkingVerb(prototype, message => replaceWorkingPrefix(message, "Thinking"));
  disposeOld();
  const loader = Object.assign(Object.create(prototype), { kind: "working", message: "Working..." });
  loader.updateDisplay();
  assert.deepEqual(rendered, ["Thinking…"]);
  disposeNew();
  assert.equal(prototype.updateDisplay, original);
});

test("disposal preserves another extension's outer wrapper", () => {
  const rendered: string[] = [];
  const prototype = { updateDisplay(this: { message: string }) { rendered.push(this.message); } };
  const dispose = installWorkingVerb(prototype, message => replaceWorkingPrefix(message, "Baking"));
  const downstream = prototype.updateDisplay;
  const foreign = function (this: { message: string }) { downstream.call(this); };
  prototype.updateDisplay = foreign;
  dispose();
  assert.equal(prototype.updateDisplay, foreign);
  Object.assign(Object.create(prototype), { kind: "working", message: "Working..." }).updateDisplay();
  assert.deepEqual(rendered, ["Working..."]);
});

test("config validates timer bounds and strips terminal controls from custom verbs", () => {
  assert.equal(normalizeConfig({ intervalMs: -1 }).intervalMs, 50);
  assert.equal(normalizeConfig({ intervalMs: Infinity }).intervalMs, 170);
  assert.equal(normalizeConfig({ intervalMs: 9000 }).intervalMs, 2000);
  assert.deepEqual(normalizeConfig({ verbs: [null, "", " Baking\n\u001b "] }).verbs, ["Baking"]);
  assert.ok(normalizeConfig({ verbs: [] }).verbs.length > 100);
  assert.equal(normalizeConfig({ spinnerEnabled: false }).spinnerEnabled, false);
  assert.equal(loadConfig(join(tmpdir(), "missing-cc-patches", "config.json")).warning, undefined);
});

function harness() {
  const directory = mkdtempSync(join(tmpdir(), "pi-cc-patches-"));
  const previousDirectory = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = directory;
  const events = new Map<string, Array<(...args: any[]) => any>>();
  const indicators: any[] = [];
  const notices: string[] = [];
  let liveLoader: Loader | undefined;
  const ui = {
    theme: { fg: (_key: string, value: string) => value },
    setWorkingIndicator(options?: any) {
      indicators.push(options);
      liveLoader?.setIndicator(options);
      liveLoader?.stop();
    },
    notify(message: string) { notices.push(message); },
  };
  const ctx = { hasUI: true, mode: "tui", ui };
  patches({ on(name: string, fn: (...args: any[]) => any) {
    const handlers = events.get(name) ?? [];
    handlers.push(fn);
    events.set(name, handlers);
  }, registerCommand() {} } as unknown as ExtensionAPI);
  const fire = (name: string) => { for (const fn of events.get(name) ?? []) fn({}, ctx); };
  return {
    events, ctx, indicators, notices, fire,
    attach(loader: Loader) { liveLoader = loader; },
    cleanup() {
      fire("session_shutdown");
      liveLoader?.stop();
      if (previousDirectory === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previousDirectory;
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

test("real Pi Loader displays stable per-turn verbs and preserves incoming status updates", t => {
  const h = harness();
  t.after(() => h.cleanup());
  t.mock.method(Math, "random", () => 0);
  h.fire("session_start");
  const loader = new Loader({ requestRender() {} } as any, text => text, text => text, "Working...");
  loader.stop();
  Object.assign(loader, { kind: "working" });
  h.attach(loader);
  h.fire("turn_start");
  loader.setMessage("Working... (↓ 1,234 tokens · 12s)");
  assert.match(loader.render(100).join("\n"), /Accomplishing… \(↓ 1,234 tokens · 12s\)/);
  assert.equal((loader as any).message, "Working... (↓ 1,234 tokens · 12s)");
  loader.setMessage("Working... (↓ 2,345 tokens · 13s)");
  assert.match(loader.render(100).join("\n"), /Accomplishing… \(↓ 2,345 tokens · 13s\)/);
  loader.setMessage("Running... · 9s, bash×1 · ↓ 2,345 tokens");
  assert.match(loader.render(100).join("\n"), /Running\.\.\. · 9s, bash×1/);
  (Math.random as any).mock.mockImplementation(() => 0.999);
  h.fire("turn_start");
  loader.setMessage("Working...");
  assert.match(loader.render(100).join("\n"), /Zooming…/);
  Object.assign(loader, { kind: "retry" });
  loader.setMessage("Working...");
  assert.match(loader.render(100).join("\n"), /Working\.\.\./);
  Object.assign(loader, { kind: "working" });
  h.fire("turn_end");
  loader.setMessage("Working...");
  assert.match(loader.render(100).join("\n"), /Working\.\.\./);
  assert.equal(h.indicators[0].intervalMs, 170);
  assert.equal(h.indicators[0].frames.length, 12);
  h.fire("session_shutdown");
  assert.equal(h.indicators.at(-1), undefined);
});

test("print and RPC modes do not patch UI", t => {
  const h = harness();
  t.after(() => h.cleanup());
  h.ctx.hasUI = false;
  h.ctx.mode = "rpc";
  h.fire("session_start");
  h.fire("turn_start");
  assert.deepEqual(h.indicators, []);
  assert.deepEqual(h.notices, []);
});

test("older hosts are skipped with a clear notice", t => {
  const h = harness();
  t.after(() => h.cleanup());
  (h.ctx.ui as any).setWorkingIndicator = undefined;
  h.fire("session_start");
  h.fire("turn_start");
  assert.match(h.notices[0], /setWorkingIndicator/);
  assert.deepEqual(h.indicators, []);
});
