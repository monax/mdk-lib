import type { Querier } from 'mdk-db';
import { coreTelemetry } from 'mdk-telemetry';
import * as q from '../queries/lock.types.js';

export type ILocksRepo = InstanceType<typeof LocksRepo>;
export type LocksFrame = { locks: ILocksRepo };

@coreTelemetry
export class LocksRepo {
  constructor(private readonly querier: Querier) {}

  async createLock({ namespace, lockName }: { namespace: string; lockName: string }): Promise<void> {
    const fullLockName = `${namespace}.${lockName}`;
    await q.createLock.run({ lockName: fullLockName }, this.querier);
  }
}
