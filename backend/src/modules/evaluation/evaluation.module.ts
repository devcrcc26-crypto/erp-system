import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { EvaluationCycleService } from './application/services/evaluation-cycle.service';
import { EvaluationTemplateService } from './application/services/evaluation-template.service';
import { EvaluationService } from './application/services/evaluation.service';
import { EvaluationCycleController } from './presentation/controllers/evaluation-cycle.controller';
import { EvaluationTemplateController } from './presentation/controllers/evaluation-template.controller';
import { EvaluationController } from './presentation/controllers/evaluation.controller';

@Module({
  imports: [PrismaModule],
  controllers: [
    EvaluationTemplateController,
    EvaluationCycleController,
    EvaluationController,
  ],
  providers: [
    EvaluationTemplateService,
    EvaluationCycleService,
    EvaluationService,
  ],
  exports: [EvaluationService],
})
export class EvaluationModule {}
