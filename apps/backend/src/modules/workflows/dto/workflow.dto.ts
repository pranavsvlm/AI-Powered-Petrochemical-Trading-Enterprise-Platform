import { IsArray, IsIn, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

const NODE_TYPES = [
  'START',
  'AI_DECISION',
  'CONDITION',
  'APPROVAL',
  'TASK',
  'NOTIFICATION',
  'API',
  'DOCUMENT',
  'DATABASE',
  'DELAY',
  'END',
];

export class WorkflowNodeDto {
  @IsString()
  id!: string;

  @IsString()
  key!: string;

  @IsIn(NODE_TYPES)
  type!: string;

  @IsObject()
  config!: Record<string, unknown>;
}

export class WorkflowEdgeDto {
  @IsString()
  id!: string;

  @IsString()
  fromNodeId!: string;

  @IsString()
  toNodeId!: string;

  @IsOptional()
  @IsObject()
  condition?: Record<string, unknown>;
}

export class CreateWorkflowDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(['MANUAL', 'API', 'SCHEDULED', 'EVENT'])
  triggerType!: 'MANUAL' | 'API' | 'SCHEDULED' | 'EVENT';

  @IsOptional()
  @IsObject()
  triggerConfig?: Record<string, unknown>;

  @IsArray()
  nodes!: WorkflowNodeDto[];

  @IsArray()
  edges!: WorkflowEdgeDto[];
}

export class StartWorkflowDto {
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}
