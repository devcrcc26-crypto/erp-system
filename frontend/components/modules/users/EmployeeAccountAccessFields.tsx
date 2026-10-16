'use client';

import { MetaItem } from '@/components/modules/hr/shared/hr-page-chrome';
import { ApproverOnlyTag } from '@/components/modules/users/EmployeeApproverOnlyField';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { User } from '@/lib/api/types';

/**
 * Read-only login name + approver-only on the employee detail page.
 * Editing belongs on Add / Edit employee (users.edit).
 */
export default function EmployeeAccountAccessFields({
  user,
}: {
  user: Pick<
    User,
    | 'loginName'
    | 'excludedFromHrProcesses'
    | 'excludedReason'
  >;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const excluded = Boolean(user.excludedFromHrProcesses);

  return (
    <>
      <MetaItem label={t('users.loginName')}>
        {user.loginName?.trim()
          ? user.loginName
          : t('users.loginNameNotSet')}
      </MetaItem>
      <MetaItem label={t('users.approverOnlySwitch')}>
        <div className="flex flex-col items-start gap-1">
          {excluded ? (
            <>
              <ApproverOnlyTag />
              {user.excludedReason?.trim() ? (
                <span className="erp-users-cell-sub">{user.excludedReason}</span>
              ) : null}
            </>
          ) : (
            <span>{t('common.no')}</span>
          )}
        </div>
      </MetaItem>
    </>
  );
}
