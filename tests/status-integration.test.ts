import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { initTheme, ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import { Container } from "@earendil-works/pi-tui";
import { loadExtensions } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js";
import { loadThemeFromPath } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import patches from "../extensions/index.ts";

const main = resolve("../pi-cc-extensions/extensions");
initTheme("dark");

test("real pi-cc-extensions grouped tool renderers use dots in either startup order", {
  skip: !existsSync(join(main, "renderer/default-mode.ts")),
}, async t => {
  const dir = mkdtempSync(join(tmpdir(), "pi-cc-status-integration-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  writeFileSync(join(dir, "pi-cc-extension-patches.json"), JSON.stringify({ headerEnabled: false }));
  const fixture = join(dir, "main-renderers.ts");
  writeFileSync(fixture, `
import { installDefaultMode } from ${JSON.stringify(join(main, "renderer/default-mode.ts"))};
import { installToolGrouping } from ${JSON.stringify(join(main, "renderer/tool/grouping.ts"))};
import { WriteExecutionMetadataStore } from ${JSON.stringify(join(main, "renderer/tool/diff/write-execution.ts"))};
import { clearAllAnimations } from ${JSON.stringify(join(main, "renderer/tool/result.ts"))};
import { setConfig, normalizeConfig } from ${JSON.stringify(join(main, "config/config.ts"))};
export default function(pi) {
  let defaults, groups;
  pi.on("session_start", (_, ctx) => {
    setConfig(normalizeConfig({ mode: "on" }));
    defaults = installDefaultMode(new WriteExecutionMetadataStore());
    groups = installToolGrouping(() => true);
    groups.setTheme(ctx.ui.theme);
  });
  pi.on("session_shutdown", () => {
    clearAllAnimations(); groups?.shutdown(); defaults?.shutdown();
  });
}
`);
  t.after(() => {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  });
  const theme = loadThemeFromPath(resolve("themes/claude-dark.json"));
  t.mock.method(Date, "now", () => 0);
  for (const patchesFirst of [true, false]) {
    const result = await loadExtensions([fixture], process.cwd());
    assert.deepEqual(result.errors, []);
    const mainHandlers = result.extensions[0].handlers;
    const patchHandlers = new Map<string, Array<(...args: any[]) => any>>();
    patches({ on(name: string, fn: (...args: any[]) => any) {
      const handlers = patchHandlers.get(name) ?? []; handlers.push(fn); patchHandlers.set(name, handlers);
    }, registerCommand() {} } as any);
    const ctx = { hasUI: true, mode: "tui", ui: {
      theme, requestRender() {}, notify() {}, setWorkingIndicator() {},
    } };
    const maps = patchesFirst ? [patchHandlers, mainHandlers] : [mainHandlers, patchHandlers];
    const fire = async (name: string) => {
      for (const map of maps) for (const fn of map.get(name) ?? []) await fn({} as any, ctx as any);
    };
    try {
      await fire("session_start");
      const read = new ToolExecutionComponent("read", "read", { path: "example.ts" }, {}, undefined, ctx.ui as any, process.cwd());
      const bash = new ToolExecutionComponent("bash", "bash", { command: "npm test" }, {}, undefined, ctx.ui as any, process.cwd());
      read.markExecutionStarted(); bash.markExecutionStarted();
      const parent = new Container();
      parent.addChild(read); parent.addChild(bash);
      const text = parent.render(120).join("\n").replace(/\x1b\[[0-9;]*m/g, "");
      assert.match(text, /├ ● Read/);
      assert.match(text, /└ ● Bash/);
      assert.doesNotMatch(text, /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
      read.updateResult({ content: [{ type: "text", text: "done ⠏" }], isError: false });
      bash.updateResult({ content: [{ type: "text", text: "failed" }], isError: true });
      const settled = parent.render(120).join("\n").replace(/\x1b\[[0-9;]*m/g, "");
      assert.match(settled, /✓ Read/);
      assert.match(settled, /✗ Bash/);
    } finally { await fire("session_shutdown"); }
  }
});
