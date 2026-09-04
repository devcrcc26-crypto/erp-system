'use client';

import { Alert, Button, Grid, Skeleton } from 'antd';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import EmployeePerDiemRatesSection from '@/components/modules/hr/per-diem/EmployeePerDiemRatesSection';
import { useCanManageEmployeePerDiemRates } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { ApiRequestError } from '@/lib/api/errors';
import { useUser } from '@/lib/query/users';
import { formatUserName } from '@/lib/utils/user-display';

/**
 * Edit employee per diem rates — employee detail / form chrome.
 */
export default function EmployeePerDiemRatesEditPageContent({
  employeeId,
}: {
  employeeId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isNarrow = screens.sm === false;
  const canManagePerDiemRates = useCanManageEmployeePerDiemRates();

  useSetHeaderExtra(null);

  const userQuery = useUser(employeeId, canManagePerDiemRates);

  if (!canManagePerDiemRates) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-form-page">
        <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (userQuery.isLoading) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-employee-per-diem-form-page">
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 6 }} />
        </div>
      </div>
    );
  }

  if (userQuery.isError || !userQuery.data) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-form-page">
        <Alert
          type="error"
          showIcon
          title={
            userQuery.error instanceof ApiRequestError
              ? userQuery.error.message
              : t('hr.messages.employeeNotFound')
          }
          action={
            <Button
              onClick={() => router.push('/hr/employee-per-diem-rates')}
            >
              {t('hr.buttons.backToList')}
            </Button>
          }
        />
      </div>
    );
  }

  const employeeName = formatUserName(userQuery.data);

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-employee-per-diem-form-page">
      <div className="erp-employee-per-diem-form-actions flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={() =>
            router.push(`/hr/employee-per-diem-rates/${employeeId}`)
          }
          aria-label={t('hr.buttons.back')}
          className="sm:!me-auto"
        >
          {isNarrow ? undefined : t('hr.buttons.back')}
        </Button>
        <Button
          onClick={() =>
            router.push(`/hr/employee-per-diem-rates/${employeeId}`)
          }
          className="shrink-0"
          style={{ borderRadius: 8 }}
        >
          {t('hr.buttons.cancel')}
        </Button>
      </div>

      <div className="erp-pro-card">
        <div className="erp-employee-hero erp-contract-hero !pb-4">
          <div className="erp-employee-hero-copy min-w-0 flex-1">
            <p className="erp-users-stat-label m-0 mb-1">
              {t('pages.hr.employeePerDiemRates.editTitle')}
            </p>
            <h2 className="erp-users-name erp-employee-hero-name m-0 break-words">
              {employeeName}
            </h2>
            {userQuery.data.email ? (
              <p className="erp-users-email m-0 mt-1.5">
                {userQuery.data.email}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="erp-pro-card min-w-0 overflow-hidden">
        <div className="erp-employee-tab-panel erp-contract-detail-body">
          <EmployeePerDiemRatesSection
            employeeId={employeeId}
            editable
            embedded={false}
          />
        </div>
      </div>
    </div>
  );
}
