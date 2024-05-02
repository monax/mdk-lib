# Decorators

## Class Decorators

Currently we only have `@coreTelemetry` available as a class decorator. This
applies a set of common decorators to the non-static member functions of the
class.

`@coreTelemetry` is implemented as a `Proxy<>` wrapping the decorated class which injects the decorated functions on first `new()`.

The current set of decorators included in `@coreTelemetry` are:

- `@log`
- `@logExceptions`
- `@counter`
- `@callTimer`
- `@telemetry`

## Member Decorators

### Log

#### `@log`

Records entry/exit to the function to the console when environment `LOG_LEVEL` is higher than specified (default: `trace`).

#### `@logParams`

Outputs to console the parameters specified by name. Note that for `@logParams` to function properly it MUST be the innermost decorator applied.

Optionally, a `LogParamOpts` may be passed which also allows specification of `LOG_LEVEL`.

#### `@logResult`

Outputs to console the result of the function. Results to be output are specified as JSONPath specifiers.

Optionall, a `LogResultOpts` may be passed which also allows specification of `LOG_LEVEL`.

#### `@logExceptions`

Outputs to console any exceptions encountered during execution. Optionally a `LOG_LEVEL` may be passed (default: `debug`).

### Metrics

The Metrics decorators interact with `MetricService.defaultMetrics` to provide a Prometheus-compatible performance endpoint. Should a runtime wish to expose metrics it must also call `MetricsService.initDefaultMetrics()`.

#### `@counter`

Records hits against a class member.

#### `@dataCounter`

In its basic form, records the sum of the result specified as a JSONPath.

In its more advanced form the following options are available:

- Sourcing from `parameter` or `result`
- Alternative reducers (sum, min, max, etc) by name, or a custom reducer function of the form `(vals: number[]) => number`
- Custom metric name & description
- Custom label & JSONPath value source

#### `@histogram`

As `@dataCounter`, but recording the result in a histogram. A custom bucket set or bucket generator config may be specified.

#### `@callTimer`

Records the start/completion time (including Promise resolve) for a method call as a histogram.

### Telemetry

The `@telemetry` decorator will interact with `Telemetry.defaultTelemetry` to:

- Add breadcrumbs on function entry
- Capture, record & rethrow exceptions encountered during function execution
