import assert from "node:assert/strict";
import test from "node:test";
import { ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import { Container, Loader } from "@earendil-works/pi-tui";
import { loadThemeFromPath } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { installNativeSpinners, type LoaderPrototype } from "../extensions/native-spinners.ts";
import { installToolStatusDots, toolStatusDot } from "../extensions/tool-status.ts";

const prototype = Loader.prototype as unknown as LoaderPrototype;
const strip = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, "");
const theme = loadThemeFromPath(new URL("../themes/claude-dark.json", import.meta.url).pathname);

test("native command, retry and compaction loaders use star frames, retain colors/text, and restore", t => {
  const dispose = installNativeSpinners(prototype, 170);
  t.after(dispose);
  for (const message of ["Running... (esc to cancel)", "Retrying (1/3) in 2s...", "Compacting context..."]) {
    const loader = new Loader({ requestRender() {} } as any, text => `<${text}>`, text => text, message);
    t.after(() => loader.stop());
    loader.stop();
    assert.match(loader.render(100).join("\n"), /<·>/);
    assert.ok(loader.render(100).join("\n").includes(message));
    assert.equal((loader as any).intervalMs, 170);
    (loader as any).currentFrame = 2;
    loader.setMessage(message);
    assert.match(loader.render(100).join("\n"), /<✳>/);
  }
  const stopped = new Loader({ requestRender() {} } as any, text => text, text => text);
  t.after(() => stopped.stop());
  stopped.stop();
  dispose();
  assert.equal((stopped as any).intervalId, null);
  assert.equal((stopped as any).intervalMs, 80);
  assert.match(stopped.render(100).join("\n"), /⠋/);
});

test("explicit custom indicators, hidden indicators and working stars are preserved", t => {
  const dispose = installNativeSpinners(prototype, 170);
  t.after(dispose);
  const loaders = [
    new Loader({ requestRender() {} } as any, text => text, text => text, "custom", { frames: ["X", "Y"], intervalMs: 220 }),
    new Loader({ requestRender() {} } as any, text => text, text => text, "hidden", { frames: [] }),
  ];
  t.after(() => loaders.forEach(loader => loader.stop()));
  assert.match(loaders[0].render(40).join("\n"), /X custom/);
  assert.equal((loaders[0] as any).intervalMs, 220);
  assert.doesNotMatch(loaders[1].render(40).join("\n"), /[·✢✳✶✻✽⠋]/);
  dispose();
  assert.match(loaders[0].render(40).join("\n"), /X custom/);
});

test("native spinner reload restores methods without letting stale owners reset the new patch", t => {
  const original = prototype.setIndicator;
  const oldDispose = installNativeSpinners(prototype, 170);
  const newDispose = installNativeSpinners(prototype, 200);
  t.after(newDispose);
  oldDispose();
  const loader = new Loader({ requestRender() {} } as any, text => text, text => text);
  loader.stop();
  assert.equal((loader as any).intervalMs, 200);
  newDispose();
  assert.equal(prototype.setIndicator, original);
});

test("tool dot alternates between a solid green dot and a same-width blank; idle dots stay static", () => {
  assert.equal(toolStatusDot(0, true), "●");
  assert.equal(toolStatusDot(499, true), "●");
  assert.equal(toolStatusDot(500, true), " ");
  assert.equal(toolStatusDot(1000, true), "●");
  assert.equal(toolStatusDot(500, false), "●");
});

test("dot substitution is scoped to tool status icons; preserves payload, successes, errors and other UI", t => {
  const dispose = installToolStatusDots();
  t.after(dispose);
  t.mock.method(Date, "now", () => 0);
  const tool = Object.create(ToolExecutionComponent.prototype) as any;
  tool.executionStarted = true;
  tool.render = () => [
    theme.fg("accent", "⠏") + " Bash npm test",
    theme.fg("toolOutput", "⠏"),
    theme.fg("muted", "⠏"),
    theme.fg("accent", "literal ⠏ output"),
    theme.fg("success", "✓"), theme.fg("error", "✗"),
  ];
  const original = tool.render;
  const parent = new Container();
  parent.addChild(tool);
  const rendered = parent.render(100).map(strip);
  assert.deepEqual(rendered, ["● Bash npm test", "⠏", "⠏", "literal ⠏ output", "✓", "✗"]);
  assert.equal(tool.render, original);
  assert.ok(parent.render(100)[0].includes(theme.getFgAnsi("success")));
  assert.ok(theme.fg("accent", "⠏").includes("⠏"));
  const unrelated = new Container();
  unrelated.addChild({ render: () => [theme.fg("accent", "⠏")], invalidate() {} });
  assert.equal(strip(unrelated.render(100)[0]), "⠏");
  (Date.now as any).mock.mockImplementation(() => 500);
  assert.equal(strip(parent.render(100)[0]), "  Bash npm test");
  tool.executionStarted = false;
  assert.equal(strip(parent.render(100)[0]), "● Bash npm test");
});

test("grouped and nested tool icons use dots, and render failures unwind the scope", t => {
  const dispose = installToolStatusDots();
  t.after(dispose);
  t.mock.method(Date, "now", () => 0);
  const parent = new Container();
  const group = Object.assign(new Container(), {
    toolName: "Tool group", toolCallId: "ccstyle-tool-group-test",
    children: [{ executionStarted: true, render: () => [] }] as any,
    render: () => [`├ ${theme.fg("accent", "⠋")} Read a.ts`, `└ ${theme.fg("accent", "⠏")} Bash npm test`],
  });
  parent.addChild(group);
  assert.deepEqual(parent.render(80).map(strip), ["├ ● Read a.ts", "└ ● Bash npm test"]);
  const tool = Object.create(ToolExecutionComponent.prototype) as any;
  tool.render = () => { throw new Error("render failed"); };
  const original = tool.render;
  const other = new Container();
  other.addChild(tool);
  assert.throws(() => other.render(80), /render failed/);
  assert.equal(tool.render, original);
  assert.match(theme.fg("accent", "⠏"), /⠏/);
});
