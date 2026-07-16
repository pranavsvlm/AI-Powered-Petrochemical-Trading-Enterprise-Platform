import { IsArray, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

const PRIORITIES = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW', 'INFORMATIONAL'];
const CHANNELS = ['EMAIL', 'IN_APP', 'WHATSAPP', 'SMS', 'PUSH'];

export class CreateNotificationDto {
  @IsUUID()
  recipientUserId!: string;

  @IsOptional()
  @IsString()
  recipientEmail?: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;

  @IsString()
  @IsNotEmpty()
  category!: string;

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: string;

  @IsOptional()
  @IsArray()
  @IsIn(CHANNELS, { each: true })
  channels?: string[];

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}

export class UpdatePreferenceDto {
  @IsOptional()
  @IsArray()
  @IsIn(CHANNELS, { each: true })
  channels?: string[];

  @IsOptional()
  @IsString()
  quietHoursStart?: string;

  @IsOptional()
  @IsString()
  quietHoursEnd?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsIn(['IMMEDIATE', 'HOURLY', 'DAILY'])
  digestFrequency?: 'IMMEDIATE' | 'HOURLY' | 'DAILY';

  @IsOptional()
  @IsArray()
  categoryMutes?: string[];
}

export class TestNotificationDto {
  @IsUUID()
  recipientUserId!: string;

  @IsOptional()
  @IsString()
  recipientEmail?: string;
}
