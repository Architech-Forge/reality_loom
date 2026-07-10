/** Geometry helpers for the layout engine — pure and allocation-light. */

export interface RLBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const intersects = (a: RLBounds, b: RLBounds, gap = 0): boolean =>
  a.x < b.x + b.width + gap &&
  a.x + a.width + gap > b.x &&
  a.y < b.y + b.height + gap &&
  a.y + a.height + gap > b.y;

export const containsPoint = (b: RLBounds, x: number, y: number): boolean =>
  x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;

export const within = (inner: RLBounds, outer: RLBounds): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

export const center = (b: RLBounds): { x: number; y: number } => ({
  x: b.x + b.width / 2,
  y: b.y + b.height / 2
});

export const centerDistance = (a: RLBounds, b: RLBounds): number => {
  const ca = center(a);
  const cb = center(b);
  return Math.hypot(ca.x - cb.x, ca.y - cb.y);
};

export const clampInto = (b: RLBounds, outer: RLBounds): RLBounds => ({
  x: Math.max(outer.x, Math.min(b.x, outer.x + outer.width - b.width)),
  y: Math.max(outer.y, Math.min(b.y, outer.y + outer.height - b.height)),
  width: b.width,
  height: b.height
});
