import { randomBytes } from 'node:crypto';

export type IntLike = number | bigint;

export function chooseRandomElement<T>(items: Iterable<T>): T {
  const arr = Array.from(items);
  return arr[Number(chooseRandomIndex(arr.length))];
}

// Given a rational probability of trial success p = numerator / denominator, output a strong pseudo-random boolean
// of the success of such a trial
export function bernoulliTrial(numerator: IntLike, denominator: IntLike): boolean {
  const n = assertPositiveInteger(numerator);
  const d = assertPositiveInteger(denominator);
  if (n > d) {
    throw new Error(`Numerator ${n} cannot be greater than denominator ${d}`);
  }
  return chooseRandomIndex(d) < n;
}

// The largest number representable by an unsigned integer of bytesNeeded width is sup - 1
const supUint64 = 1n << 64n;

// Choose one of n elements with uniform probability returning the 0-based index of the chosen element
export function chooseRandomIndex(i: IntLike): bigint {
  const n = assertPositiveInteger(i);
  if (n === 1n) return 0n;
  // Exclude numbers failing outside an even multiple of runs of n elements
  const residue = supUint64 % n;
  // Everything less than cap is within an even multiple of n therefore equally likely to be chosen
  const cap = supUint64 - residue;
  let index = 0n;
  // Rejection sample to avoid modulo bias
  do {
    index = sampleUint64();
  } while (index >= cap);
  return index % n;
}

function sampleUint64(): bigint {
  return randomBytes(8).readBigUInt64BE();
}

function assertPositiveInteger(x: IntLike): bigint {
  if (x <= 0) {
    throw new Error(`Expected positive integer, got ${x}`);
  }
  if (typeof x === 'number' && Math.trunc(x) !== x) {
    throw new Error(`Expected integer, got ${x}`);
  }
  return BigInt(x);
}
