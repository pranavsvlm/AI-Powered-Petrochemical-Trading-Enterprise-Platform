import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiKeyService } from '@modules/extensibility';
import type { ApiKey } from '@platform/database';
import { PermissionAction, type JwtAccessTokenPayload } from '@platform/types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CreateApiKeyDto } from './dto/api-key.dto';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

/** Never send `keyHash` to the client — this is the only place an ApiKey row is serialized. */
function toSafeShape(apiKey: ApiKey) {
  return {
    id: apiKey.id,
    name: apiKey.name,
    keyPrefix: apiKey.keyPrefix,
    lastUsedAt: apiKey.lastUsedAt,
    revokedAt: apiKey.revokedAt,
    createdAt: apiKey.createdAt,
  };
}

@ApiTags('api-keys')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeyService) {}

  @RequirePermission('api-keys', PermissionAction.CREATE)
  @Post()
  async create(@Body() dto: CreateApiKeyDto, @Req() req: AuthedRequest) {
    const { apiKey, rawKey } = await this.apiKeys.create(
      req.user.companyId,
      req.user.sub,
      dto.name,
      req.user.sub,
      req.ip ?? null,
    );
    // The only time the raw secret is ever returned — never persisted, never re-displayed.
    return { ...toSafeShape(apiKey), key: rawKey };
  }

  @RequirePermission('api-keys', PermissionAction.VIEW)
  @Get()
  async list(@Req() req: AuthedRequest) {
    const keys = await this.apiKeys.list(req.user.companyId);
    return keys.map(toSafeShape);
  }

  @RequirePermission('api-keys', PermissionAction.DELETE)
  @Delete(':id')
  async revoke(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    const revoked = await this.apiKeys.revoke(id, req.user.companyId, req.user.sub, req.ip ?? null);
    return toSafeShape(revoked);
  }
}
