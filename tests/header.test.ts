import assert from "node:assert/strict";
import test from "node:test";
import { InteractiveMode, initTheme, type ExtensionAPI, type Theme } from "@earendil-works/pi-coding-agent";
import { Container, Text, visibleWidth } from "@earendil-works/pi-tui";
import { PiStartupHeader, type HeaderData } from "../extensions/header/component.ts";
import { installHeaderSlot, registerHeader, type HeaderPrototype } from "../extensions/header/index.ts";
import { collectLoadedStats, loadedDetails, loadedSummary, type ResourceSnapshot } from "../extensions/header/resources.ts";

const identityTheme = { fg: (_name: string, text: string) => text, bold: (text: string) => text } as Theme;
const resources: ResourceSnapshot = {
  getSkills: () => ({ skills: [{ name: "global-skill", sourceInfo: { scope: "user" } }, { name: "project-skill", sourceInfo: { scope: "project" } }] }),
  getPrompts: () => ({ prompts: [{ name: "review", sourceInfo: { scope: "user" } }] }),
  getExtensions: () => ({ extensions: [{ path: "/global/extensions/a.ts", sourceInfo: { scope: "user" } }, { path: "/project/extensions/b.ts", sourceInfo: { scope: "project" } }] }),
  getThemes: () => ({ themes: [{ name: "claude-dark", sourceInfo: { scope: "user" } }] }),
};
const initialData: HeaderData = {
  cwd: "/project/demo",
  model: { provider: "openai", id: "gpt-6.1-sol" },
  effort: "medium",
  stats: collectLoadedStats(resources),
  contextAvailable: true,
};

test("header matches the two-column layout and fits every terminal width", () => {
  const header = new PiStartupHeader(() => initialData, () => identityTheme, () => {}, false);
  const wide = header.render(140).join("\n");
  assert.match(wide, /pi-cc-extensions/);
  assert.match(wide, /openai\/gpt-6.1-sol · medium effort/);
  assert.match(wide, /2 skills · 1 prompts · 2 extensions/);
  assert.match(wide, /3 global · 2 project/);
  assert.match(wide, /\/ccstyle or \/ccpatches/);
  assert.match(wide, /\/context to view current context/);
  assert.match(wide, /▐██▄███▄██▌/);
  for (let width = 0; width <= 200; width++) {
    for (const line of header.render(width)) {
      assert.ok(visibleWidth(line) <= width, `line overflows width ${width}: ${line}`);
      if (width >= 24) assert.equal(visibleWidth(line), width);
    }
  }
  assert.doesNotMatch(header.render(40).join("\n"), /Getting started/);
  header.dispose();
});

test("animation stops after the final pose and disposal prevents later redraws", t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let renders = 0;
  const header = new PiStartupHeader(() => initialData, () => identityTheme, () => { renders++; });
  const first = header.render(120).join("\n");
  t.mock.timers.tick(120 * 20);
  assert.equal(renders, 12);
  assert.notEqual(header.render(120).join("\n"), first);
  t.mock.timers.tick(120 * 20);
  assert.equal(renders, 12);
  const other = new PiStartupHeader(() => initialData, () => identityTheme, () => { renders++; });
  other.dispose();
  t.mock.timers.tick(120 * 20);
  assert.equal(renders, 12);
  header.dispose();
});

test("resource stats read loaded objects without initiating a reload; themes are excluded from aggregate", () => {
  const stats = collectLoadedStats(resources)!;
  assert.deepEqual(loadedSummary(stats), ["2 skills · 1 prompts · 2 extensions", "3 global · 2 project"]);
  assert.match(loadedDetails(stats), /project: project-skill/);
  assert.match(loadedDetails(stats), /Themes \(1/);
  assert.equal(collectLoadedStats(undefined), undefined);
  assert.match(loadedDetails(undefined), /unavailable/);
});

test("header slot ownership survives reload and preserves native reset", () => {
  const received: unknown[] = [];
  const prototype: HeaderPrototype = { setExtensionHeader(value) { received.push(value); } };
  const original = prototype.setExtensionHeader;
  const makeHeader = () => (() => undefined) as any;
  const disposeOld = installHeaderSlot(prototype, makeHeader);
  const disposeNew = installHeaderSlot(prototype, makeHeader);
  disposeOld();
  prototype.setExtensionHeader.call({}, "main-plugin-header");
  assert.equal(typeof received[0], "function");
  prototype.setExtensionHeader.call({}, undefined);
  assert.equal(received[1], undefined);
  disposeNew();
  assert.equal(prototype.setExtensionHeader, original);
});

test("actual Pi header slot replaces the main header, uses live resources and resets cleanly", async t => {
  initTheme("dark");
  const handlers = new Map<string, Array<(...args: any[]) => any>>();
  const commands = new Map<string, any>();
  const messages: any[] = [];
  const pi = {
    on(name: string, fn: (...args: any[]) => any) {
      const list = handlers.get(name) ?? [];
      list.push(fn);
      handlers.set(name, list);
    },
    registerCommand(name: string, command: any) { commands.set(name, command); },
    getCommands: () => [{ name: "context" }],
    sendMessage(message: any) { messages.push(message); },
  } as unknown as ExtensionAPI;
  const mode = Object.create(InteractiveMode.prototype) as any;
  Object.defineProperty(mode, "session", { value: {
    resourceLoader: resources,
    model: initialData.model,
    thinkingLevel: "medium",
    sessionManager: { getCwd: () => initialData.cwd },
  } });
  mode.builtInHeader = new Text("native header");
  mode.headerContainer = new Container();
  mode.headerContainer.addChild(mode.builtInHeader);
  mode.ui = { requestRender() {} };
  const ctx = { mode: "tui", hasUI: true, cwd: initialData.cwd, ui: {
    theme: identityTheme,
    setHeader(factory?: any) { mode.setExtensionHeader(factory); },
  } };
  const original = (InteractiveMode.prototype as any).setExtensionHeader;
  registerHeader(pi, true);
  t.after(() => {
    for (const fn of handlers.get("session_shutdown") ?? []) fn({}, ctx);
    mode.setExtensionHeader(undefined);
  });
  // Main plugin's early header factory is intercepted before session_start.
  mode.setExtensionHeader(() => new Text("main-plugin header"));
  assert.ok(mode.customHeader instanceof PiStartupHeader);
  assert.equal(mode.headerContainer.children.length, 1);
  assert.match(mode.customHeader.render(140).join("\n"), /2 skills/);
  for (const fn of handlers.get("session_start") ?? []) fn({}, ctx);
  await new Promise(resolve => setTimeout(resolve, 5));
  mode.setExtensionHeader(() => new Text("late main-plugin header"));
  assert.ok(mode.customHeader instanceof PiStartupHeader);
  assert.equal(mode.headerContainer.children.length, 1);
  await commands.get("loaded").handler("", ctx);
  assert.match(messages[0].content, /project-skill/);
  mode.setExtensionHeader(undefined);
  assert.equal(mode.customHeader, undefined);
  assert.equal(mode.headerContainer.children[0], mode.builtInHeader);
  for (const fn of handlers.get("session_shutdown") ?? []) fn({}, ctx);
  assert.equal((InteractiveMode.prototype as any).setExtensionHeader, original);
});
