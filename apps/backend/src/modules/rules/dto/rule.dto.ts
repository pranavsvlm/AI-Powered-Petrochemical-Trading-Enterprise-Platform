import {
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

const ACTION_TYPES = [
  'ALLOW',
  'BLOCK',
  'WARN',
  'REQUEST_APPROVAL',
  'NOTIFY',
  'GENERATE_TASK',
  'EXECUTE_WORKFLOW',
  'CALL_AI',
  'CALL_API',
];

export class RuleActionDto {
  @IsIn(ACTION_TYPES)
  type!: string;

  @IsObject()
  params!: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  order?: number;
}

export class CreateRuleDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  module!: string;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;

  @IsOptional()
  @IsISO8601()
  effectiveTo?: string;

  @IsObject()
  condition!: Record<string, unknown>;

  @IsArray()
  actions!: RuleActionDto[];
}

export class UpdateRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;

  @IsOptional()
  @IsISO8601()
  effectiveTo?: string;

  @IsOptional()
  @IsObject()
  condition?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  actions?: RuleActionDto[];
}

export class EvaluateRuleDto {
  @IsString()
  @IsNotEmpty()
  module!: string;

  @IsObject()
  attributes!: Record<string, unknown>;
}
