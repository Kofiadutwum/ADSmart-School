export const EDGE_DEAD_ZONE = 24;

/** Embla `watchDrag`: let the phone's own edge gestures (back, app menus) win (spec §8.5). */
export function edgeSafeDrag(_api: unknown, event: MouseEvent | TouchEvent): boolean {
  const x = "touches" in event ? (event.touches[0]?.clientX ?? 0) : event.clientX;
  return x > EDGE_DEAD_ZONE && x < window.innerWidth - EDGE_DEAD_ZONE;
}
