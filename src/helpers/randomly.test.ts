import { randomBytes } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { bernoulliTrial, chooseRandomElement } from './randomly.js';

describe('randomly,', () => {
  test('chooseRandomly', () => {
    chooseRandomElement(randomBytes(256));
    const choice2 = chooseRandomElement([1, 2, 3, 4, 5, 6]);
    expect(choice2).toBeTruthy();
    const choice3 = chooseRandomElement(['just me']);
    expect(choice3).toBe('just me');
  });

  test('bernoulliTrial', () => {
    let successes = 0;
    const trials = 100000;
    const numerator = 2;
    const denominator = 3;
    for (let i = 0; i < trials; i++) {
      if (bernoulliTrial(numerator, denominator)) {
        successes++;
      }
    }
    const error = Math.abs(successes / trials - numerator / denominator);
    // Lol, fudge...
    expect(error).toBeLessThan(0.01);

    expect(() => bernoulliTrial(0, 1)).toThrow();
    expect(() => bernoulliTrial(1, 0)).toThrow();
    expect(() => bernoulliTrial(3, 2)).toThrow();
    expect(() => bernoulliTrial(1.1, 2)).toThrow();
    expect(() => bernoulliTrial(1, 6.3)).toThrow();
  });

  test('Scaled percentage', () => {
    const p = 0.00312;
    for (let i = 0; i < 10000; i++) {
      bernoulliTrial(Math.round(p * 1e7), 1e9);
    }
  });

  test('Always', () => {
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      if (!bernoulliTrial(1, 1)) {
        throw new Error();
      }
    }
  });
});
