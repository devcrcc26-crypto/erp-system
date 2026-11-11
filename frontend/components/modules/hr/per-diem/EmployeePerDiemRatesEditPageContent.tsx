'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { Alert, Button, Skeleton } from 'antd';
import { useRouter } from 'next/navigation';
import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';
import EmployeePerDiemRatesSection from '@/components/modules/hr/per-diem/EmployeePerDiemRatesSection';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import { useCanManageEmployeePerDiemRates } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import { useUser } from '@/lib/query/users';
import { formatUserName } from '@/lib/utils/user-display';

const LIST_PATH = '/hr/employee-per-diem-rates';

/**
 * Edit employee per diem rates - shared HR form banner.
 */
export default function EmployeePerDiemRatesEditPageContent({
  employeeId,
}: {
  employeeId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const canManagePerDiemRates = useCanManageEmployeePerDiemRates();

  const userQuery = useUser(employeeId, canManagePerDiemRates);

  if (!canManagePerDiemRates) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page ${DETAIL_PAGE_V2}`}>
        <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (userQuery.isLoading) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-employee-per-diem-form-page ${DETAIL_PAGE_V2}`}>
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 6 }} />
        </div>
      </div>
    );
  }

  if (userQuery.isError || !userQuery.data) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page ${DETAIL_PAGE_V2}`}>
        <Alert
          type="error"
          showIcon
          title={
            userQuery.error instanceof ApiRequestError
              ? userQuery.error.message
              : t('hr.messages.employeeNotFound')
          }
          action={
            <Button onClick={() => router.push(LIST_PATH)}>
              {t('hr.buttons.backToList')}
            </Button>
          }
        />
      </div>
    );
  }

  const employeeName = formatUserName(userQuery.data);
  const detailHref = `${LIST_PATH}/${employeeId}`;

  return (
    <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-employee-per-diem-form-page ${DETAIL_PAGE_V2}`}>
      <HrFormPageShell
        title={t('pages.hr.employeePerDiemRates.editTitle')}
        description={
          userQuery.data.email
            ? `${employeeName} · ${userQuery.data.email}`
            : employeeName
        }
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref={detailHref}
        backLabel={t('hr.buttons.back')}
      >
        <div className="erp-pro-card min-w-0 overflow-hidden">
          <div className="erp-employee-tab-panel erp-contract-detail-body">
            <EmployeePerDiemRatesSection
              employeeId={employeeId}
              editable
              embedded={false}
            />
          </div>
        </div>
      </HrFormPageShell>
    </div>
  );
}
