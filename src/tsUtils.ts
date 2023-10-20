export function isAtLeastOne<T>(arr: T[]): arr is [T, ...T[]] {
  return arr.length > 0;
}
