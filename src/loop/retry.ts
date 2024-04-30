import { sleep } from './sleep.js';

const defaultBackoffConfig = {
  /** The minimum pause when backoff() is awaited */
  baseBackoffMs: 100,
  /** The maximum pause when backoff() is awaited */
  maxBackoffMs: 30_000,
  /** Maximum number of consecutive errors before failing */
  maxRetries: Infinity,
  /** The exponent of the backoff */
  backoffRate: 1.2,
  /** Maximum amount of jitter to add to backoff */
  jitterMs: 15,
  /** Amount of time to wait before cancelling */
  timeoutMs: Infinity,
};

export type BackoffConfig = Partial<typeof defaultBackoffConfig>;

export async function retry<T>(body: () => Promise<T>, options: BackoffConfig = {}): Promise<T> {
  const { maxRetries, timeoutMs, maxBackoffMs, backoffRate, jitterMs, baseBackoffMs } = {
    ...defaultBackoffConfig,
    ...options,
  };
  const startTime = Date.now();

  let lastError: Error | undefined;
  let attmpts = 0;
  let delay = baseBackoffMs;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attmpts += 1;
    try {
      return await body();
    } catch (err) {
      lastError = err as Error;
    }

    if (Date.now() - startTime > timeoutMs) {
      throw lastError;
    }
    if (attmpts >= maxRetries) {
      throw lastError;
    }

    delay = Math.min(maxBackoffMs, delay * backoffRate) + jitterMs * Math.random();
    await sleep(delay);
  }
}
