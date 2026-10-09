/** Spring presets (spec §8.6). */
export const springs = {
  snappy: { type: "spring", stiffness: 400, damping: 30 },
  gentle: { type: "spring", stiffness: 170, damping: 22 },
  swing: { type: "spring", stiffness: 120, damping: 8 },
} as const;

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
