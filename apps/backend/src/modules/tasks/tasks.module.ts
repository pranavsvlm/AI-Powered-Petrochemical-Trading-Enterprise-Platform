import { Module } from '@nestjs/common';
import { TaskService, ProjectService, TimeEntryService } from '@modules/tasks';
import { TasksController, ProjectsController, TimeEntriesController } from './tasks.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

@Module({
  controllers: [TasksController, ProjectsController, TimeEntriesController],
  providers: [
    AuditService,
    {
      provide: TaskService,
      useFactory: (prisma: PrismaService, audit: AuditService) =>
        new TaskService(prisma.client, audit),
      inject: [PrismaService, AuditService],
    },
    {
      provide: ProjectService,
      useFactory: (prisma: PrismaService, audit: AuditService) =>
        new ProjectService(prisma.client, audit),
      inject: [PrismaService, AuditService],
    },
    {
      provide: TimeEntryService,
      useFactory: (prisma: PrismaService, audit: AuditService) =>
        new TimeEntryService(prisma.client, audit),
      inject: [PrismaService, AuditService],
    },
  ],
  exports: [TaskService, ProjectService, TimeEntryService],
})
export class TasksModule {}
