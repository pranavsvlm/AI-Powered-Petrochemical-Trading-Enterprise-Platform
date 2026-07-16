import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { getPrismaClient, type TenantScopedPrismaClient } from '@platform/database';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: TenantScopedPrismaClient = getPrismaClient();

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
