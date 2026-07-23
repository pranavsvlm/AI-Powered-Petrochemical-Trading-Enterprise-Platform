import { IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Min } from 'class-validator';
import { STORAGE_MODULES } from '@platform/storage';

/** Doc 21 "Validation Rules" — allowed file types + a max size, enforced here (not just at storage). */
export const ALLOWED_DOCUMENT_CONTENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'image/png',
  'image/jpeg',
];
export const MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export class UploadDocumentDto {
  @IsIn(STORAGE_MODULES)
  module!: (typeof STORAGE_MODULES)[number];

  @IsString()
  @IsNotEmpty()
  entityType!: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  folderId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  retentionPolicyName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  retentionDurationDays?: number;
}

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  folderId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;
}

export class SearchDocumentsDto {
  @IsString()
  @IsNotEmpty()
  query!: string;

  @IsOptional()
  @IsIn(['fulltext', 'semantic'])
  mode?: 'fulltext' | 'semantic';

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}

export class DecideApprovalDto {
  @IsString()
  @IsNotEmpty()
  approvalId!: string;

  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  comment?: string;
}

export class RequestApprovalDto {
  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;
}

export class CreateFolderDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}

export class CreateTagDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}
