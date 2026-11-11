import { SetMetadata } from '@nestjs/common';
import { PmModuleKey } from '../../domain/project-modules.const';

export const PM_MODULE_KEY = 'pm_module';

export const RequirePmModule = (
  module: PmModuleKey,
): ReturnType<typeof SetMetadata> => SetMetadata(PM_MODULE_KEY, module);
