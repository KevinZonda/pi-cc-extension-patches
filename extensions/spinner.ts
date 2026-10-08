// Frame sequence adapted from cc-my-pi (MIT). See THIRD_PARTY_NOTICES.md.
export const STAR_FRAMES: readonly string[] = ["·", "✢", "✳", "✶", "✻", "✽"];

export function spinnerFrames(color: (frame: string) => string): string[] {
  return [...STAR_FRAMES, ...STAR_FRAMES.toReversed()].map(color);
}
