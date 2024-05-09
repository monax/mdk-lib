import { JSONPath } from 'jsonpath-plus';
import { LogLevel } from 'mdk-schema';
import { type AnyClass, type AnyFunction, logLevelMap } from './common.js';

// -----

type LogDetailOpts = { minLogLevel: LogLevel; paths: string[] };

// -----

let correlationIndex = 0;
const logLevelStr = LogLevel.parse(process.env.LOG_LEVEL || 'crit');
const logLevel = logLevelMap[logLevelStr];

// -----

/**
 * Logs a simple entry/exit message for the method
 * @param minLogLevel The log level this trace should be output at
 */
export function log(minLogLevel: LogLevel = 'trace') {
  return function log(originalMethod: AnyFunction, context: ClassMethodDecoratorContext) {
    return logLevel > logLevelMap[minLogLevel] ? originalMethod : logKernel(originalMethod, context, [], []);
  };
}

/**
 * Logs the parameters passed to a method.  Note that if logParams is used with named parameters it must be
 * innermost decorator as parameter names are lost during decoration.
 *
 * @param params The names of the parameters to be output.  If undefined all parameters are listed.
 */
export function logParams(...paths: string[]): unknown;

/**
 * Logs the parameters passed to a method.  Note that if logParams is used with named parameters it must be
 * innermost decorator as parameter names are lost during decoration.
 *
 * @param opts Detailed configuration options for the logger.
 */
export function logParams(opts: LogDetailOpts): unknown;

export function logParams(optsOrPaths: string | LogDetailOpts, ...paramsRest: string[]) {
  return (originalMethod: AnyFunction, context: ClassMethodDecoratorContext) => {
    const isOpts = typeof optsOrPaths !== 'string';
    const ll: LogLevel = isOpts ? optsOrPaths.minLogLevel : 'trace';
    const paramPaths = isOpts ? optsOrPaths.paths : [optsOrPaths, ...paramsRest];

    return logLevel > logLevelMap[ll] ? originalMethod : logKernel(originalMethod, context, paramPaths, []);
  };
}

/**
 * Logs the parameters passed to a method.  Note that if logParams is used with named parameters it must be
 * innermost decorator as parameter names are lost during decoration.
 *
 * @param params The names of the parameters to be output.  If undefined all parameters are listed.
 */
export function logResult(...paths: string[]): unknown;

/**
 * Logs the result of a method.  Note that if logParams is used with named parameters it must be
 * innermost decorator as parameter names are lost during decoration.
 *
 * @param opts Detailed configuration options for the logger.
 */
export function logResult(opts: LogDetailOpts): unknown;

export function logResult(optsOrPaths?: string | LogDetailOpts, ...pathsRest: string[]) {
  return (originalMethod: AnyFunction, context: ClassMethodDecoratorContext) => {
    const isOpts = typeof optsOrPaths !== 'string';
    const ll: LogLevel = isOpts && optsOrPaths ? optsOrPaths.minLogLevel : 'trace';
    const paths = !optsOrPaths ? ['$'] : isOpts ? optsOrPaths.paths : [optsOrPaths, ...pathsRest];

    return logLevel > logLevelMap[ll] ? originalMethod : logKernel(originalMethod, context, [], paths);
  };
}

/**
 * Logs & rethrows exceptions encoutered during a method call.
 * @param minLogLevel
 * @returns
 */
export function logExceptions(minLogLevel: LogLevel = 'debug') {
  return function logExceptions(originalMethod: AnyFunction, context: ClassMethodDecoratorContext) {
    return logLevel > logLevelMap[minLogLevel]
      ? originalMethod
      : // biome-ignore lint/suspicious/noExplicitAny: just any
        function (this: AnyClass, ...args: any[]) {
          try {
            return originalMethod.apply(this, args);
          } catch (e) {
            console.error(`Exception in ${this.constructor.name}.${String(context.name)}`);
            console.log(JSON.stringify(e, null, 2));
            throw e;
          }
        };
  };
}

// -----

function logKernel(
  originalMethod: AnyFunction,
  context: ClassMethodDecoratorContext,
  paramsPaths: string[],
  resultsPaths: string[],
) {
  const methodName = String(context.name);

  // biome-ignore lint/suspicious/noExplicitAny: just any
  return function (this: AnyClass, ...args: any[]) {
    // Set up a console log helper function
    correlationIndex++;
    const ci = correlationIndex;
    const log = (msg: string) => console.log(`LOG [${ci}]: ${msg}`);
    const name = this ? this.constructor.name : 'Unknown';

    log(`Entering method ${name}.${methodName}`);

    // Print param matches
    for (const path of paramsPaths) {
      log(`${path}: \n${JSON.stringify(JSONPath({ path, json: args }), null, 2)}`);
    }

    // Actually run the method
    const result = originalMethod.apply(this, args);

    // Print any result matches
    Promise.all([result]).then(
      ([result]) => {
        for (const path of resultsPaths) {
          try {
            log(`${path}: \n${JSON.stringify(JSONPath({ path, json: result }), null, 2)}`);
          } catch (ex) {
            console.log(`Exception logging result for ${path}`);
            console.log(ex);
          }
        }
      },
      // biome-ignore lint/suspicious/noEmptyBlockStatements: todo
      () => {},
    );

    log(`Leaving method ${this.constructor.name}.${methodName}`);
    return result;
  };
}
