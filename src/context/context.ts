import EventEmitter from 'events';

export const defaultBackoffConfig = {
  // The minimum pause when backoff() is awaited
  baseBackoffMs: 100,
  // The maximum pause when backoff() is awaited
  maxBackoffMs: 30_000,
  // Maximum number of consecutive errors before failing
  maxRetries: Infinity,
  // The exponent of the backoff
  backoffRate: 1.2,
  // Maximum amount of jitter to add to backoff
  jitterMs: 15,
  // Amount of time to wait before cancelling
  timeoutMs: Infinity,
};

export type BackoffConfig = typeof defaultBackoffConfig;

export type AnyContext = Context | ContextWithCancel;

export function isContext(ctx: AnyContext): ctx is Context {
  return (ctx as Context)._isContext === IsContext;
}

export type ContextWithCancel = { ctx: Context; cancel: (reason?: string) => void };

const IsContext: unique symbol = Symbol('IsContext');

const Cancelled: unique symbol = Symbol('Cancelled');

const ALongTimeMs = 1 << 30;

export type Cancellation = {
  path: string;
  // The path to the Context on which cancel was called directly
  cancelledPath: string;
  reason?: string;
  lastErr: unknown;
  __cancelled: typeof Cancelled;
};

export type CancelledContext = Omit<Context, 'cancellation'> & { cancellation: Cancellation };

type Timeout = ReturnType<typeof setTimeout>;

// Context allows the outermost caller to define cancellation and timeout conditions that will cancel child Contexts automatically
export class Context {
  public readonly backoffConfig: BackoffConfig;
  private _cancellation: Cancellation | void = undefined;
  private _retries = 0;
  private _backoffMs = 0;
  private _lastErr: unknown;
  private readonly eventEmitter: EventEmitter;
  private readonly cancelledPromise: Promise<Cancellation>;
  private timeout: Timeout | undefined;
  private keepalive: Timeout | undefined;
  protected _name?: string;

  public readonly _isContext = IsContext;

  static readonly background = new Context({}, 'Background');

  private static readonly cancelledEventName = 'cancelled';

  static cancelEverything(reason?: string): void {
    Context.background.cancel(reason);
  }

  static get(ctx: AnyContext): Context {
    if (isContext(ctx)) {
      return ctx;
    }
    return ctx.ctx;
  }

  // Create a new Context as a child of the background Context
  static new(name?: string, backoffConfig: Partial<BackoffConfig> = {}): ContextWithCancel {
    const ctx = new Context(backoffConfig, name, Context.background);
    return { ctx, cancel: ctx.cancel.bind(ctx) };
  }

  // Create a new child Context that will cancel when its parent does
  static from(anyParent: AnyContext, name?: string, backoffConfig: Partial<BackoffConfig> = {}): ContextWithCancel {
    const parent = Context.get(anyParent);
    const ctx = new Context({ ...parent.backoffConfig, ...backoffConfig }, name, parent);
    return { ctx, cancel: ctx.cancel.bind(ctx) };
  }

  // Run a function within the scope of a Context cancelling it on completion
  static async with<T>({ ctx, cancel }: ContextWithCancel, f: (ctx: Context) => Promise<T>): Promise<T> {
    return f(ctx).finally(cancel);
  }

  static isCancellation(ret: unknown): ret is Cancellation {
    return !!ret && typeof ret === 'object' && (ret as Cancellation).__cancelled === Cancelled;
  }

  static forProcess(name: string) {
    const { ctx, cancel } = Context.new(name);

    function shutdown(signal?: string): void {
      cancel(signal ? `${signal} received, cancelling root context...` : `${name} shutting down`);
    }

    ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach((k) => process.on(k, () => shutdown(k)));

    return { ctx, shutdown };
  }

  // Wrap don't extend - derived Context break the uniformity of this API and don't work well with the context wrapping
  private constructor(
    backoffConfig: Partial<BackoffConfig>,
    name?: string,
    private readonly parent?: Context,
  ) {
    this._name = name;
    this.backoffConfig = { ...defaultBackoffConfig, ...backoffConfig };
    this.eventEmitter = new EventEmitter();
    this.eventEmitter.setMaxListeners(Infinity);
    this.cancelledPromise = new Promise((resolve) => this.eventEmitter.on(Context.cancelledEventName, resolve));
    // There should be exactly one context with no parent - the background Context
    if (parent) {
      // Propagate cancellation event to child contexts
      parent.eventEmitter.on(Context.cancelledEventName, (c) => this._cancel(c));
    }
    this.reset();
  }

  isCancelled(): this is CancelledContext {
    return this.cancelled;
  }

  get cancellation(): Cancellation | void {
    return this._cancellation ? { ...this._cancellation } : undefined;
  }

  get cancelled(): boolean {
    return !!this._cancellation || Boolean(this.parent?.cancelled);
  }

  reset(): void {
    if (this.cancelled) return;
    this._backoffMs = this.backoffConfig.baseBackoffMs;
    this._retries = 0;
    this._lastErr = null;

    clearTimeout(this.timeout);
    if (this.backoffConfig.timeoutMs !== Infinity) {
      this.timeout = setTimeout(
        () => this._cancel(`[Context(${this.path})] timeout (${this.backoffConfig.timeoutMs}ms) exceeded`),
        this.backoffConfig.timeoutMs,
      );
      // Don't hold Node process open if timeout is set (unless wait() is called)
      this.timeout.unref();
    }
  }

  failure(err?: unknown): void {
    if (this.cancelled) return;
    const { maxBackoffMs, backoffRate, jitterMs, maxRetries } = this.backoffConfig;
    this._retries++;
    this._backoffMs = Math.min(maxBackoffMs, this._backoffMs * backoffRate) + jitterMs * Math.random();
    this._lastErr = err;
    if (this._retries >= maxRetries) {
      this._cancel(`[Context(${this.path})] maxRetries (${maxRetries}) exceeded`);
    }
  }

  async backoff(): Promise<void> {
    if (this.cancelled) return;
    return new Promise((resolve) => {
      const backoff = setTimeout(resolve, this._backoffMs);
      // Resolve early on cancellation
      this.cancelledPromise.then(() => {
        clearTimeout(backoff);
        resolve();
      });
    });
  }

  async wait(): Promise<Cancellation> {
    // Take a reference to hold the Node process open until the cancellation promise resolves to ensure any contingent
    // cleanup is run
    if (!this.keepalive) {
      this.keepalive = setInterval(() => null, ALongTimeMs);
    }
    const cancellation = await this.cancelledPromise;
    // Once cancelled, forever cancelled
    clearInterval(this.keepalive);
    return cancellation;
  }

  get name(): string {
    return this._name || '[anonymous]';
  }

  get retries(): number {
    return this._retries;
  }

  get path(): string {
    let path = this.name;
    let parent = this.parent;
    while (parent) {
      path = parent.name + '/' + path;
      parent = parent.parent;
    }
    return path;
  }

  // Effectively public because returned by static constructors but not callable so Contexts can be passed without
  // any risk of any inner scope cancelling and outer one
  private cancel(reason?: string): void {
    if (!this.cancelled) {
      this._cancel(reason);
    }
  }

  // Either passed a reason directly or a parent cancellation
  private _cancel(reason?: string | Cancellation): void {
    this._cancellation = Context.isCancellation(reason)
      ? { ...reason, path: this.path }
      : {
          path: this.path,
          cancelledPath: this.path,
          reason,
          lastErr: this._lastErr,
          __cancelled: Cancelled,
        };
    this.eventEmitter.emit(Context.cancelledEventName, this._cancellation);
    // Not strictly necessary since we unref this timer, but defensively clear it anyway
    clearTimeout(this.timeout);
  }
}
