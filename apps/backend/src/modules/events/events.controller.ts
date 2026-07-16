import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { PermissionAction, type JwtAccessTokenPayload } from '@platform/types';
import { EventQueryService, EventReplayService } from '@platform/event-bus';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ReplayEventsDto, RetryDeadLetterDto } from './dto/event.dto';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

/**
 * REST API from doc 28. Permission-gated on the "events" module: View Events (VIEW),
 * Replay Events (EXECUTE_AI reused as "privileged operation" action is inappropriate — we
 * use MANAGE_SETTINGS for replay/dead-letter-retry since doc 28's specific permission names
 * (Replay Events, Manage Subscribers, Manage Brokers, View Metrics) have no dedicated
 * PermissionAction enum values yet; VIEW covers read endpoints, MANAGE_SETTINGS covers the
 * mutating/administrative ones).
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('events')
export class EventsController {
  private readonly queryService = new EventQueryService();
  private readonly replayService = new EventReplayService();

  @RequirePermission('events', PermissionAction.VIEW)
  @Get()
  list(
    @Query('eventType') eventType?: string,
    @Query('aggregateId') aggregateId?: string,
    @Query('correlationId') correlationId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.queryService.list({
      eventType,
      aggregateId,
      correlationId,
      status,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @RequirePermission('events', PermissionAction.VIEW)
  @Get('metrics')
  metrics() {
    return this.queryService.metrics();
  }

  @RequirePermission('events', PermissionAction.VIEW)
  @Get('dead-letter')
  deadLetter(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.queryService.deadLetter(
      limit ? Number(limit) : undefined,
      offset ? Number(offset) : undefined,
    );
  }

  @RequirePermission('events', PermissionAction.VIEW)
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.queryService.getById(id);
  }

  @RequirePermission('events', PermissionAction.MANAGE_SETTINGS)
  @Post('replay')
  replay(@Body() dto: ReplayEventsDto, @Req() req: AuthedRequest) {
    return this.replayService.replay(dto, req.user.sub);
  }

  @RequirePermission('events', PermissionAction.MANAGE_SETTINGS)
  @Post('dead-letter/retry')
  retryDeadLetter(@Body() dto: RetryDeadLetterDto) {
    return this.replayService.retryDeadLetter(dto.deadLetterId);
  }
}
