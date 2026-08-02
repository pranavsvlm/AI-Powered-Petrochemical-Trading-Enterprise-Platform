import { Controller, Get, Version, VERSION_NEUTRAL } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Stays reachable at bare `/`, unaffected by URI versioning — this predates Phase 8's
  // versioning rollout and any existing monitoring/health-check tooling hits it unversioned.
  @Version(VERSION_NEUTRAL)
  @Get()
  getHealth(): { status: string } {
    return this.appService.getHealth();
  }
}
