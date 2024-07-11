import type { AnyAbstractClass, AnyClass } from './common.js';
import { log, logExceptions, logger } from './log.js';
import { callTimer, counter } from './metrics.js';
import { telemetry } from './telemetry.js';

// All the standard decorators
const decorators = [log(), logExceptions(), counter(), callTimer(), telemetry()] as const;

// Generates a runtime ClassMethodDecoratorContext; the data in not as reliable as the TS-generated contexts.
const createSyntheticMemberContext = (
  name: string,
  isPrivate: boolean,
  isStatic: false,
): ClassMethodDecoratorContext => ({
  kind: 'method',
  name,
  private: isPrivate,
  static: isStatic,
  addInitializer: () => {
    throw 'Not implemented';
  },
  // biome-ignore lint/suspicious/noExplicitAny: just any
  access: { has: (obj) => name in (obj as any), get: (obj) => (obj as any)[name] },
  metadata: {},
});

/**
 * coreTelemetry instruments a class with standard telemetry decorators applied to its instance members.  Update
 * `decorators` in coreTelemetry.ts to add or remove decorator factories.
 */
// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export function coreTelemetry(target: any, context: ClassDecoratorContext<AnyClass | AnyAbstractClass>) {
  if (process.env.VITEST) return target;

  if (!context || !context.name) {
    logger.warn(`Unable to configure coreTelemetry for ${target.name}`);
    return target;
  }

  logger.log(`Enabling Core Telemetry on ${context.name} (${decorators.map((d) => d.name).join(', ')})`);

  const decoPrefix = '__mnxcoret_';

  return new Proxy(target, {
    construct(target, argArray) {
      const t = new target(...argArray);

      if (!target.prototype[`${decoPrefix}coretdecorated`]) {
        const props = Object.getOwnPropertyNames(target.prototype);
        // biome-ignore lint/complexity/noForEach: todo
        props
          .filter((p) => p !== 'constructor')
          .filter((p) => typeof target.prototype[p] === 'function')
          .forEach((p) => {
            const member = target.prototype[p];
            target.prototype[p] = function (...args: unknown[]) {
              const context = createSyntheticMemberContext(p, false, false);
              return decorators.reduce((p, c) => c(p, context), member).apply(this, args);
            };
          });
        target.prototype[`${decoPrefix}coretdecorated`] = true;
      }
      return t;
    },
  });
}
