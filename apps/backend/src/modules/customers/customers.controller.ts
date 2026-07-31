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
import { CustomerService, RealAiCustomerProfileProvider } from '@modules/customers';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  AddActivityDto,
  AddContactDto,
  CreateCustomerDto,
  DecideApprovalDto,
  RequestApprovalDto,
  TransitionCustomerStatusDto,
  UpdateCustomerDto,
} from './dto/customer.dto';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customers: CustomerService,
    private readonly aiProfileProvider: RealAiCustomerProfileProvider,
  ) {}

  @RequirePermission('customers', PermissionAction.CREATE)
  @Post()
  create(@Body() dto: CreateCustomerDto, @Req() req: AuthedRequest) {
    return this.customers.create(
      { companyId: req.user.companyId, ...dto },
      req.user.sub,
      req.ip ?? null,
    );
  }

  @RequirePermission('customers', PermissionAction.VIEW)
  @Get()
  list(@Req() req: AuthedRequest, @Query('status') status?: string) {
    return this.customers.list({ companyId: req.user.companyId, status: status as never });
  }

  @RequirePermission('customers', PermissionAction.VIEW)
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.getById(id);
  }

  @RequirePermission('customers', PermissionAction.EDIT)
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
    @Req() req: AuthedRequest,
  ) {
    return this.customers.update(id, dto, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('customers', PermissionAction.EDIT)
  @Post(':id/transition')
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionCustomerStatusDto,
    @Req() req: AuthedRequest,
  ) {
    return this.customers.transitionStatus(id, dto.status, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('customers', PermissionAction.DELETE)
  @Post(':id/archive')
  archive(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.customers.archive(id, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('customers', PermissionAction.APPROVE)
  @Post(':id/request-approval')
  requestApproval(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestApprovalDto,
    @Req() req: AuthedRequest,
  ) {
    return this.customers.requestApproval(id, req.user.sub, dto.attributes ?? {});
  }

  @RequirePermission('customers', PermissionAction.APPROVE)
  @Post('approve')
  decideApproval(@Body() dto: DecideApprovalDto, @Req() req: AuthedRequest) {
    return this.customers.decideApproval(
      dto.approvalId,
      dto.decision,
      req.user.sub,
      dto.comment,
      req.ip ?? null,
    );
  }

  @RequirePermission('customers', PermissionAction.EDIT)
  @Post(':id/contacts')
  addContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddContactDto,
    @Req() req: AuthedRequest,
  ) {
    return this.customers.addContact(id, dto, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('customers', PermissionAction.VIEW)
  @Get(':id/contacts')
  listContacts(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.listContacts(id);
  }

  @RequirePermission('customers', PermissionAction.EDIT)
  @Post(':id/contacts/:contactId/primary')
  setPrimaryContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ) {
    return this.customers.setPrimaryContact(id, contactId);
  }

  @RequirePermission('customers', PermissionAction.EDIT)
  @Post(':id/activities')
  addActivity(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddActivityDto,
    @Req() req: AuthedRequest,
  ) {
    return this.customers.addActivity(id, dto.type, dto.body, req.user.sub);
  }

  @RequirePermission('customers', PermissionAction.VIEW)
  @Get(':id/activities')
  listActivities(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.listActivities(id);
  }

  @RequirePermission('customers', PermissionAction.VIEW)
  @Get(':id/timeline')
  getTimeline(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.getTimeline(id);
  }

  @RequirePermission('customers', PermissionAction.EXECUTE_AI)
  @Post(':id/ai-analysis')
  aiAnalysis(@Param('id', ParseUUIDPipe) id: string) {
    return this.aiProfileProvider.analyze({ customerId: id });
  }
}
