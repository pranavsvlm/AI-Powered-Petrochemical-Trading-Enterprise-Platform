import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const THREAD_TYPES = ['CUSTOMER', 'SUPPLIER', 'INTERNAL', 'ANNOUNCEMENT'] as const;
const MESSAGE_DIRECTIONS = ['INBOUND', 'OUTBOUND'] as const;
const NOTIFICATION_CHANNELS = ['EMAIL', 'IN_APP', 'WHATSAPP', 'SMS', 'PUSH'] as const;

export class CreateThreadDto {
  @IsIn(THREAD_TYPES)
  type!: (typeof THREAD_TYPES)[number];

  @IsOptional()
  @IsString()
  subjectType?: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  title?: string;
}

export class AddParticipantDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  externalName?: string;

  @IsOptional()
  @IsString()
  externalIdentifier?: string;
}

export class SendMessageDto {
  @IsIn(MESSAGE_DIRECTIONS)
  direction!: (typeof MESSAGE_DIRECTIONS)[number];

  @IsIn(NOTIFICATION_CHANNELS)
  channel!: (typeof NOTIFICATION_CHANNELS)[number];

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  @IsString()
  senderExternalName?: string;
}

export class CreateTaskFromThreadDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  assigneeUserId?: string;
}
