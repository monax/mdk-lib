import { Breadcrumb, EventHint, getCurrentHub } from '@sentry/node';
import { type ConfigBag, LogLevel, getConfigBag, getEnv, node } from 'mdk-schema';
import { nanoid } from 'nanoid';
import { Counter, Histogram, Registry, collectDefaultMetrics, exponentialBuckets, linearBuckets } from 'prom-client';
import { z } from 'zod';
import { type AnyClass, type AnyFunction, logLevelMap } from './common.js';
import { logger } from './log.js';

const logLevelStr = LogLevel.parse(getEnv('LOG_LEVEL', 'crit'));
const logLevel = logLevelMap[logLevelStr];

/**
 * Applies Telemetry breadcrumbs and exception handlers to the class member via Telemetry.defaultTelemetry
 * @param message
 * @param minLogLevel
 */
export function telemetry(message = '', minLogLevel: LogLevel = 'debug') {
  return function telemetry(originalMethod: AnyFunction, context: ClassMethodDecoratorContext) {
    return logLevel > logLevelMap[minLogLevel]
      ? originalMethod
      : telemetryKernel(Telemetry.get(), message, originalMethod, context);
  };
}

function telemetryKernel(
  tel: Telemetry,
  message: string,
  originalMethod: AnyFunction,
  context: ClassMethodDecoratorContext,
  ...params: string[]
) {
  const methodName = String(context.name);

  // biome-ignore lint/suspicious/noExplicitAny: just any
  return function (this: AnyClass, ...args: any[]) {
    tel.addBreadcrumb({ type: `${this.constructor.name}.${methodName}`, message, data: { params } });

    try {
      return originalMethod.call(this, ...args);
    } catch (e) {
      tel.captureException(`Exception in ${this.constructor.name}.${methodName}`, {
        data: JSON.stringify(params),
        originalException: e,
      });
      throw e;
    }
  };
}

export type Output = 'logger' | 'sentry';

export type BucketConfig = {
  start: number;
  count: number;
} & (
  | {
      mode: 'linear';
      width: number;
    }
  | {
      mode: 'exponential';
      factor: number;
    }
);

export type TelemetryConfigBag = ConfigBag<typeof TelemetryConfigBag>;
export const TelemetryConfigBag = {
  ...node,
  SENTRY_DSN: z.string().optional(),
  TELEMETRY_OUTPUTS: z.array(z.union([z.literal('logger'), z.literal('sentry')])).optional(),
};

export { Breadcrumb, EventHint };

let _telemetry: Telemetry | undefined;

export class Telemetry {
  readonly register: Registry;

  private readonly outputs: Record<Output, boolean>;
  private readonly logger: (str: string) => void;
  private readonly counters: Record<string, Counter> = {};
  private readonly histograms: Record<string, Histogram> = {};
  private readonly instance: string = nanoid(8);

  // Telemetry is special, since it must be always available at module load time for decorators, so we implement it as a
  // global singleton
  static get(): Telemetry {
    if (!_telemetry) {
      _telemetry = new Telemetry(getConfigBag(TelemetryConfigBag));
    }
    return _telemetry;
  }

  private constructor({ SENTRY_DSN, TELEMETRY_OUTPUTS, NODE_ENV }: TelemetryConfigBag) {
    const outputs = TELEMETRY_OUTPUTS ?? (NODE_ENV === 'local' || !SENTRY_DSN) ? ['logger'] : ['logger', 'sentry'];
    this.outputs = outputs.reduce((acc, output) => ({ ...acc, [output]: true }), {} as Record<Output, boolean>);
    this.logger = logger.log;
    const register = new Registry();
    collectDefaultMetrics({ register, labels: { instance: this.instance } });
    this.register = register;
  }

  addBreadcrumb(breadcrumb: Breadcrumb): void {
    if (this.outputs.logger) {
      // this can be modified to increase or decrease the chatiness for local development
      const message = `${breadcrumb.category ?? 'Info'}: ${breadcrumb.message}, ${
        breadcrumb.data ? JSON.stringify(breadcrumb.data, null, 2) : ''
      }`;
      this.logger(message);
    }
    if (this.outputs.sentry) {
      const hub = getCurrentHub();
      hub.addBreadcrumb(breadcrumb);
    }
  }

  captureException(message: string, hint?: EventHint): void {
    const error = new Error(message);
    if (this.outputs.logger) {
      // this can be modified to increase or decrease the chatiness for local development
      this.logger(`ERROR: ${error.message}: ${error.stack}`);
    }
    if (this.outputs.sentry) {
      const hub = getCurrentHub();
      hub.captureException(error, hint);
    }
  }

  startTransaction(name: string): void {
    if (this.outputs.sentry) {
      const hub = getCurrentHub();
      hub.startTransaction({ name, trimEnd: true });
    }
  }

  endTransaction(): void {
    if (this.outputs.sentry) {
      const hub = getCurrentHub();
      const scope = hub.getScope();
      const tx = scope.getTransaction();
      tx?.finish();
    }
  }

  ensureCounter(name: string, help: string, labels: string[]): Counter {
    if (!this.counters[name]) {
      const counter = new Counter({ name, help, labelNames: ['instance', ...labels] });
      this.counters[name] = counter;
      this.register.registerMetric(counter);
      return counter;
    }

    return this.counters[name];
  }

  ensureHistogram(name: string, help: string, labels: string[], buckets?: BucketConfig | number[]): Histogram {
    if (!this.histograms[name]) {
      const defaultBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
      const b: number[] = !buckets ? defaultBuckets : Array.isArray(buckets) ? buckets : generateBuckets(buckets);

      const histogram = new Histogram({
        name,
        help,
        labelNames: ['instance', ...labels],
        buckets: b,
      });

      this.histograms[name] = histogram;
      this.register.registerMetric(histogram);

      return histogram;
    }

    return this.histograms[name];
  }

  incrCounter(name: string, help: string, value: number, labels?: Record<string, string>) {
    this.ensureCounter(name, help, labels ? Object.keys(labels) : [])
      .labels({ instance: this.instance, ...labels })
      .inc(value);
  }

  obsHistogram(
    name: string,
    help: string,
    value: number,
    labels?: Record<string, string>,
    buckets?: number[] | BucketConfig,
  ) {
    this.ensureHistogram(name, help, labels ? Object.keys(labels) : [], buckets)
      .labels({ instance: this.instance, ...labels })
      .observe(value);
  }
}

const generateBuckets = (config: BucketConfig): number[] => {
  return config.mode === 'exponential'
    ? exponentialBuckets(config.start, config.factor, config.count)
    : linearBuckets(config.start, config.width, config.count);
};
