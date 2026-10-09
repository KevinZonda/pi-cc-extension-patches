import { Markdown, stripTerminalSequences } from "@earendil-works/pi-tui";

type MessageComponent = { children: unknown[] };
type MessageRender = (this: MessageComponent, width: number) => string[];
export type MessagePrototype = { render: MessageRender };
const PATCH_KEY = Symbol.for("pi.cc-extension-patches.compact-user-messages");
const COPY_ZONE_START = "\x1b]133;A\x07";
const COPY_ZONE_END = "\x1b]133;B\x07\x1b]133;C\x07";

/** Decorate native Markdown output without changing message text or its cached render arrays. */
export function installCompactUserMessages(prototype: MessagePrototype, options: {
  compact?: boolean; prefix?: boolean; color?: (text: string) => string;
} = {}): () => void {
  const host = prototype as MessagePrototype & { [PATCH_KEY]?: { dispose(): void } };
  host[PATCH_KEY]?.dispose();
  const original = prototype.render;
  let active = true;
  const installed: MessageRender = function (width) {
    if (!active) return original.call(this, width);
    const restore: Array<() => void> = [];
    try {
      for (const child of this.children) {
        if (options.compact === false || !(child instanceof Markdown)) continue;
        // SAFETY: Pi 1.1.0 Markdown stores its constructor padding in this private numeric field.
        const padding = (child as unknown as { paddingY: number }).paddingY;
        if (!Number.isInteger(padding) || padding <= 0) continue;
        const descriptor = Object.getOwnPropertyDescriptor(child, "render");
        const render = child.render;
        // Keep native Markdown caches and padding values intact. Trim a fresh array only.
        child.render = function (childWidth) {
          const lines = render.call(this, childWidth);
          return lines.length >= padding * 2 ? lines.slice(padding, -padding) : lines;
        };
        restore.push(() => {
          if (descriptor) Object.defineProperty(child, "render", descriptor);
          else {
            // SAFETY: Without an own descriptor, render was inherited; remove only our temporary override.
            delete (child as unknown as { render?: unknown }).render;
          }
        });
      }
      const prefix = options.prefix === true && width >= 4;
      const lines = original.call(this, prefix ? width - 2 : width);
      // Native closes the copy zone before the bottom padding row. Without that
      // row, close it after the final content line instead (also fixes one-line ordering).
      const last = lines.length - 1;
      const result = [...lines];
      if (options.compact !== false && last >= 0 && result[last].startsWith(COPY_ZONE_END)) {
        result[last] = result[last].slice(COPY_ZONE_END.length) + COPY_ZONE_END;
      }
      if (!prefix) return result;
      const isImage = (line: string) => /\x1b(?:_G|\]1337;File=|Pq)/.test(line);
      const first = result.findIndex(line => !isImage(line) && stripTerminalSequences(line).trim());
      const start = result.findIndex(line => !isImage(line) && line.startsWith(COPY_ZONE_START));
      if (first >= 0 && start >= 0) {
        result[start] = result[start].slice(COPY_ZONE_START.length);
        result[first] = COPY_ZONE_START + result[first];
      }
      return result.map((line, index) => {
        if (isImage(line)) return line;
        const prompt = index === first ? "❯ " : "  ";
        // Place the decorative prompt before OSC copy-zone start, not in the message body.
        return (options.color?.(prompt) ?? prompt) + line;
      });
    } finally {
      for (const undo of restore.toReversed()) undo();
    }
  };
  const patch = {
    dispose() {
      active = false;
      if (prototype.render === installed) prototype.render = original;
      if (host[PATCH_KEY] === patch) delete host[PATCH_KEY];
    },
  };
  host[PATCH_KEY] = patch;
  prototype.render = installed;
  return () => patch.dispose();
}
