/** Box layout adapted from cc-my-pi / pi-claude-code-tui (MIT). See THIRD_PARTY_NOTICES.md. */
import { VERSION, type Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { center, formatCwd, formatModelLabel, headerColumnWidths, padRight } from "./render-utils.ts";
import { piMascotFrame, PI_MASCOT_FRAME_COUNT } from "./pi-mascot.ts";
import { loadedSummary, type LoadedStats } from "./resources.ts";

export type HeaderData = {
  cwd: string;
  model?: { id?: string; provider?: string };
  effort: string;
  stats?: LoadedStats;
  contextAvailable: boolean;
};

function border(left: string, label: string, right: string, width: number, paint: (s: string) => string): string {
  if (!label) return paint(left + "─".repeat(Math.max(0, width - 2)) + right);
  const prefix = "─── ";
  const tail = " ";
  const fill = Math.max(0, width - 2 - visibleWidth(prefix + label + tail));
  return paint(left + prefix) + label + paint(tail + "─".repeat(fill) + right);
}

export class PiStartupHeader implements Component {
  private frame = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private disposed = false;
  private readonly getData: () => HeaderData;
  private readonly getTheme: () => Theme;
  private readonly requestRender: () => void;

  constructor(getData: () => HeaderData, getTheme: () => Theme, requestRender: () => void, animate = true) {
    this.getData = getData;
    this.getTheme = getTheme;
    this.requestRender = requestRender;
    if (!animate) this.frame = PI_MASCOT_FRAME_COUNT - 1;
    else {
      this.timer = setInterval(() => {
        if (this.disposed) return;
        this.frame++;
        if (this.frame >= PI_MASCOT_FRAME_COUNT - 1) this.stopAnimation();
        this.requestRender();
      }, 120);
      this.timer.unref?.();
    }
  }

  render(width: number): string[] {
    if (width <= 0) return [];
    const theme = this.getTheme();
    const paint = (s: string) => theme.fg("accent", s);
    const muted = (s: string) => theme.fg("muted", s);
    const dim = (s: string) => theme.fg("dim", s);
    if (width < 24) return [truncateToWidth(paint(`Pi v${VERSION}`), width, "")];
    const data = this.getData();
    const { leftWidth, rightWidth, useRight } = headerColumnWidths(width - 2);
    const left = [
      center(theme.bold("pi-cc-extensions"), leftWidth),
      ...piMascotFrame(this.frame, { accent: paint, muted }).map(line => center(line, leftWidth)),
      center(muted(`${formatModelLabel(data.model)} · ${data.effort} effort`), leftWidth),
      center(dim(formatCwd(data.cwd)), leftWidth),
    ];
    const summary = data.stats ? loadedSummary(data.stats) : ["Resources unavailable", ""];
    const right = [
      paint(theme.bold("Getting started")),
      muted("Run /ccstyle or /ccpatches to configure the look"),
      paint("─".repeat(Math.max(8, Math.min(rightWidth, 16)))),
      paint(theme.bold("Loaded")),
      muted(summary[0]),
      muted(summary[1]),
      dim(`/loaded for details${data.contextAvailable ? " · /context to view current context" : ""}`),
    ];
    const lines = [border("╭", `${paint("Pi")} ${dim(`v${VERSION}`)}`, "╮", width, paint)];
    for (let i = 0; i < left.length; i++) {
      const content = useRight
        ? `${padRight(left[i], leftWidth)} ${paint("│")} ${padRight(right[i], rightWidth, "…")}`
        : padRight(left[i], leftWidth);
      lines.push(`${paint("│")}${content}${paint("│")}`);
    }
    lines.push(border("╰", "", "╯", width, paint));
    return lines.map(line => truncateToWidth(line, width, ""));
  }

  invalidate(): void {}
  private stopAnimation(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
  dispose(): void {
    this.disposed = true;
    this.stopAnimation();
  }
}
