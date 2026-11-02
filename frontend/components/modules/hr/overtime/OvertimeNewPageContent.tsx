'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, DatePicker, Spin, Typography } from 'antd';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import {
  formatOnBehalfEmployeeName,
  OnBehalfSection,
  useOnBehalf,
} from '@/components/shared/OnBehalfSelector';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type { OvertimeSheetStatus } from '@/lib/api/overtime.types';
import { useOnBehalfEligibleEmployees } from '@/lib/query/on-behalf';
import {
  useOpenOvertimeSheet,
  useOvertimeSheets,
} from '@/lib/query/overtime';
import { useCurrentUser } from '@/lib/query/profile';
import { disableFutureMonths } from '@/lib/utils/date-validation';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const EDITABLE_SHEET_STATUSES: OvertimeSheetStatus[] = ['DRAFT', 'RETURNED'];
const SUBMITTED_SHEET_STATUSES: OvertimeSheetStatus[] = [
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
];

function currentMonthStart(): dayjs.Dayjs {
  return dayjs().startOf('month');
}

/**
 * Opens (or creates) an overtime sheet, then redirects to detail.
 * Plain employees always get the current month (no picker). HR (hr.view)
 * and on-behalf filers can choose a past month.
 */
export default function OvertimeNewPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const currentUser = useCurrentUser();
  const canViewHr = useCanViewHr();
  const onBehalf = useOnBehalf('OVERTIME_APPLICATION');
  const eligibleQuery = useOnBehalfEligibleEmployees(
    currentUser.data?.id,
    currentUser.data?.companyId,
  );
  const eligibleResolved = Boolean(currentUser.data?.id) && !eligibleQuery.isLoading;
  const hasOnBehalfAccess = (eligibleQuery.data?.length ?? 0) > 0;
  // Match backend canOpenPastMonthSheet: HR / overtime managers / on-behalf.
  const canPickPastMonths = canViewHr || hasOnBehalfAccess;

  const openMutation = useOpenOvertimeSheet();
  const [month, setMonth] = useState<dayjs.Dayjs | null>(() =>
    currentMonthStart(),
  );
  // Set once "Open sheet" has created the sheet. Creating it refreshes the
  // sheet lists, so without this the page would find its own new draft and
  // show "you have a draft" while the entries page is still loading.
  const [openedSheetId, setOpenedSheetId] = useState<string | null>(null);

  useEffect(() => {
    if (!eligibleResolved) {
      return;
    }
    if (!canPickPastMonths) {
      setMonth(currentMonthStart());
    }
  }, [eligibleResolved, canPickPastMonths]);

  const selectedMonth = month ? month.month() + 1 : undefined;
  const selectedYear = month ? month.year() : undefined;
  // Scope to the person this sheet belongs to. Without this, hr.view users
  // hit the company-wide list and get a false "already have a sheet" alert
  // for someone else's month before picking an on-behalf employee.
  const targetEmployeeId =
    onBehalf.employeeId ?? currentUser.data?.id ?? undefined;

  const existingSheetQuery = useOvertimeSheets(
    {
      page: 1,
      limit: 1,
      ...(selectedMonth != null ? { month: selectedMonth } : {}),
      ...(selectedYear != null ? { year: selectedYear } : {}),
      ...(targetEmployeeId ? { employeeId: targetEmployeeId } : {}),
    },
    eligibleResolved &&
      Boolean(targetEmployeeId) &&
      selectedMonth != null &&
      selectedYear != null,
  );

  const existingSheet = useMemo(() => {
    const sheet = existingSheetQuery.data?.data?.[0] ?? null;
    if (!sheet || sheet.status === 'CANCELLED') {
      return null;
    }
    return sheet;
  }, [existingSheetQuery.data?.data]);

  const existingKind = useMemo((): 'draft' | 'submitted' | null => {
    if (!existingSheet) {
      return null;
    }
    if (EDITABLE_SHEET_STATUSES.includes(existingSheet.status)) {
      return 'draft';
    }
    if (SUBMITTED_SHEET_STATUSES.includes(existingSheet.status)) {
      return 'submitted';
    }
    return null;
  }, [existingSheet]);

  async function handleOpen(): Promise<void> {
    if (!month || selectedMonth == null || selectedYear == null) {
      messageApi.warning(t('hr.validation.selectMonth'));
      return;
    }
    try {
      const sheet = await openMutation.mutateAsync({
        ...onBehalf.payload,
        month: selectedMonth,
        year: selectedYear,
      });
      setOpenedSheetId(sheet.id);
      router.replace(`/hr/overtime/${sheet.id}`);
    } catch (error: unknown) {
      notifyApiError(error, t('hr.messages.failedToOpenOvertimeSheet'), messageApi);
    }
  }

  function goToExistingSheet(): void {
    if (!existingSheet?.id) {
      return;
    }
    router.push(`/hr/overtime/${existingSheet.id}`);
  }

  const title = onBehalf.employee
    ? t('hr.onBehalf.overtimeTitle', {
        name: formatOnBehalfEmployeeName(onBehalf.employee),
      })
    : t('pages.hr.overtime.new');

  const periodLabel = month ? month.format('MMMM YYYY') : '-';

  const opening = (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl bg-white p-12 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.06)]">
      <Spin size="large" />
      <p className="m-0 text-sm text-[var(--color-text-secondary)]">
        {t('pages.hr.overtime.openingSheet')}
      </p>
    </div>
  );

  return (
    <HrFormPageShell
      title={title}
      description={
        hasOnBehalfAccess
          ? t('hr.onBehalf.overtimeDescription')
          : t('pages.hr.overtime.newDescriptionEmployee')
      }
      cancelLabel={t('hr.buttons.cancel')}
      cancelHref="/approvals/new"
      backLabel={t('hr.buttons.backToList')}
    >
      {!eligibleResolved || openedSheetId ? (
        opening
      ) : existingSheetQuery.isError ? (
        <Alert
          type="error"
          showIcon
          title={
            existingSheetQuery.error instanceof ApiRequestError
              ? existingSheetQuery.error.message
              : t('hr.messages.failedToOpenOvertimeSheet')
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {hasOnBehalfAccess ? <OnBehalfSection state={onBehalf} /> : null}

          <FormLayout
            variant="pro"
            title={
              canPickPastMonths
                ? t('pages.hr.overtime.selectMonth')
                : t('pages.hr.overtime.currentMonth')
            }
            description={
              canPickPastMonths
                ? t('pages.hr.overtime.selectMonthDescription')
                : t('pages.hr.overtime.currentMonthDescription')
            }
          >
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Typography.Text className="mb-1 block text-sm font-medium">
                  {t('hr.onBehalf.month')}
                </Typography.Text>
                {canPickPastMonths ? (
                  <DatePicker
                    picker="month"
                    allowClear={false}
                    disabledDate={disableFutureMonths}
                    value={month}
                    onChange={(value) => {
                      setMonth(value ? value.startOf('month') : currentMonthStart());
                    }}
                  />
                ) : (
                  <Typography.Text className="block text-[15px] font-semibold text-[rgba(0,0,0,0.88)]">
                    {periodLabel}
                  </Typography.Text>
                )}
              </div>
              {existingKind === 'submitted' ? (
                <Button type="primary" onClick={goToExistingSheet}>
                  {t('pages.hr.overtime.openExistingSheet')}
                </Button>
              ) : existingKind === 'draft' ? (
                <Button type="primary" onClick={goToExistingSheet}>
                  {t('pages.hr.overtime.continueDraft')}
                </Button>
              ) : (
                <Button
                  type="primary"
                  // Wait for the existing-sheet check, so a draft is never
                  // reopened without the user choosing "Continue draft".
                  loading={openMutation.isPending || existingSheetQuery.isFetching}
                  disabled={!month}
                  onClick={() => void handleOpen()}
                >
                  {t('hr.onBehalf.openSheet')}
                </Button>
              )}
            </div>

            {existingKind === 'submitted' && existingSheet ? (
              <Alert
                type="warning"
                showIcon
                className="mt-3"
                title={t('pages.hr.overtime.existingSubmittedSheetAlert', {
                  period: periodLabel,
                })}
                action={
                  <Button size="small" onClick={goToExistingSheet}>
                    {t('pages.hr.overtime.openExistingSheet')}
                  </Button>
                }
              />
            ) : null}

            {existingKind === 'draft' && existingSheet ? (
              <Alert
                type="info"
                showIcon
                className="mt-3"
                title={t('pages.hr.overtime.existingDraftSheetAlert', {
                  period: periodLabel,
                })}
                action={
                  <Button size="small" onClick={goToExistingSheet}>
                    {t('pages.hr.overtime.continueDraft')}
                  </Button>
                }
              />
            ) : null}
          </FormLayout>
        </div>
      )}
    </HrFormPageShell>
  );
}
