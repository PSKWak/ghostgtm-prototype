// Wilson score interval: honest for small n and for rates near 0 or 1, where the
// normal approximation produces intervals outside [0, 1].
const Z95 = 1.96;

export function wilson(k: number, n: number, z = Z95): [number, number] | undefined {
  if (n <= 0) return undefined;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

// Two rates differ only when their 95% intervals don't overlap (CLAUDE.md, Experiments).
export function intervalsOverlap(a: [number, number], b: [number, number]): boolean {
  return a[0] <= b[1] && b[0] <= a[1];
}
