import express, { Express } from 'express';
import { Server } from 'http';
import type { MetricsConfig } from 'mdk-schema';
import { Telemetry } from 'mdk-telemetry';
import { Cancellation, Context } from '../context/context.js';

export type IMetricsService = InstanceType<typeof MetricsService>;

export class MetricsService {
  static async run(ctx: Context, config: MetricsConfig): Promise<Cancellation> {
    const metrics = new MetricsService(config);
    metrics.startServer();
    const cancellation = await ctx.wait();
    console.log('Metrics shutting down...');
    metrics.shutdown();
    return cancellation;
  }

  static runGlobal(config: MetricsConfig): void {
    MetricsService.run(Context.forProcess('Metrics service').ctx, config).catch(console.error);
  }

  constructor(private readonly config: MetricsConfig) {
    this.server = express();
  }

  readonly server: Express;
  private listener: Server | undefined;

  startServer() {
    this.listener = this.server.listen(
      this.config.METRICS_PORT ?? 9000,
      this.config.METRICS_LISTEN_ADDRESS ?? '0.0.0.0',
      () => {
        const address = this.listener?.address();
        const listenInfo = typeof address === 'string' ? address : `${address?.address}:${address?.port}`;
        console.log(`Metrics Listening on ${listenInfo}`);
      },
    );

    const telemetry = Telemetry.get();

    this.server.get('/metrics', async (req, res) => {
      try {
        res.set('Content-Type', telemetry.register.contentType);
        res.end(await telemetry.register.metrics());
      } catch (e) {
        res.status(500).end(e);
      }
    });
  }

  shutdown() {
    if (this.listener) {
      this.listener.closeAllConnections();
      this.listener.close(() => console.log('Metrics shut down'));
    }
  }
}
