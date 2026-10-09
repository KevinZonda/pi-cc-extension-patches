import assert from "node:assert/strict";
import test from "node:test";
import { CustomEditor, initTheme } from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { KeybindingsManager } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/keybindings.js";
import { getEditorTheme } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { installPromptEditor, type PromptEditorPrototype } from "../extensions/prompt-editor.ts";

initTheme("dark");
// SAFETY: Native CustomEditor inherits both methods; its visible row count is populated by render.
const prototype = CustomEditor.prototype as unknown as PromptEditorPrototype;
function editor() {
  const tui: any = { terminal: { rows: 40, columns: 80 }, requestRender() {} };
  const instance = new CustomEditor(tui, getEditorTheme(), new KeybindingsManager(), { paddingX: 1 });
  instance.focused = true;
  return instance;
}

test("editor prompt wraps within width, aligns continuation rows and preserves the hardware cursor and raw draft", t => {
  const input = editor();
  input.setText("中文消息与 emoji 🐱\nsecond line with wrapping");
  const draft = input.getText();
  const dispose = installPromptEditor(prototype, text => text);
  t.after(dispose);
  for (const width of [4, 8, 20, 80]) {
    const lines = input.render(width);
    const bottom = (input as any).renderedVisibleLineCount + 1;
    assert.equal(stripTerminalSequences(lines[1]).startsWith("❯ "), width >= 6);
    for (const line of lines) assert.ok(visibleWidth(line) <= width, `width ${width}: ${visibleWidth(line)}`);
    if (width >= 6) for (const line of lines.slice(2, bottom)) assert.ok(stripTerminalSequences(line).startsWith("  "));
    assert.equal(lines.join("").split(CURSOR_MARKER).length - 1, 1);
    assert.equal(input.getText(), draft);
  }
  let sent = "";
  input.onSubmit = text => { sent = text; };
  input.handleInput("\r");
  assert.equal(sent, draft);
});

test("mouse clicks use adjusted columns and shell mode keeps its original bang display", t => {
  const input = editor();
  input.setText("abcd");
  const dispose = installPromptEditor(prototype, text => text);
  t.after(dispose);
  input.render(20);
  input.handleMouse({ type: "click", button: "left", x: 4, y: 1, width: 20, height: 4, shift: false, alt: false, ctrl: false } as any);
  assert.equal(input.getCursor().col, 1); // Two prompt columns plus one native padding column.
  input.setText("!pwd");
  dispose();
  const native = input.render(20);
  const restore = installPromptEditor(prototype, text => text);
  t.after(restore);
  assert.deepEqual(input.render(20), native);
  assert.equal(input.getText(), "!pwd");
});

test("autocomplete rows are not mistaken for input rows or the bottom border", t => {
  const input = editor();
  input.setText("/he");
  Object.assign(input, { autocompleteState: {}, autocompleteList: { render: () => ["menu item"] } });
  const dispose = installPromptEditor(prototype, text => text);
  t.after(dispose);
  const lines = input.render(20).map(stripTerminalSequences);
  assert.equal(lines.join("").split("❯").length - 1, 1);
  assert.match(lines[2], /^─+$/);
  assert.match(lines[3], /^ +menu item/);
  assert.equal(visibleWidth(lines[3]), 20);
});

test("empty drafts have a prompt; tiny terminals, repeated install and stale teardown stay safe", () => {
  const input = editor();
  const renderDescriptor = Object.getOwnPropertyDescriptor(CustomEditor.prototype, "render");
  const mouseDescriptor = Object.getOwnPropertyDescriptor(CustomEditor.prototype, "handleMouse");
  const old = installPromptEditor(prototype, text => text);
  const current = installPromptEditor(prototype, text => text);
  try {
    old();
    assert.equal(input.render(20).join("").split("❯").length - 1, 1);
    assert.ok(!input.render(2).join("").includes("❯"));
  } finally { current(); }
  assert.deepEqual(Object.getOwnPropertyDescriptor(CustomEditor.prototype, "render"), renderDescriptor);
  assert.deepEqual(Object.getOwnPropertyDescriptor(CustomEditor.prototype, "handleMouse"), mouseDescriptor);
  assert.ok(!input.render(20).join("").includes("❯"));
});
