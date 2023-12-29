export function isAtLeastOne<T>(arr: T[]): arr is [T, ...T[]] {
  return arr.length > 0;
}

export function priorsAndLast<T>(array: [T, ...T[]]): [T[], T] {
  const last = array[array.length - 1]; // The last element is guaranteed to exist
  const priors = array.slice(0, -1); // All elements except the last
  return [priors, last];
}

export function swapNonemptyTypeOrder<T>(array: [...T[], T]): [T, ...T[]] {
  if (!isAtLeastOne(array)) throw new Error("Impossible code path");

  return array; // This is safe because the type is guaranteed to be nonempty either way
}
