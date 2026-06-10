import { SetMetadata } from '@nestjs/common';
import { PermissionAction } from './permission.types';

export const PERMISSION_KEY = 'permission';

export interface RequiredPermission {
  module: string;
  action: PermissionAction;
}

export const RequirePermission = (
  module: string,
  action: PermissionAction,
): ReturnType<typeof SetMetadata> =>
  SetMetadata(PERMISSION_KEY, { module, action } satisfies RequiredPermission);
