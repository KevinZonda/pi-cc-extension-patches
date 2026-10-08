import { Markdown } from "@earendil-works/pi-tui";

type MessageComponent = { children: unknown[] };
type MessageRender = (this: MessageComponent, width: number) => string[];
export type MessagePrototype = { render: MessageRender };
const PATCH_KEY = Symbol.for("pi.cc-extension-patches.compact-user-messages");
const COPY_ZONE_END = "\x1b]133;B\x07\x1b]133;C\x07";

/** Remove only the padding added by native Markdown, before UserMessage attaches OSC copy zones. */
export function installCompactUserMessages(prototype: MessagePrototype): () => void {
  const host = prototype as MessagePrototype & { [PATCH_KEY]?: { dispose(): void } };
  host[PATCH_KEY]?.dispose();
  const original = prototype.render;
  let active = true;
  const installed: MessageRender = function (width) {
    if (!active) return original.call(this, width);
    const restore: Array<() => void> = [];
    try {
      for (const child of this.children) {
        if (!(child instanceof Markdown)) continue;
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
          else delete (child as unknown as { render?: unknown }).render;
        });
      }
      const lines = original.call(this, width);
      // Native closes the copy zone before the bottom padding row. Without that
      // row, close it after the final content line instead (also fixes one-line ordering).
      const last = lines.length - 1;
      if (last >= 0 && lines[last].startsWith(COPY_ZONE_END)) {
        const result = [...lines];
        result[last] = result[last].slice(COPY_ZONE_END.length) + COPY_ZONE_END;
        return result;
      }
      return lines;
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
