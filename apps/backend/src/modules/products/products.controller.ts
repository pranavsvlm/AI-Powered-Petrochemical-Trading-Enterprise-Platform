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
import {
  ProductService,
  RealAiPricingProvider,
  RealAiProductExpertProvider,
} from '@modules/products';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  AddPackagingDto,
  AiPricingRequestDto,
  AiProductExpertQuestionDto,
  CreateAttributeDto,
  CreateCategoryDto,
  CreateProductDto,
  DecideApprovalDto,
  RequestApprovalDto,
  SetAttributeValueDto,
  UpdateProductDto,
  UpsertPriceListDto,
} from './dto/product.dto';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductService,
    private readonly aiPricingProvider: RealAiPricingProvider,
    private readonly aiProductExpertProvider: RealAiProductExpertProvider,
  ) {}

  @RequirePermission('products', PermissionAction.CREATE)
  @Post()
  create(@Body() dto: CreateProductDto, @Req() req: AuthedRequest) {
    return this.products.create(
      { companyId: req.user.companyId, ...dto },
      req.user.sub,
      req.ip ?? null,
    );
  }

  @RequirePermission('products', PermissionAction.VIEW)
  @Get()
  list(
    @Req() req: AuthedRequest,
    @Query('status') status?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.products.list({
      companyId: req.user.companyId,
      status: status as never,
      categoryId,
    });
  }

  @RequirePermission('products', PermissionAction.VIEW)
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.getById(id);
  }

  @RequirePermission('products', PermissionAction.EDIT)
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @Req() req: AuthedRequest,
  ) {
    return this.products.update(id, dto, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('products', PermissionAction.DELETE)
  @Post(':id/archive')
  archive(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.products.archive(id, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('products', PermissionAction.APPROVE)
  @Post(':id/request-approval')
  requestApproval(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestApprovalDto,
    @Req() req: AuthedRequest,
  ) {
    return this.products.requestApproval(id, req.user.sub, dto.attributes ?? {});
  }

  @RequirePermission('products', PermissionAction.APPROVE)
  @Post('approve')
  decideApproval(@Body() dto: DecideApprovalDto, @Req() req: AuthedRequest) {
    return this.products.decideApproval(
      dto.approvalId,
      dto.decision,
      req.user.sub,
      dto.comment,
      req.ip ?? null,
    );
  }

  @RequirePermission('products', PermissionAction.EDIT)
  @Post(':id/packaging')
  addPackaging(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddPackagingDto) {
    return this.products.addPackaging(id, dto.packagingType, dto.unitsPerPackage, dto.uom);
  }

  @RequirePermission('products', PermissionAction.VIEW)
  @Get(':id/packaging')
  listPackaging(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.listPackaging(id);
  }

  @RequirePermission('products', PermissionAction.EDIT)
  @Post(':id/attribute-values')
  setAttributeValue(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetAttributeValueDto) {
    return this.products.setAttributeValue(id, dto.attributeId, dto.value);
  }

  @RequirePermission('products', PermissionAction.VIEW)
  @Get(':id/attribute-values')
  listAttributeValues(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.listAttributeValues(id);
  }

  @RequirePermission('products', PermissionAction.VIEW)
  @Get(':id/effective-price')
  getEffectivePrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthedRequest,
    @Query('quantity') quantity: string,
    @Query('currency') currency: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.products.getEffectivePrice(req.user.companyId, id, {
      customerId,
      quantity: Number(quantity),
      currency,
    });
  }

  @RequirePermission('products', PermissionAction.EXECUTE_AI)
  @Post(':id/ai-pricing')
  aiPricing(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AiPricingRequestDto) {
    return this.aiPricingProvider.recommend({
      productId: id,
      customerId: dto.customerId,
      quantity: dto.quantity,
    });
  }

  @RequirePermission('products', PermissionAction.EXECUTE_AI)
  @Post(':id/ai-expert')
  aiExpert(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AiProductExpertQuestionDto) {
    return this.aiProductExpertProvider.ask({ productId: id, question: dto.question });
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly products: ProductService) {}

  @RequirePermission('products', PermissionAction.MANAGE_SETTINGS)
  @Post()
  create(@Body() dto: CreateCategoryDto, @Req() req: AuthedRequest) {
    return this.products.createCategory(req.user.companyId, dto.name, dto.parentId);
  }

  @RequirePermission('products', PermissionAction.VIEW)
  @Get()
  list(@Req() req: AuthedRequest) {
    return this.products.listCategories(req.user.companyId);
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('product-attributes')
export class ProductAttributesController {
  constructor(private readonly products: ProductService) {}

  @RequirePermission('products', PermissionAction.MANAGE_SETTINGS)
  @Post()
  create(@Body() dto: CreateAttributeDto, @Req() req: AuthedRequest) {
    return this.products.createAttribute(req.user.companyId, dto.name, dto.dataType, dto.unit);
  }

  @RequirePermission('products', PermissionAction.VIEW)
  @Get()
  list(@Req() req: AuthedRequest) {
    return this.products.listAttributes(req.user.companyId);
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('price-lists')
export class PriceListsController {
  constructor(private readonly products: ProductService) {}

  @RequirePermission('products', PermissionAction.MANAGE_SETTINGS)
  @Post(':productId')
  upsert(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: UpsertPriceListDto,
    @Req() req: AuthedRequest,
  ) {
    return this.products.upsertPriceListEntry(
      {
        companyId: req.user.companyId,
        productId,
        customerId: dto.customerId,
        priceType: dto.priceType,
        region: dto.region,
        currency: dto.currency,
        uom: dto.uom,
        minQuantity: dto.minQuantity,
        unitPrice: dto.unitPrice,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validTo: dto.validTo ? new Date(dto.validTo) : undefined,
      },
      req.user.sub,
      req.ip ?? null,
    );
  }

  @RequirePermission('products', PermissionAction.VIEW)
  @Get()
  list(@Req() req: AuthedRequest, @Query('productId') productId?: string) {
    return this.products.listPriceLists(req.user.companyId, productId);
  }
}
