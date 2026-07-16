import { Module } from '@nestjs/common';
import { WorkflowExecutionsController, WorkflowsController } from './workflows.controller';

@Module({
  controllers: [WorkflowsController, WorkflowExecutionsController],
})
export class WorkflowsModule {}
