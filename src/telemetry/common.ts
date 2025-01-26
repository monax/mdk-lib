import type { LogLevel } from '@monaxlabs/mdk-schema';

// biome-ignore lint/suspicious/noExplicitAny: just any
export type AnyClass = new (..._args: any) => any;

// biome-ignore lint/suspicious/noExplicitAny: just any
export type AnyAbstractClass = abstract new (..._args: any) => any;

// biome-ignore lint/suspicious/noExplicitAny: just any
export type AnyFunction = (...args: any[]) => any;

export const logLevelMap: Record<LogLevel, number> = {
  crit: 4,
  warn: 3,
  debug: 2,
  trace: 1,
};
