import type { Querier } from '../db/query';

export class BaseRepo {
  constructor(protected readonly querier: Querier) {
    // nothing to do here
  }

  protected async checkEmpty<T>(fn: Promise<T[]>, error?: string, debug = false): Promise<void> {
    await this.checkLen(fn, 0, error, debug);
  }

  protected async checkOne<T>(fn: Promise<T[]>, error?: string, debug = false): Promise<T> {
    try {
      const results = await fn;
      if (results.length === 1) return results[0];
      if (debug) console.error(`Expected 1 result, got ${results.length}`);
    } catch (e) {
      if (debug) console.error(e);
      if (!error) throw e instanceof Error ? e : new Error(`${e}`);
    }

    throw new Error(error);
  }

  protected async checkLen<T>(fn: Promise<T[]>, len: number, error?: string, debug = false): Promise<T[]> {
    try {
      const results = await fn;
      if (results.length === len) return results;
      if (debug) console.error(`Expected ${len} results, got ${results.length}`);
    } catch (e) {
      if (debug) console.error(e);
      if (!error) throw e instanceof Error ? e : new Error(`${e}`);
    }

    throw new Error(error);
  }
}
