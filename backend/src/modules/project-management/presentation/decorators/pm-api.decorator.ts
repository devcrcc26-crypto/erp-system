import { applyDecorators, UseGuards } from '@nestjs/common';
import { PmModuleEnabledGuard } from '../guards/pm-module-enabled.guard';

/** Applies the company PM module enablement guard at controller scope. */
export function PmApi(): ClassDecorator {
  return applyDecorators(UseGuards(PmModuleEnabledGuard));
}
