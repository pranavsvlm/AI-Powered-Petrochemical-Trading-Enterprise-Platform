import { Module } from '@nestjs/common';
import { RuleExecutionsController, RulesController } from './rules.controller';

@Module({
  controllers: [RulesController, RuleExecutionsController],
})
export class RulesModule {}
