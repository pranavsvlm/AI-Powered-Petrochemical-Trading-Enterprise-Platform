import { ArrayNotEmpty, IsArray, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class SetRolePermissionsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  permissionIds!: string[];
}

export class AssignRoleDto {
  @IsUUID()
  userId!: string;

  @IsUUID()
  roleId!: string;
}

export class CreatePolicyDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  definition!: Record<string, unknown>;
}

export class CreateApprovalRuleDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  triggerCondition!: Record<string, unknown>;

  @IsUUID()
  approverRoleId!: string;

  @IsOptional()
  threshold?: Record<string, unknown>;
}
