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
import { RfqService, QuotationService } from '@modules/quotations';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  AddRfqLineItemDto,
  CreateQuotationDirectDto,
  CreateQuotationFromRfqDto,
  CreateRfqDto,
  DecideApprovalDto,
  RequestApprovalDto,
  ReviseQuotationDto,
} from './dto/quotation.dto';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('rfqs')
export class RfqController {
  constructor(private readonly rfqs: RfqService) {}

  @RequirePermission('quotations', PermissionAction.CREATE)
  @Post()
  create(@Body() dto: CreateRfqDto, @Req() req: AuthedRequest) {
    return this.rfqs.create(
      { companyId: req.user.companyId, createdByUserId: req.user.sub, ...dto },
      req.ip ?? null,
    );
  }

  @RequirePermission('quotations', PermissionAction.VIEW)
  @Get()
  list(
    @Req() req: AuthedRequest,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.rfqs.list({ companyId: req.user.companyId, status: status as never, customerId });
  }

  @RequirePermission('quotations', PermissionAction.VIEW)
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.rfqs.getById(id);
  }

  @RequirePermission('quotations', PermissionAction.EDIT)
  @Post(':id/submit')
  submit(@Param('id', ParseUUIDPipe) id: string) {
    return this.rfqs.submit(id);
  }

  @RequirePermission('quotations', PermissionAction.EDIT)
  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.rfqs.cancel(id);
  }

  @RequirePermission('quotations', PermissionAction.EDIT)
  @Post(':id/close')
  close(@Param('id', ParseUUIDPipe) id: string) {
    return this.rfqs.close(id);
  }

  @RequirePermission('quotations', PermissionAction.EDIT)
  @Post(':id/line-items')
  addLineItem(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddRfqLineItemDto) {
    return this.rfqs.addLineItem(id, dto);
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('quotations')
export class QuotationsController {
  constructor(private readonly quotations: QuotationService) {}

  @RequirePermission('quotations', PermissionAction.CREATE)
  @Post('from-rfq')
  createFromRfq(@Body() dto: CreateQuotationFromRfqDto, @Req() req: AuthedRequest) {
    return this.quotations.createFromRfq(
      req.user.companyId,
      { ...dto, validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined },
      req.user.sub,
      req.ip ?? null,
    );
  }

  @RequirePermission('quotations', PermissionAction.CREATE)
  @Post('direct')
  createDirect(@Body() dto: CreateQuotationDirectDto, @Req() req: AuthedRequest) {
    return this.quotations.createDirect(
      req.user.companyId,
      { ...dto, validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined },
      req.user.sub,
      req.ip ?? null,
    );
  }

  @RequirePermission('quotations', PermissionAction.VIEW)
  @Get()
  list(
    @Req() req: AuthedRequest,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.quotations.list({
      companyId: req.user.companyId,
      status: status as never,
      customerId,
    });
  }

  @RequirePermission('quotations', PermissionAction.VIEW)
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotations.getById(id);
  }

  @RequirePermission('quotations', PermissionAction.EDIT)
  @Post(':id/send')
  send(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.quotations.send(id, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('quotations', PermissionAction.EDIT)
  @Post(':id/negotiate')
  negotiate(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotations.negotiate(id);
  }

  @RequirePermission('quotations', PermissionAction.EDIT)
  @Post(':id/revise')
  revise(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviseQuotationDto,
    @Req() req: AuthedRequest,
  ) {
    return this.quotations.reviseVersion(id, dto.lineItems, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('quotations', PermissionAction.APPROVE)
  @Post(':id/request-approval')
  requestApproval(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestApprovalDto,
    @Req() req: AuthedRequest,
  ) {
    return this.quotations.requestApproval(id, req.user.sub, dto.attributes ?? {});
  }

  @RequirePermission('quotations', PermissionAction.APPROVE)
  @Post('approve')
  decideApproval(@Body() dto: DecideApprovalDto, @Req() req: AuthedRequest) {
    return this.quotations.decideApproval(
      dto.approvalId,
      dto.decision,
      req.user.sub,
      dto.comment,
      req.ip ?? null,
    );
  }

  @RequirePermission('quotations', PermissionAction.EDIT)
  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotations.cancel(id);
  }
}
