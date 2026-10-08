import { readFileSync } from "node:fs";
import { DEFAULT_VERBS } from "./verbs.ts";

export type Config = {
  compactUserMessages: boolean;
  headerEnabled: boolean;
  spinnerEnabled: boolean;
  verbsEnabled: boolean;
  intervalMs: number;
  verbs: readonly string[];
};

export function normalizeConfig(raw: unknown): Config {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const customVerbs = Array.isArray(value.verbs)
    ? value.verbs.filter((word): word is string => typeof word === "string")
      .map(word => word.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim())
      .filter(word => word.length > 0 && word.length <= 80)
    : [];
  return {
    compactUserMessages: value.compactUserMessages !== false,
    headerEnabled: value.headerEnabled !== false,
    spinnerEnabled: value.spinnerEnabled !== false,
    verbsEnabled: value.verbsEnabled !== false,
    intervalMs: typeof value.intervalMs === "number" && Number.isFinite(value.intervalMs)
      ? Math.max(50, Math.min(2000, Math.round(value.intervalMs))) : 170,
    verbs: customVerbs.length ? customVerbs : DEFAULT_VERBS,
  };
}

export function loadConfig(path: string): { config: Config; warning?: string } {
  try {
    return { config: normalizeConfig(JSON.parse(readFileSync(path, "utf8"))) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { config: normalizeConfig({}) };
    return { config: normalizeConfig({}), warning: `Cannot read ${path}; using patch defaults.` };
  }
}
