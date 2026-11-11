'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import '@/components/modules/profile/profile-v2.css';
import '@/components/modules/users/employee-detail-v2.css';

import { Alert, Button, Grid, Skeleton } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import EmployeeProfilePhoto from '@/components/modules/users/EmployeeProfilePhoto';
import EmployeePerDiemRatesSection from '@/components/modules/hr/per-diem/EmployeePerDiemRatesSection';
import { useCanManageEmployeePerDiemRates } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { ApiRequestError } from '@/lib/api/errors';
import { useEmployeePerDiemRate } from '@/lib/query/per-diem';
import { useUser } from '@/lib/query/users';
import {
  countActivePerDiemCategories,
} from '@/lib/utils/employee-per-diem-list-filter';
import { formatUserName } from '@/lib/utils/user-display';
import {
  PER_DIEM_DESTINATION_CATEGORIES,
} from '@/lib/constants/per-diem-destination-categories';

import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';
/**
 * Employee per diem rates detail - Users / employee profile chrome.
 */
export default function EmployeePerDiemRatesDetailPageContent({
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
  const rateQuery = useEmployeePerDiemRate(employeeId, canManagePerDiemRates);

  if (!canManagePerDiemRates) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page erp-profile-page erp-profile-v2 erp-employee-detail-v2 ${DETAIL_PAGE_V2}`}>
        <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (userQuery.isLoading || rateQuery.isLoading) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page erp-profile-page erp-profile-v2 erp-employee-detail-v2 erp-employee-per-diem-detail-page ${DETAIL_PAGE_V2}`}>
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (userQuery.isError || !userQuery.data) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page erp-profile-page erp-profile-v2 erp-employee-detail-v2 ${DETAIL_PAGE_V2}`}>
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

  const employee = userQuery.data;
  const rate = rateQuery.data ?? null;
  const activeCount = countActivePerDiemCategories(rate);
  const employeeName = formatUserName(employee);

  return (
    <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page erp-profile-page erp-profile-v2 erp-employee-detail-v2 erp-employee-per-diem-detail-page ${DETAIL_PAGE_V2}`}>
      <div className="erp-pro-card erp-profile-identity">
        <div className="erp-employee-toolbar">
          <Button
            type="text"
            icon={<ArrowLeft size={16} aria-hidden />}
            onClick={() => router.push('/hr/employee-per-diem-rates')}
            aria-label={t('hr.buttons.backToList')}
            className="erp-employee-toolbar-back"
          >
            {isNarrow ? undefined : t('hr.buttons.back')}
          </Button>
          <div className="erp-employee-toolbar-actions flex flex-wrap items-center justify-end gap-2">
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={() =>
                router.push(
                  `/hr/employee-per-diem-rates/${employeeId}/edit`,
                )
              }
              aria-label={t('common.update')}
            >
              {isNarrow ? undefined : t('common.update')}
            </Button>
          </div>
        </div>

        <div className="erp-employee-hero erp-profile-hero">
          <EmployeeProfilePhoto
            userId={employee.id}
            photoDocumentId={employee.photoDocumentId}
            firstName={employee.firstName}
            lastName={employee.lastName}
            canEdit={false}
            size={isNarrow ? 72 : 88}
            variant="hero"
          />
          <div className="erp-employee-hero-copy min-w-0 flex-1">
            <div className="erp-profile-hero-badges mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              {employee.employeeId ? (
                <span className="erp-users-id-chip">{employee.employeeId}</span>
              ) : null}
              {rate ? (
                <span className="erp-users-id-chip">ETB</span>
              ) : (
                <span className="erp-users-role-tag">
                  {t('pages.hr.employeePerDiemRates.notConfigured')}
                </span>
              )}
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline justify-center gap-2 sm:justify-start">
              <h2 className="erp-users-name erp-employee-hero-name m-0 break-words">
                {employeeName}
              </h2>
            </div>
            {employee.email ? (
              <p className="erp-users-email m-0 mt-1.5 break-words sm:text-left">
                {employee.email}
              </p>
            ) : null}
            <p className="erp-users-cell-sub m-0 mt-1">
              {[
                employee.department?.name,
                rate
                  ? `${activeCount}/${PER_DIEM_DESTINATION_CATEGORIES.length} ${t('pages.hr.employeePerDiemRates.stats.activeCategories').toLowerCase()}`
                  : t('pages.hr.employeePerDiemRates.notConfigured'),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>

        <div className="erp-users-stat-bar erp-employee-meta-bar erp-profile-meta">
          <div className="erp-users-stat">
            <div className="min-w-0">
              <p className="erp-users-stat-label">{t('hr.form.currency')}</p>
              <p className="erp-employee-meta-value">{rate ? 'ETB' : '-'}</p>
            </div>
          </div>
          <div className="erp-users-stat">
            <div className="min-w-0">
              <p className="erp-users-stat-label">
                {t('pages.hr.employeePerDiemRates.stats.activeCategories')}
              </p>
              <p className="erp-employee-meta-value">
                {rate
                  ? `${activeCount}/${PER_DIEM_DESTINATION_CATEGORIES.length}`
                  : '-'}
              </p>
            </div>
          </div>
          <div className="erp-users-stat">
            <div className="min-w-0">
              <p className="erp-users-stat-label">{t('common.department')}</p>
              <p className="erp-employee-meta-value">
                {employee.department?.name ?? '-'}
              </p>
            </div>
          </div>
          <div className="erp-users-stat">
            <div className="min-w-0">
              <p className="erp-users-stat-label">
                {t('pages.hr.employeePerDiemRates.statusLabel')}
              </p>
              <p className="erp-employee-meta-value">
                {rate
                  ? t('pages.hr.employeePerDiemRates.stats.configured')
                  : t('pages.hr.employeePerDiemRates.stats.pendingSetup')}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="erp-pro-card min-w-0 overflow-hidden">
        <div className="erp-employee-tab-panel erp-contract-detail-body">
          <EmployeePerDiemRatesSection
            employeeId={employeeId}
            editable={false}
            embedded={false}
          />
        </div>
      </div>
    </div>
  );
}
