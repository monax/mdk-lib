import { Analytics } from '@segment/analytics-node';
import type { AnalyticsContext, ConfigBag, IAnalyticsEvent, IdentityOptions } from 'mdk-schema';
import { zod as z } from 'mdk-schema';
import { coreTelemetry } from 'mdk-telemetry';

export type AnalyticsConfig = ConfigBag<typeof AnalyticsConfigBag>;
export const AnalyticsConfigBag = {
  SEGMENT_ANALYTICS_API_KEY_BACKEND: z.string().optional(),
} as const;

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
