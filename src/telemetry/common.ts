import { LogLevel } from 'mdk-schema';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyClass = new (...args: any) => any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyAbstractClass = abstract new (...args: any) => any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFunction = (...args: any[]) => any;

export const logLevelMap: Record<LogLevel, number> = {
  crit: 4,
  warn: 3,
  debug: 2,
  trace: 1,
};
