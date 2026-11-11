import { SetMetadata } from '@nestjs/common';

export const DELEGATE_PERMISSION_CHECK_KEY = 'delegatePermissionCheck';

/**
 * Marks an endpoint that enforces authorization in the handler (e.g. folder-scoped checks)
 * instead of global RBAC via @RequirePermission.
 */
export const DelegatePermissionCheck = (): MethodDecorator & ClassDecorator =>
  SetMetadata(DELEGATE_PERMISSION_CHECK_KEY, true);
