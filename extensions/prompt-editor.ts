import type { TuiMouseEvent, TuiMouseEventResult } from "@earendil-works/pi-tui";

type PromptEditor = {
  getText(): string;
  getPaddingX(): number;
  borderColor(text: string): string;
  renderedVisibleLineCount: number;
};
export type PromptEditorPrototype = {
  render(this: PromptEditor, width: number): string[];
  handleMouse(this: PromptEditor, event: TuiMouseEvent): TuiMouseEventResult | undefined;
};
const KEY = Symbol.for("pi.cc-extension-patches.prompt-editor");

/** Reserve the prompt columns in native layout, keeping wrapping, cursor and mouse coordinates in sync. */
export function installPromptEditor(prototype: PromptEditorPrototype, color: (text: string) => string): () => void {
  const host = prototype as PromptEditorPrototype & { [KEY]?: { dispose(): void } };
  host[KEY]?.dispose();
  const renderDescriptor = Object.getOwnPropertyDescriptor(prototype, "render");
  const mouseDescriptor = Object.getOwnPropertyDescriptor(prototype, "handleMouse");
  const render = prototype.render;
  const mouse = prototype.handleMouse;
  const offsets = new WeakMap<PromptEditor, number>();
  let active = true;
  const installedRender: PromptEditorPrototype["render"] = function (width) {
    const innerWidth = width - 2;
    const padding = Math.min(this.getPaddingX(), Math.max(0, Math.floor((innerWidth - 1) / 2)));
    const layoutWidth = innerWidth - padding * 2 - (padding ? 0 : 1);
    // Native wrapping needs at least two columns for CJK/emoji; do not reduce it to one.
    const offset = active && layoutWidth >= 2 && !this.getText().trimStart().startsWith("!") ? 2 : 0;
    offsets.set(this, offset);
    const lines = render.call(this, width - offset);
    if (!offset) return lines;
    const bottom = this.renderedVisibleLineCount + 1;
    return lines.map((line, index) => {
      if (index === 0 || index === bottom) return line + this.borderColor("──");
      return (index === 1 ? color("❯ ") : "  ") + line;
    });
  };
  const installedMouse: PromptEditorPrototype["handleMouse"] = function (event) {
    const offset = active ? (offsets.get(this) ?? 0) : 0;
    return mouse.call(this, offset ? { ...event, x: Math.max(0, event.x - offset), width: Math.max(1, event.width - offset) } : event);
  };
  const owner = { dispose() {
    active = false;
    if (prototype.render === installedRender) {
      if (renderDescriptor) Object.defineProperty(prototype, "render", renderDescriptor);
      else delete (prototype as Partial<PromptEditorPrototype>).render;
    }
    if (prototype.handleMouse === installedMouse) {
      if (mouseDescriptor) Object.defineProperty(prototype, "handleMouse", mouseDescriptor);
      else delete (prototype as Partial<PromptEditorPrototype>).handleMouse;
    }
    if (host[KEY] === owner) delete host[KEY];
  } };
  prototype.render = installedRender;
  prototype.handleMouse = installedMouse;
  host[KEY] = owner;
  return () => owner.dispose();
}
