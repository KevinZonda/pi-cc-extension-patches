import { basename } from "node:path";

type Source = { name?: string; path?: string; sourceInfo?: { scope?: string; source?: string } };
export type ResourceSnapshot = {
  getSkills(): { skills: Source[] };
  getPrompts(): { prompts: Source[] };
  getExtensions(): { extensions: Source[] };
  getThemes(): { themes: Source[] };
};
export type Category = { global: string[]; project: string[] };
export type LoadedStats = Record<"skills" | "prompts" | "extensions" | "themes", Category>;

function bucket(items: Source[], extension = false): Category {
  const result: Category = { global: [], project: [] };
  for (const item of items) {
    const source = item.sourceInfo?.source;
    const label = extension
      ? source?.startsWith("npm:") ? source.slice(4) : basename(item.path ?? source ?? "extension")
      : item.name ?? basename(item.path ?? "resource");
    result[item.sourceInfo?.scope === "project" ? "project" : "global"].push(label);
  }
  return result;
}

/** Read the current session's loader; never reload or execute extension factories. */
export function collectLoadedStats(loader: ResourceSnapshot | undefined): LoadedStats | undefined {
  if (!loader) return undefined;
  return {
    skills: bucket(loader.getSkills().skills),
    prompts: bucket(loader.getPrompts().prompts),
    extensions: bucket(loader.getExtensions().extensions, true),
    themes: bucket(loader.getThemes().themes),
  };
}

export function loadedSummary(stats: LoadedStats): [string, string] {
  const keys = ["skills", "prompts", "extensions"] as const;
  return [
    keys.map(key => `${stats[key].global.length + stats[key].project.length} ${key}`).join(" · "),
    `${keys.reduce((sum, key) => sum + stats[key].global.length, 0)} global · ${keys.reduce((sum, key) => sum + stats[key].project.length, 0)} project`,
  ];
}

export function loadedDetails(stats: LoadedStats | undefined): string {
  if (!stats) return "Loaded resource details are unavailable until the TUI header is initialized.";
  return Object.entries(stats).map(([key, category]) => [
    `${key[0].toUpperCase()}${key.slice(1)} (${category.global.length + category.project.length} · ${category.global.length} global / ${category.project.length} project)`,
    ...(category.global.length ? [`  global: ${category.global.join(", ")}`] : []),
    ...(category.project.length ? [`  project: ${category.project.join(", ")}`] : []),
  ].join("\n")).join("\n\n");
}
