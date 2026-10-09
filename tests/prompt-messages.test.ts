import assert from "node:assert/strict";
import test from "node:test";
import { initTheme, UserMessageComponent } from "@earendil-works/pi-coding-agent";
import { Markdown, stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { installCompactUserMessages, type MessagePrototype } from "../extensions/user-messages.ts";

initTheme("dark");
// SAFETY: UserMessageComponent supplies children and render, as exercised by the native integration tests.
const prototype = UserMessageComponent.prototype as unknown as MessagePrototype;
const start = "\x1b]133;A\x07";
const end = "\x1b]133;B\x07\x1b]133;C\x07";

test("message prefix works independently of compact padding and keeps body, backgrounds and copy zones", () => {
  for (const compact of [true, false]) {
    const text = "one\n\ntwo";
    const message = new UserMessageComponent(text);
    const native = message.render(28).map(stripTerminalSequences);
    const dispose = installCompactUserMessages(prototype, { compact, prefix: true,
      color: value => `\x1b[48;5;235m${value}\x1b[49m` });
    try {
      const lines = message.render(30);
      const plain = lines.map(stripTerminalSequences);
      const baseline = compact ? native.slice(1, -1) : native;
      assert.deepEqual(plain.map(line => line.slice(2)), baseline);
      const first = plain.findIndex(line => line.startsWith("❯ "));
      assert.equal(first, compact ? 0 : 1);
      assert.ok(lines[first].indexOf("❯") < lines[first].indexOf(start));
      assert.equal(lines.join("").split(start).length - 1, 1);
      assert.equal(lines.join("").split(end).length - 1, 1);
      for (const line of lines) assert.equal(visibleWidth(line), 30);
      assert.equal((message as any).text, text);
      assert.equal((message.children[0] as any).paddingY, 1);
      assert.equal(Object.hasOwn(message.children[0] as object, "render"), false);
      assert.deepEqual(message.render(30), lines);
    } finally { dispose(); }
  }
});

test("code, wrapped CJK and attachment markers remain intact and empty messages get no prefix", t => {
  const dispose = installCompactUserMessages(prototype, { prefix: true });
  t.after(dispose);
  for (const text of ["```text\nfirst\n\nthird\n```", "中文消息用于验证窄窗口的换行。".repeat(3), "看看 [Image #1 (708x172)]"]) {
    const message = new UserMessageComponent(text);
    const lines = message.render(14);
    assert.equal(lines.join("").split("❯").length - 1, 1);
    for (const line of lines) assert.ok(visibleWidth(line) <= 14);
    assert.equal((message as any).text, text);
  }
  assert.deepEqual(new UserMessageComponent("").render(30), []);
  assert.deepEqual(new UserMessageComponent("  \n").render(30), []);
});

test("terminal image protocol lines stay byte-for-byte unchanged", t => {
  const message = new UserMessageComponent("image");
  const markdown = message.children[0] as Markdown;
  const image = "\x1b_Ga=T,f=100;AAAA\x1b\\";
  markdown.render = () => ["padding", image, "padding"];
  const dispose = installCompactUserMessages(prototype, { prefix: true });
  t.after(dispose);
  assert.deepEqual(message.render(30), [start + image + end]);
  assert.deepEqual(markdown.render(30), ["padding", image, "padding"]);
});
