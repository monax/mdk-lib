import { JSONPath } from 'jsonpath-plus';
import type { AnyClass, AnyFunction } from './common.js';
import { type BucketConfig, Telemetry } from './telemetry.js';

// ---- Namespace ---

let namespace = 'app';

export function setNamespace(ns: string) {
  namespace = ns;
}

// ---- Standard simple aggregators ---

type Reducer = (vals: number[]) => number;

export function sum(vals: number[]) {
  return vals.reduce((v, c) => c + v, 0);
}
export function min(vals: number[]) {
  return Math.min(...vals);
}
export function max(vals: number[]) {
  return Math.max(...vals);
}
export function avg(vals: number[]) {
  return sum(vals) / count(vals);
}
export function count(vals: number[]) {
  return vals.length;
}
export function first(vals: number[]) {
  return vals[0];
}
export function last(vals: number[]) {
  return vals[vals.length - 1];
}
const stdReducers = {
  sum: sum,
  min: min,
  max: max,
  avg: avg,
  count: count,
  first: first,
  last: last,
} as const;

// --- Incrementer functions

// biome-ignore lint/suspicious/noExplicitAny: just any for now
type Incrementer = (name: string, help: string, json?: any, bucketConfig?: BucketConfig | number[]) => void;

const pathIncrementer =
  (path: string, reducer: Reducer, metricSetter: MetricSetter, labelPath?: string, labelName?: string): Incrementer =>
  (name, help, json, bucketConfig) => {
    const num = reducer(JSONPath({ path, json }).map((v: unknown) => Number(v)));
    const labels =
      labelName && labelPath
        ? Object.fromEntries([[labelName, String(JSONPath({ path: labelPath, json }))]])
        : undefined;
    if (Number.isNaN(num)) {
      console.log(`Result parsing for metric ${name} is NaN`);
    } else {
      metricSetter(name, help, num, labels, bucketConfig);
      // MetricsService.defaultMetrics?.incrCounter(name, help, num, labels);
    }
  };

type MetricSetter = (
  name: string,
  help: string,
  num: number,
  labels: Record<string, string> | undefined,
  bucketConfig: BucketConfig | number[] | undefined,
) => void;

// --- Option types

type DataCounterOpts = {
  path: string;
  source?: 'parameter' | 'result';
  reducer?: Reducer | keyof typeof stdReducers;
  metricName?: string;
  description?: string;
  labelPath?: string;
  labelName?: string;
};

type Prettify<T> = {
  [K in keyof T]: T[K];
} & unknown;

type HistogramOpts = Prettify<
  DataCounterOpts & {
    bucketConfig?: BucketConfig | number[];
  }
>;

const isHistogramOpts = (val: DataCounterOpts | HistogramOpts): val is HistogramOpts => {
  return Object.keys(val).includes('bucketConfig');
};

// --- Actual decorators

/**
 * Basic method hit counter.
 * @param metricName Name of the counter
 * @param description Help text for this metric
 */
export function counter(metricName?: string, description?: string) {
  const hitCounter: Incrementer = (name, help) => Telemetry.get().incrCounter(name, help, 1);
  return function counter(originalMethod: AnyFunction, context: ClassMethodDecoratorContext) {
    return metricKernel(originalMethod, context, hitCounter, 'result', 'hits', metricName, description);
  };
}

/**
 * Creates a counter metric based upon the inner functions parameters or results.
 * @param path JSON-path from the inner functions result to be operated upon.
 */
export function dataCounter(path: string): unknown;

/**
 * Creates a counter metric based upon the inner functions parameters or results.
 * @param opts Detailed configuration options for the counter.
 */
export function dataCounter(opts: DataCounterOpts): unknown;

export function dataCounter(opts: string | DataCounterOpts) {
  return applyResultMetric(opts, (name, help, num, labels) => {
    Telemetry.get().incrCounter(name, help, num, labels);
  });
}

/**
 * Creates a histogram metric from the inner functions result with default bucket sizes.
 * @param path JSON-path from the inner functions result to be operated upon.
 */
export function histogram(path: string): unknown;

/**
 * Creates a histogram metric from the inner functions result with detailed configuration.
 * @param opts Detailed configuration options for the histogram.
 */
export function histogram(opts: HistogramOpts): unknown;
export function histogram(opts: string | HistogramOpts) {
  return applyResultMetric(opts, (name, help, num, labels, bucketConfig) => {
    Telemetry.get().obsHistogram(name, help, num, labels, bucketConfig);
  });
}

/** Creates a call timer metric */
export function callTimer() {
  return function callTimer(originalMethod: AnyFunction, context: ClassMethodDecoratorContext) {
    return function (this: AnyClass, ...args: unknown[]) {
      const start = Date.now();
      const result = originalMethod.apply(this, args);
      Promise.resolve(result).then(
        () => {
          const end = Date.now();
          try {
            Telemetry.get().obsHistogram(
              `${namespace}_calltiming`,
              `${namespace} call timings`,
              (end - start) / 1000,
              { class: this.constructor.name, method: String(context.name) },
              undefined,
            );
          } catch (ex) {
            console.log(`Exception in histogram for ${this.constructor.name}.${String(context.name)}`);
            console.log(ex);
          }
        },
        // biome-ignore lint/suspicious/noEmptyBlockStatements: todo
        () => {},
      );
      return result;
    };
  };
}

// -----

function applyResultMetric(opts: string | DataCounterOpts | HistogramOpts, metricSetter: MetricSetter) {
  const {
    path,
    reducer,
    metricName,
    description,
    labelPath,
    labelName,
    bucketConfig,
    source,
  }: DataCounterOpts & HistogramOpts =
    typeof opts === 'string'
      ? {
          path: opts,
          reducer: sum,
          metricName: undefined,
          description: undefined,
          labelPath: undefined,
          labelName: undefined,
          bucketConfig: undefined,
          source: 'result',
        }
      : {
          ...opts,
          reducer: typeof opts.reducer === 'string' ? stdReducers[opts.reducer] : opts.reducer || sum,
          bucketConfig: isHistogramOpts(opts) ? opts.bucketConfig : undefined,
          source: opts.source || 'result',
        };

  return (originalMethod: AnyFunction, context: ClassMethodDecoratorContext) =>
    metricKernel(
      originalMethod,
      context,
      pathIncrementer(path, reducer, metricSetter, labelPath, labelName),
      source,
      'total',
      metricName,
      description,
      bucketConfig,
    );
}

function metricKernel(
  originalMethod: AnyFunction,
  context: ClassMethodDecoratorContext,
  incrementer: Incrementer,
  source: 'result' | 'parameter',
  metricSuffix: string,
  metricName?: string,
  description?: string,
  bucketConfig?: BucketConfig | number[],
) {
  const methodName = String(context.name);

  return function (this: AnyClass, ...args: unknown[]) {
    const result = originalMethod.call(this, ...args);

    const name = metricName
      ? `${namespace}_${metricName}`
      : `${namespace}_${this.constructor.name}_${methodName}_${metricSuffix}`.toLowerCase();
    const help = description || `Counter for ${this.constructor.name}.${methodName}`;

    // Return values from most service functions are promises, so we'll await the result, otherwise the reducer
    // would operate on the promise not the returned value.
    Promise.resolve(result).then(
      (r: unknown) => {
        // We'll bury an exceptions while incrementing the counter so we dont interrupt normal program execution just
        // because the metrics failed.
        try {
          incrementer(name, help, source === 'parameter' ? args : r, bucketConfig);
        } catch (ex) {
          console.log(`Exception updating metric ${name}`);
          console.log(ex);
        }
      },
      // biome-ignore lint/suspicious/noEmptyBlockStatements: todo
      () => {},
    );

    return result;
  };
}
