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
import { JournalService } from '@modules/accounting';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PostJournalDto } from './dto/accounting.dto';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('journals')
export class JournalsController {
  constructor(private readonly journals: JournalService) {}

  @RequirePermission('accounting', PermissionAction.CREATE)
  @Post()
  post(@Body() dto: PostJournalDto, @Req() req: AuthedRequest) {
    return this.journals.post(
      { companyId: req.user.companyId, ...dto, journalDate: new Date(dto.journalDate) },
      req.user.sub,
      req.ip ?? null,
    );
  }

  @RequirePermission('accounting', PermissionAction.VIEW)
  @Get()
  list(@Req() req: AuthedRequest, @Query('sourceType') sourceType?: string) {
    return this.journals.list({ companyId: req.user.companyId, sourceType });
  }

  @RequirePermission('accounting', PermissionAction.VIEW)
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.journals.getById(id);
  }
}
