import { SetMetadata } from '@nestjs/common';
import { RequiredPermission } from './require-permission.decorator';

export const PERMISSION_ANY_KEY = 'permissionAny';

/**
 * Endpoint passes when the user has any one of the listed module permissions.
 */
export const RequireAnyPermission = (
  ...permissions: RequiredPermission[]
): ReturnType<typeof SetMetadata> =>
  SetMetadata(PERMISSION_ANY_KEY, permissions);
