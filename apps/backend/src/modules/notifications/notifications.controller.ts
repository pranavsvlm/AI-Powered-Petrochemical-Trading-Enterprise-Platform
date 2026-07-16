import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { PermissionAction, type JwtAccessTokenPayload } from '@platform/types';
import { getPrismaClient } from '@platform/database';
import {
  ChannelAdapterRegistry,
  ConsoleEmailSenderAdapter,
  NotificationPreferenceService,
  NotificationService,
  SmtpEmailSenderAdapter,
} from '@platform/notifications';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CreateNotificationDto,
  TestNotificationDto,
  UpdatePreferenceDto,
} from './dto/notification.dto';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

const prisma = getPrismaClient();
const emailAdapter =
  process.env.NOTIFICATIONS_EMAIL_ADAPTER === 'smtp'
    ? new SmtpEmailSenderAdapter()
    : new ConsoleEmailSenderAdapter();
const registry = new ChannelAdapterRegistry(emailAdapter);
const notificationService = new NotificationService(registry, prisma);
const preferenceService = new NotificationPreferenceService(prisma);

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('notifications')
export class NotificationsController {
  @RequirePermission('notifications', PermissionAction.VIEW)
  @Get()
  list(@Req() req: AuthedRequest, @Query('unreadOnly') unreadOnly?: string) {
    return notificationService.list(req.user.sub, unreadOnly === 'true');
  }

  @RequirePermission('notifications', PermissionAction.CREATE)
  @Post()
  create(@Body() dto: CreateNotificationDto, @Req() req: AuthedRequest) {
    return notificationService.send({
      companyId: req.user.companyId,
      recipientUserId: dto.recipientUserId,
      recipientEmail: dto.recipientEmail,
      title: dto.title,
      body: dto.body,
      category: dto.category,
      priority: dto.priority as never,
      channels: dto.channels as never,
      data: dto.data,
    });
  }

  @RequirePermission('notifications', PermissionAction.EDIT)
  @Put(':id/read')
  markRead(@Param('id', ParseUUIDPipe) id: string) {
    return notificationService.markRead(id);
  }

  @RequirePermission('notifications', PermissionAction.MANAGE_SETTINGS)
  @Put('preferences')
  updatePreferences(@Body() dto: UpdatePreferenceDto, @Req() req: AuthedRequest) {
    return preferenceService.upsert({ userId: req.user.sub, ...dto });
  }

  @RequirePermission('notifications', PermissionAction.VIEW)
  @Get('history')
  history(@Req() req: AuthedRequest) {
    return notificationService.history(req.user.companyId);
  }

  @RequirePermission('notifications', PermissionAction.MANAGE_SETTINGS)
  @Post('test')
  test(@Body() dto: TestNotificationDto, @Req() req: AuthedRequest) {
    return notificationService.send({
      companyId: req.user.companyId,
      recipientUserId: dto.recipientUserId,
      recipientEmail: dto.recipientEmail,
      title: 'Test notification',
      body: 'This is a test notification from the Notification Center.',
      category: 'TEST',
      channels: ['EMAIL', 'IN_APP'],
    });
  }
}
