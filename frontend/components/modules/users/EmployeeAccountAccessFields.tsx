'use client';

import EmployeeApproverOnlyField from '@/components/modules/users/EmployeeApproverOnlyField';
import EmployeeLoginNameField from '@/components/modules/users/EmployeeLoginNameField';
import { useCanEditUsers } from '@/hooks/use-auth-capabilities';
import type { User } from '@/lib/api/types';

/**
 * Login name + approver-only flag on the employee detail page. Both are
 * editable only with users.edit (what the backend checks); hr.view sees them
 * read-only.
 */
export default function EmployeeAccountAccessFields({
  user,
}: {
  user: Pick<
    User,
    | 'id'
    | 'loginName'
    | 'firstName'
    | 'middleName'
    | 'lastName'
    | 'excludedFromHrProcesses'
    | 'excludedReason'
  >;
}): React.ReactNode {
  const canEditUsers = useCanEditUsers();
  return (
    <>
      <EmployeeLoginNameField
        userId={user.id}
        loginName={user.loginName}
        firstName={user.firstName}
        middleName={user.middleName}
        lastName={user.lastName}
        canEdit={canEditUsers}
      />
      <EmployeeApproverOnlyField
        userId={user.id}
        excluded={Boolean(user.excludedFromHrProcesses)}
        reason={user.excludedReason}
        canEdit={canEditUsers}
      />
    </>
  );
}
