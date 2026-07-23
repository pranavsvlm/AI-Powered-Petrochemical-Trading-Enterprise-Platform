import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { PermissionAction, type JwtAccessTokenPayload } from '@platform/types';
import { DocumentService } from '@modules/document-management';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  ALLOWED_DOCUMENT_CONTENT_TYPES,
  CreateCategoryDto,
  CreateFolderDto,
  CreateTagDto,
  DecideApprovalDto,
  MAX_DOCUMENT_SIZE_BYTES,
  RequestApprovalDto,
  SearchDocumentsDto,
  UpdateDocumentDto,
  UploadDocumentDto,
} from './dto/document.dto';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

function assertValidFile(
  file: Express.Multer.File | undefined,
): asserts file is Express.Multer.File {
  if (!file) throw new BadRequestException('A file is required.');
  if (!ALLOWED_DOCUMENT_CONTENT_TYPES.includes(file.mimetype)) {
    throw new BadRequestException(`Unsupported file type: ${file.mimetype}`);
  }
  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    throw new BadRequestException(
      `File exceeds the maximum allowed size of ${MAX_DOCUMENT_SIZE_BYTES} bytes.`,
    );
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentService) {}

  @RequirePermission('documents', PermissionAction.CREATE)
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadDocumentDto,
    @Req() req: AuthedRequest,
  ) {
    assertValidFile(file);
    return this.documents.upload({
      companyId: req.user.companyId,
      module: dto.module,
      entityType: dto.entityType,
      entityId: dto.entityId,
      title: dto.title,
      description: dto.description,
      folderId: dto.folderId,
      categoryId: dto.categoryId,
      ownerUserId: req.user.sub,
      buffer: file.buffer,
      contentType: file.mimetype,
      filename: file.originalname,
      retentionPolicy:
        dto.retentionPolicyName && dto.retentionDurationDays
          ? { name: dto.retentionPolicyName, durationDays: dto.retentionDurationDays }
          : undefined,
      ipAddress: req.ip ?? null,
    });
  }

  @RequirePermission('documents', PermissionAction.VIEW)
  @Get()
  list(
    @Req() req: AuthedRequest,
    @Query('status') status?: string,
    @Query('folderId') folderId?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.documents.list({
      companyId: req.user.companyId,
      status: status as never,
      folderId,
      categoryId,
    });
  }

  @RequirePermission('documents', PermissionAction.VIEW)
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.documents.getById(id);
  }

  @RequirePermission('documents', PermissionAction.EDIT)
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentDto,
    @Req() req: AuthedRequest,
  ) {
    return this.documents.updateMetadata(id, dto, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('documents', PermissionAction.VIEW)
  @Get(':id/versions')
  listVersions(@Param('id', ParseUUIDPipe) id: string) {
    return this.documents.getById(id).then((doc) => doc.versions);
  }

  @RequirePermission('documents', PermissionAction.CREATE)
  @Post(':id/versions')
  @UseInterceptors(FileInterceptor('file'))
  addVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: AuthedRequest,
  ) {
    assertValidFile(file);
    return this.documents.addVersion(
      id,
      file.buffer,
      file.mimetype,
      file.originalname,
      req.user.sub,
      req.ip ?? null,
    );
  }

  @RequirePermission('documents', PermissionAction.EDIT)
  @Post(':id/versions/:version/restore')
  restoreVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('version') version: string,
    @Req() req: AuthedRequest,
  ) {
    return this.documents.restoreVersion(id, Number(version), req.user.sub);
  }

  @RequirePermission('documents', PermissionAction.VIEW)
  @Get(':id/download')
  download(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.documents.download(id, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('documents', PermissionAction.APPROVE)
  @Post(':id/request-approval')
  requestApproval(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestApprovalDto,
    @Req() req: AuthedRequest,
  ) {
    return this.documents.requestApproval(id, req.user.sub, dto.attributes ?? {});
  }

  @RequirePermission('documents', PermissionAction.APPROVE)
  @Post('approve')
  decideApproval(@Body() dto: DecideApprovalDto, @Req() req: AuthedRequest) {
    return this.documents.decideApproval(
      dto.approvalId,
      dto.decision,
      req.user.sub,
      dto.comment,
      req.ip ?? null,
    );
  }

  @RequirePermission('documents', PermissionAction.DELETE)
  @Post(':id/archive')
  archive(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.documents.archive(id, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('documents', PermissionAction.VIEW)
  @Post('search')
  search(@Body() dto: SearchDocumentsDto, @Req() req: AuthedRequest) {
    return this.documents.search(
      req.user.companyId,
      dto.query,
      { limit: dto.limit, offset: dto.offset },
      dto.mode ?? 'fulltext',
    );
  }

  @RequirePermission('documents', PermissionAction.MANAGE_SETTINGS)
  @Post(':id/tags/:tagId')
  assignTag(@Param('id', ParseUUIDPipe) id: string, @Param('tagId', ParseUUIDPipe) tagId: string) {
    return this.documents.assignTag(id, tagId);
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('document-folders')
export class DocumentFoldersController {
  constructor(private readonly documents: DocumentService) {}

  @RequirePermission('documents', PermissionAction.MANAGE_SETTINGS)
  @Post()
  create(@Body() dto: CreateFolderDto, @Req() req: AuthedRequest) {
    return this.documents.createFolder(req.user.companyId, dto.name, dto.parentId);
  }

  @RequirePermission('documents', PermissionAction.VIEW)
  @Get()
  list(@Req() req: AuthedRequest) {
    return this.documents.listFolders(req.user.companyId);
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('document-categories')
export class DocumentCategoriesController {
  constructor(private readonly documents: DocumentService) {}

  @RequirePermission('documents', PermissionAction.MANAGE_SETTINGS)
  @Post()
  create(@Body() dto: CreateCategoryDto, @Req() req: AuthedRequest) {
    return this.documents.createCategory(req.user.companyId, dto.name);
  }

  @RequirePermission('documents', PermissionAction.VIEW)
  @Get()
  list(@Req() req: AuthedRequest) {
    return this.documents.listCategories(req.user.companyId);
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('document-tags')
export class DocumentTagsController {
  constructor(private readonly documents: DocumentService) {}

  @RequirePermission('documents', PermissionAction.MANAGE_SETTINGS)
  @Post()
  create(@Body() dto: CreateTagDto, @Req() req: AuthedRequest) {
    return this.documents.createTag(req.user.companyId, dto.name);
  }

  @RequirePermission('documents', PermissionAction.VIEW)
  @Get()
  list(@Req() req: AuthedRequest) {
    return this.documents.listTags(req.user.companyId);
  }
}
