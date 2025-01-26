import type { AnalyticsConfig, AnalyticsContext, IAnalyticsEvent, IdentityOptions } from '@monaxlabs/mdk-schema';
import { Analytics } from '@segment/analytics-node';
import { coreTelemetry } from '../telemetry/core.js';

export type IAnalyticsService = InstanceType<typeof AnalyticsService>;

@coreTelemetry
export class AnalyticsService {
  protected readonly client: Analytics | null;

  constructor(protected readonly config: AnalyticsConfig) {
    this.client = config.SEGMENT_ANALYTICS_API_KEY_BACKEND
      ? new Analytics({ writeKey: config.SEGMENT_ANALYTICS_API_KEY_BACKEND })
      : null;
  }

  track(ctx: AnalyticsContext, event: IAnalyticsEvent): void {
    if (!this.client || !event) {
      return;
    }

    const identifier: IdentityOptions = ctx.user
      ? {
          userId: ctx.user.id,
        }
      : {
          anonymousId: ctx.anonymousId,
        };
    this.client.identify({ ...identifier, traits: { ...ctx.organisation } });

    this.client.track({
      ...identifier,
      event: event.name,
      properties: { ...event.properties },
    });
  }
}
