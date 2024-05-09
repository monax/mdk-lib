import { type BackoffConfig, defaultBackoffConfig } from '../context/context.js';
import { sleep } from './sleep.js';

export async function retry<T>(body: () => Promise<T>, options: Partial<BackoffConfig> = {}): Promise<T> {
  const { maxRetries, timeoutMs, maxBackoffMs, backoffRate, jitterMs, baseBackoffMs } = {
    ...defaultBackoffConfig,
    ...options,
  };
  const startTime = Date.now();

  let lastError: Error | undefined;
  let attmpts = 0;
  let delay = baseBackoffMs;
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
