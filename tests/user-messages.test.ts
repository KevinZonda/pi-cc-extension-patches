import assert from "node:assert/strict";
import test from "node:test";
import { initTheme, UserMessageComponent } from "@earendil-works/pi-coding-agent";
import { Markdown } from "@earendil-works/pi-tui";
import { installCompactUserMessages, type MessagePrototype } from "../extensions/user-messages.ts";

initTheme("dark");
const prototype = UserMessageComponent.prototype as unknown as MessagePrototype;
const start = "\x1b]133;A\x07";
const end = "\x1b]133;B\x07\x1b]133;C\x07";

function removeZones(lines: string[]): string[] {
  return lines.map(line => line.replaceAll(start, "").replaceAll(end, ""));
}

test("Hi becomes one line with identical background and horizontal padding, including OSC copy zones", t => {
  const message = new UserMessageComponent("Hi");
  const native = message.render(40);
  assert.equal(native.length, 3);
  const dispose = installCompactUserMessages(prototype);
  t.after(dispose);
  const compact = message.render(40);
  assert.deepEqual(compact, [start + native[1] + end]);
  assert.ok(compact[0].startsWith(start));
  assert.ok(compact[0].endsWith(end));
  assert.equal((message.children[0] as any).paddingY, 1);
  assert.equal(Object.hasOwn(message.children[0] as object, "render"), false);
  assert.deepEqual(message.render(40), compact, "native caches stay safe across repeated renders");
  dispose();
  assert.deepEqual(message.render(40), native, "disabling restores padding even for existing instances");
});

test("multiline messages, paragraph gaps, code blocks and wrapping preserve exact native content", t => {
  const inputs = ["one\n\ntwo", "```text\nfirst\n\nthird\n```", "長い中文消息用于验证窄窗口的换行。".repeat(4), "![image](attachment.png)\n\nAttached image paths:\n- /tmp/example.png"];
  const messages = inputs.map(text => new UserMessageComponent(text));
  const native = messages.map(message => removeZones(message.render(24)));
  const widerNative = messages.map(message => {
    message.setOutputPad(3);
    const lines = removeZones(message.render(31));
    message.setOutputPad(1);
    return lines;
  });
  const dispose = installCompactUserMessages(prototype);
  t.after(dispose);
  messages.forEach((message, index) => {
    const lines = message.render(24);
    assert.deepEqual(removeZones(lines), native[index].slice(1, -1));
    assert.ok(lines[0].startsWith(start));
    assert.ok(lines.at(-1)!.endsWith(end));
    message.setOutputPad(3);
    assert.deepEqual(removeZones(message.render(31)), widerNative[index].slice(1, -1));
  });
});

test("empty user messages remain empty", t => {
  const dispose = installCompactUserMessages(prototype);
  t.after(dispose);
  assert.deepEqual(new UserMessageComponent("").render(40), []);
  assert.deepEqual(new UserMessageComponent("  \n").render(40), []);
});

test("image protocol lines are kept verbatim inside the padding rows", t => {
  const message = new UserMessageComponent("image");
  const markdown = message.children[0] as Markdown;
  const image = "\x1b_Ga=T,f=100;AAAA\x1b\\";
  markdown.render = () => ["padding", image, "padding"];
  const dispose = installCompactUserMessages(prototype);
  t.after(dispose);
  assert.deepEqual(removeZones(message.render(40)), [image]);
  assert.deepEqual(markdown.render(40), ["padding", image, "padding"]);
});

test("a render error restores every temporary child method", t => {
  const message = new UserMessageComponent("Hi");
  const child = message.children[0] as Markdown;
  const render = () => { throw new Error("render failed"); };
  child.render = render;
  const dispose = installCompactUserMessages(prototype);
  t.after(dispose);
  assert.throws(() => message.render(40), /render failed/);
  assert.equal(child.render, render);
  assert.equal((child as any).paddingY, 1);
});

test("reload replaces the old wrapper and stale disposal does not remove the new owner", () => {
  const original = prototype.render;
  const oldDispose = installCompactUserMessages(prototype);
  const newDispose = installCompactUserMessages(prototype);
  oldDispose();
  assert.equal(new UserMessageComponent("Hi").render(40).length, 1);
  newDispose();
  assert.equal(prototype.render, original);
  assert.equal(new UserMessageComponent("Hi").render(40).length, 3);
});
