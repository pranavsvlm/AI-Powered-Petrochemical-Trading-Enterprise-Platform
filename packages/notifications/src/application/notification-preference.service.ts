import { getPrismaClient, type TenantScopedPrismaClient } from '@platform/database';

export interface UpsertPreferenceInput {
  userId: string;
  channels?: string[];
  quietHoursStart?: string;
  quietHoursEnd?: string;
  language?: string;
  digestFrequency?: 'IMMEDIATE' | 'HOURLY' | 'DAILY';
  categoryMutes?: string[];
}

export class NotificationPreferenceService {
  constructor(private readonly prisma: TenantScopedPrismaClient = getPrismaClient()) {}

  async get(userId: string) {
    return this.prisma.notificationPreference.findUnique({ where: { userId } });
  }

  async upsert(input: UpsertPreferenceInput) {
    return this.prisma.notificationPreference.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        channels: (input.channels ?? ['EMAIL', 'IN_APP']) as object,
        quietHoursStart: input.quietHoursStart,
        quietHoursEnd: input.quietHoursEnd,
        language: input.language ?? 'en',
        digestFrequency: input.digestFrequency ?? 'IMMEDIATE',
        categoryMutes: input.categoryMutes as object | undefined,
      },
      update: {
        channels: input.channels as object | undefined,
        quietHoursStart: input.quietHoursStart,
        quietHoursEnd: input.quietHoursEnd,
        language: input.language,
        digestFrequency: input.digestFrequency,
        categoryMutes: input.categoryMutes as object | undefined,
      },
    });
  }

  /** True if `at` (HH:mm, local to the user) falls inside the user's configured quiet hours. */
  static isWithinQuietHours(start: string | null, end: string | null, at: string): boolean {
    if (!start || !end) return false;
    if (start <= end) return at >= start && at < end;
    // Wraps midnight, e.g. 22:00–06:00.
    return at >= start || at < end;
  }
}
