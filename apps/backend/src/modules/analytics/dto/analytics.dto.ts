import { ArrayNotEmpty, IsArray, IsIn, IsString } from 'class-validator';

const REPORT_TYPES = [
  'EXECUTIVE',
  'SALES',
  'TRADING',
  'FINANCE',
  'INVENTORY',
  'PROCUREMENT',
  'AI_USAGE',
] as const;
const REPORT_FORMATS = ['PDF', 'CSV'] as const;
const REPORT_SCHEDULE_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;

export class GenerateReportDto {
  @IsIn(REPORT_TYPES)
  type!: (typeof REPORT_TYPES)[number];

  @IsIn(REPORT_FORMATS)
  format!: (typeof REPORT_FORMATS)[number];
}

export class CreateScheduleDto {
  @IsIn(REPORT_TYPES)
  reportType!: (typeof REPORT_TYPES)[number];

  @IsIn(REPORT_FORMATS)
  format!: (typeof REPORT_FORMATS)[number];

  @IsIn(REPORT_SCHEDULE_FREQUENCIES)
  frequency!: (typeof REPORT_SCHEDULE_FREQUENCIES)[number];

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  recipientEmails!: string[];
}
