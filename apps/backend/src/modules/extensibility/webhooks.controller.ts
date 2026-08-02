import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { WebhookService } from '@modules/extensibility';
import { PermissionAction, type JwtAccessTokenPayload } from '@platform/types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CreateWebhookDto } from './dto/webhook.dto';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

/** Never send `secret` to the client after creation — the signing secret stays server-side. */
function toSafeShape<T extends { secret: string }>(webhook: T) {
  const { secret: _secret, ...safe } = webhook;
  return safe;
}

@ApiTags('webhooks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhookService) {}

  @RequirePermission('webhooks', PermissionAction.CREATE)
  @Post()
  async create(@Body() dto: CreateWebhookDto, @Req() req: AuthedRequest) {
    const webhook = await this.webhooks.create(
      req.user.companyId,
      dto.url,
      dto.eventTypes,
      req.user.sub,
      req.ip ?? null,
    );
    return toSafeShape(webhook);
  }

  @RequirePermission('webhooks', PermissionAction.VIEW)
  @Get()
  async list(@Req() req: AuthedRequest) {
    const webhooks = await this.webhooks.list(req.user.companyId);
    return webhooks.map(toSafeShape);
  }

  @RequirePermission('webhooks', PermissionAction.VIEW)
  @Get(':id/deliveries')
  listDeliveries(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.webhooks.listDeliveries(req.user.companyId, id);
  }

  @RequirePermission('webhooks', PermissionAction.CREATE)
  @Post('test')
  test(@Body('webhookId', ParseUUIDPipe) webhookId: string, @Req() req: AuthedRequest) {
    return this.webhooks.test(req.user.companyId, webhookId, req.user.sub);
  }
}
