import { IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

export class ReplayEventsDto {
  @IsOptional()
  @IsString()
  eventType?: string;

  @IsOptional()
  @IsString()
  aggregateId?: string;

  @IsOptional()
  @IsISO8601()
  fromTimestamp?: string;

  @IsOptional()
  @IsISO8601()
  toTimestamp?: string;
}

export class RetryDeadLetterDto {
  @IsUUID()
  deadLetterId!: string;
}
