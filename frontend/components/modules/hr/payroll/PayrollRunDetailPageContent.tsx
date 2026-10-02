'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Button,
  Checkbox,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Steps,
  Switch,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useCanAccessPayroll,
  useCanApprovePayroll,
  useCanCreatePayroll,
  useCanEditPayroll,
  useIsSystemAdmin,
} from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  PayrollEntryDetail,
  PayrollEntryFlag,
  PayrollRunStatus,
} from '@/lib/api/payroll.types';
import {
  useApprovePayrollRun,
  useCancelPayrollRun,
  useGmApprovePayrollRun,
  useMarkPayrollRunPaid,
  useMarkPayrollRunReviewed,
  usePayrollRun,
  useRecalculatePayrollRun,
  useSubmitPayrollRun,
  useUpdatePayrollEntry,
} from '@/lib/query/payroll';
import { useUsersDirectory } from '@/lib/query/users';
import {
  computeLeaveCoveredDays,
  countEntryFlags,
  formatPayrollMoney,
  formatPayrollPeriod,
  payrollFlagLabelKey,
  payrollStatusLabelKey,
  payrollStatusTagStyle,
  parsePayrollMoney,
  PAYROLL_MONEY_CELL_STYLE,
} from '@/lib/utils/payroll-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatUserName } from '@/lib/utils/user-display';

type ConfirmAction =
  | 'recalculate'
  | 'markReviewed'
  | 'submit'
  | 'approve'
  | 'gmApprove'
  | 'markPaid'
  | 'cancel';

function MoneyCell({
  value,
  strong,
}: {
  value: number | string;
  strong?: boolean;
}): React.ReactNode {
  return (
    <span
      style={{
        ...PAYROLL_MONEY_CELL_STYLE,
        fontWeight: strong ? 600 : undefined,
      }}
    >
      {formatPayrollMoney(value)}
    </span>
  );
}

function resolveUserLabel(
  userId: string | null | undefined,
  directory: Map<string, { firstName: string; lastName: string; chineseName: string | null }>,
): string {
  if (!userId) {
    return '—';
  }
  const user = directory.get(userId);
  if (!user) {
    return userId.slice(0, 8);
  }
  return formatUserName(user);
}

export default function PayrollRunDetailPageContent({
  runId,
}: {
  runId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const canAccess = useCanAccessPayroll();
  const canCreate = useCanCreatePayroll();
  const canEdit = useCanEditPayroll();
  const canApprove = useCanApprovePayroll();
  const isSysAdmin = useIsSystemAdmin();

  const detailQuery = usePayrollRun(runId, canAccess);
  const usersQuery = useUsersDirectory({ page: 1, limit: 500 }, { enabled: canAccess });
  const recalculateMutation = useRecalculatePayrollRun(runId);
  const markReviewedMutation = useMarkPayrollRunReviewed(runId);
  const submitMutation = useSubmitPayrollRun(runId);
  const approveMutation = useApprovePayrollRun(runId);
  const gmApproveMutation = useGmApprovePayrollRun(runId);
  const markPaidMutation = useMarkPayrollRunPaid(runId);
  const cancelMutation = useCancelPayrollRun(runId);
  const updateEntryMutation = useUpdatePayrollEntry(runId);

  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [submitAcknowledge, setSubmitAcknowledge] = useState(false);
  const [submitFlagCounts, setSubmitFlagCounts] = useState<Record<string, number> | null>(
    null,
  );
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string | undefined>();
  const [disciplineFilter, setDisciplineFilter] = useState<string | undefined>();
  const [bonusEntry, setBonusEntry] = useState<PayrollEntryDetail | null>(null);
  const [bonusForm] = Form.useForm<{ bonusTopUp: number; bonusTopUpReason: string }>();

  const userDirectory = useMemo(() => {
    const map = new Map<
      string,
      { firstName: string; lastName: string; chineseName: string | null }
    >();
    for (const user of usersQuery.data?.data ?? []) {
      map.set(user.id, user);
    }
    return map;
  }, [usersQuery.data?.data]);

  const run = detailQuery.data;

  const flagCounts = useMemo(
    () => (run ? countEntryFlags(run.entries) : null),
    [run],
  );

  const totalFlagged = useMemo(() => {
    if (!flagCounts) {
      return 0;
    }
    return Object.entries(flagCounts).reduce(
      (sum, [key, count]) => (key === 'NONE' ? sum : sum + count),
      0,
    );
  }, [flagCounts]);

  const departments = useMemo(() => {
    if (!run) {
      return [];
    }
    const names = new Set<string>();
    for (const entry of run.entries) {
      const name = entry.employee.department?.name;
      if (name) {
        names.add(name);
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [run]);

  const disciplines = useMemo(() => {
    if (!run) {
      return [];
    }
    const names = new Set<string>();
    for (const entry of run.entries) {
      const name = entry.employee.engineeringDiscipline?.name;
      if (name) {
        names.add(name);
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [run]);

  const filteredEntries = useMemo(() => {
    if (!run) {
      return [];
    }
    const q = search.trim().toLowerCase();
    return run.entries.filter((entry) => {
      if (flaggedOnly && entry.flag === 'NONE') {
        return false;
      }
      if (departmentFilter && entry.employee.department?.name !== departmentFilter) {
        return false;
      }
      if (
        disciplineFilter &&
        entry.employee.engineeringDiscipline?.name !== disciplineFilter
      ) {
        return false;
      }
      if (!q) {
        return true;
      }
      const name = `${entry.employee.firstName} ${entry.employee.lastName}`.toLowerCase();
      const empId = (entry.employee.employeeId ?? '').toLowerCase();
      return name.includes(q) || empId.includes(q);
    });
  }, [run, search, departmentFilter, disciplineFilter, flaggedOnly]);

  const totalsRow = useMemo(() => {
    if (filteredEntries.length === 0) {
      return null;
    }
    const sum = (pick: (e: PayrollEntryDetail) => number) =>
      filteredEntries.reduce((acc, e) => acc + pick(e), 0);
    return {
      basicSalary: sum((e) => parsePayrollMoney(e.basicSalary)),
      earnedSalary: sum((e) => parsePayrollMoney(e.earnedSalary)),
      totalOtPay: sum((e) => parsePayrollMoney(e.totalOtPay)),
      transport: sum((e) =>
        parsePayrollMoney(e.taxableTransport) + parsePayrollMoney(e.nonTaxableTransport),
      ),
      bonus: sum((e) =>
        parsePayrollMoney(e.monthlyBonus) + parsePayrollMoney(e.bonusTopUp),
      ),
      gross: sum((e) => parsePayrollMoney(e.grossIncome)),
      taxable: sum((e) => parsePayrollMoney(e.taxableIncome)),
      pension: sum((e) => parsePayrollMoney(e.pensionEmployee)),
      tax: sum((e) => parsePayrollMoney(e.incomeTax)),
      net: sum((e) => parsePayrollMoney(e.netPay)),
    };
  }, [filteredEntries]);

  const stepIndex = useMemo(() => {
    const status = run?.status;
    switch (status) {
      case 'DRAFT':
        return 0;
      case 'REVIEWED':
        return 1;
      case 'SUBMITTED':
        return 2;
      case 'APPROVED':
        return 3;
      case 'GM_APPROVED':
        return 4;
      case 'PAID':
        return 5;
      default:
        return 0;
    }
  }, [run?.status]);

  async function runConfirmedAction(): Promise<void> {
    if (!confirmAction || !run) {
      return;
    }
    try {
      switch (confirmAction) {
        case 'recalculate':
          await recalculateMutation.mutateAsync();
          messageApi.success(t('hr.payroll.actions.recalculateSuccess'));
          break;
        case 'markReviewed':
          await markReviewedMutation.mutateAsync();
          messageApi.success(t('hr.payroll.actions.markReviewedSuccess'));
          break;
        case 'submit':
          await submitMutation.mutateAsync({ acknowledgeFlags: submitAcknowledge || undefined });
          messageApi.success(t('hr.payroll.actions.submitSuccess'));
          setSubmitFlagCounts(null);
          setSubmitAcknowledge(false);
          break;
        case 'approve':
          await approveMutation.mutateAsync();
          messageApi.success(t('hr.payroll.actions.approveSuccess'));
          break;
        case 'gmApprove':
          await gmApproveMutation.mutateAsync();
          messageApi.success(t('hr.payroll.actions.gmApproveSuccess'));
          break;
        case 'markPaid':
          await markPaidMutation.mutateAsync();
          messageApi.success(t('hr.payroll.actions.markPaidSuccess'));
          break;
        case 'cancel':
          await cancelMutation.mutateAsync();
          messageApi.success(t('hr.payroll.actions.cancelSuccess'));
          break;
        default:
          break;
      }
      setConfirmAction(null);
    } catch (error) {
      if (
        confirmAction === 'submit' &&
        error instanceof ApiRequestError &&
        error.status === 400
      ) {
        const details = error.details as { flagCounts?: Record<string, number> } | undefined;
        if (details?.flagCounts) {
          setSubmitFlagCounts(details.flagCounts);
          setConfirmAction('submit');
          return;
        }
      }
      notifyApiError(error, 'Request failed', messageApi);
    }
  }

  async function saveBonusTopUp(): Promise<void> {
    if (!bonusEntry) {
      return;
    }
    try {
      const values = await bonusForm.validateFields();
      await updateEntryMutation.mutateAsync({
        entryId: bonusEntry.id,
        payload: {
          bonusTopUp: values.bonusTopUp,
          bonusTopUpReason: values.bonusTopUpReason?.trim(),
        },
      });
      messageApi.success(t('hr.payroll.entry.bonusSaved'));
      setBonusEntry(null);
      bonusForm.resetFields();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        messageApi.error(error.message);
      } else if (!(error as { errorFields?: unknown }).errorFields) {
        notifyApiError(error, 'Request failed', messageApi);
      }
    }
  }

  const columns: ColumnsType<PayrollEntryDetail> = useMemo(
    () => [
      {
        title: t('hr.payroll.entry.employee'),
        key: 'employee',
        fixed: 'left',
        width: 200,
        render: (_, row) => (
          <div className="min-w-[160px]">
            <div className="font-medium">
              {row.employee.firstName} {row.employee.lastName}
            </div>
            <div className="erp-users-cell-sub text-xs">
              {row.employee.employeeId ?? '—'}
            </div>
          </div>
        ),
      },
      {
        title: t('hr.payroll.entry.paidDays'),
        key: 'paidDays',
        width: 88,
        align: 'right',
        render: (_, row) => {
          const leaveCovered = computeLeaveCoveredDays(row);
          return (
            <Tooltip
              title={t('hr.payroll.entry.paidDaysTooltip', {
                employed: parsePayrollMoney(row.employedDays),
                absent: parsePayrollMoney(row.absentDays),
                leaveCovered,
              })}
            >
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                {parsePayrollMoney(row.payrollDays)}
              </span>
            </Tooltip>
          );
        },
      },
      {
        title: t('hr.payroll.entry.basic'),
        dataIndex: 'basicSalary',
        align: 'right',
        width: 100,
        render: (v) => <MoneyCell value={v} />,
      },
      {
        title: t('hr.payroll.entry.earned'),
        dataIndex: 'earnedSalary',
        align: 'right',
        width: 100,
        render: (v) => <MoneyCell value={v} />,
      },
      {
        title: t('hr.payroll.entry.otPay'),
        dataIndex: 'totalOtPay',
        align: 'right',
        width: 100,
        render: (v, row) => (
          <Tooltip
            title={
              <div className="text-xs">
                <div>
                  {t('hr.payroll.entry.otNormal')}: {formatPayrollMoney(row.normalOtPay)} (
                  {parsePayrollMoney(row.normalOtHours)}h)
                </div>
                <div>
                  {t('hr.payroll.entry.otEvening')}: {formatPayrollMoney(row.eveningOtPay)} (
                  {parsePayrollMoney(row.eveningOtHours)}h)
                </div>
                <div>
                  {t('hr.payroll.entry.otSunday')}: {formatPayrollMoney(row.sundayOtPay)} (
                  {parsePayrollMoney(row.sundayOtHours)}h)
                </div>
                <div>
                  {t('hr.payroll.entry.otHoliday')}: {formatPayrollMoney(row.holidayOtPay)} (
                  {parsePayrollMoney(row.holidayOtHours)}h)
                </div>
              </div>
            }
          >
            <span style={PAYROLL_MONEY_CELL_STYLE}>{formatPayrollMoney(v)}</span>
          </Tooltip>
        ),
      },
      {
        title: t('hr.payroll.entry.transport'),
        key: 'transport',
        align: 'right',
        width: 100,
        render: (_, row) => (
          <MoneyCell
            value={
              parsePayrollMoney(row.taxableTransport) +
              parsePayrollMoney(row.nonTaxableTransport)
            }
          />
        ),
      },
      {
        title: t('hr.payroll.entry.bonus'),
        key: 'bonus',
        align: 'right',
        width: 100,
        render: (_, row) => {
          const topUp = parsePayrollMoney(row.bonusTopUp);
          const total =
            parsePayrollMoney(row.monthlyBonus) + topUp;
          return (
            <span style={PAYROLL_MONEY_CELL_STYLE}>
              {formatPayrollMoney(total)}
              {topUp > 0 ? (
                <span style={{ color: 'var(--color-teal-600)', marginLeft: 4 }}>*</span>
              ) : null}
            </span>
          );
        },
      },
      {
        title: t('hr.payroll.entry.gross'),
        dataIndex: 'grossIncome',
        align: 'right',
        width: 100,
        render: (v) => <MoneyCell value={v} />,
      },
      {
        title: t('hr.payroll.entry.taxable'),
        dataIndex: 'taxableIncome',
        align: 'right',
        width: 100,
        render: (v) => <MoneyCell value={v} />,
      },
      {
        title: t('hr.payroll.entry.pensionEmp'),
        dataIndex: 'pensionEmployee',
        align: 'right',
        width: 100,
        render: (v) => <MoneyCell value={v} />,
      },
      {
        title: t('hr.payroll.entry.tax'),
        dataIndex: 'incomeTax',
        align: 'right',
        width: 90,
        render: (v) => <MoneyCell value={v} />,
      },
      {
        title: t('hr.payroll.entry.net'),
        dataIndex: 'netPay',
        align: 'right',
        width: 100,
        render: (v) => <MoneyCell value={v} strong />,
      },
      {
        title: t('hr.payroll.entry.flag'),
        dataIndex: 'flag',
        width: 120,
        render: (flag: PayrollEntryFlag) =>
          flag === 'NONE' ? (
            '—'
          ) : (
            <Tag color="warning" style={{ margin: 0 }}>
              {t(payrollFlagLabelKey(flag))}
            </Tag>
          ),
      },
    ],
    [t],
  );

  function renderExpandedRow(row: PayrollEntryDetail): React.ReactNode {
    const canEditBonus =
      canEdit &&
      run &&
      (run.status === 'DRAFT' || run.status === 'REVIEWED');
    return (
      <div className="grid gap-4 p-2 md:grid-cols-2">
        <Descriptions size="small" column={1} bordered>
          <Descriptions.Item label={t('hr.payroll.entry.department')}>
            {row.employee.department?.name ?? '—'}
          </Descriptions.Item>
          <Descriptions.Item label={t('hr.payroll.entry.discipline')}>
            {row.employee.engineeringDiscipline?.name ?? '—'}
          </Descriptions.Item>
          <Descriptions.Item label={t('hr.payroll.entry.bank')}>
            {row.bankName ?? '—'}
            {row.bankAccountNumber ? ` · ${row.bankAccountNumber}` : ''}
          </Descriptions.Item>
          {row.flagNote ? (
            <Descriptions.Item label={t('hr.payroll.entry.flagNote')}>
              {row.flagNote}
            </Descriptions.Item>
          ) : null}
          {row.notes ? (
            <Descriptions.Item label={t('hr.payroll.entry.notes')}>
              {row.notes}
            </Descriptions.Item>
          ) : null}
        </Descriptions>
        <div>
          <p className="mb-2 text-sm font-medium">{t('hr.payroll.entry.salaryPeriods')}</p>
          {row.salaryPeriods.length === 0 ? (
            <p className="text-sm text-[var(--color-text-tertiary)]">—</p>
          ) : (
            <ul className="m-0 list-none space-y-1 p-0 text-sm">
              {row.salaryPeriods.map((period) => (
                <li key={period.id}>
                  {dayjs(period.periodStart).format('YYYY-MM-DD')} –{' '}
                  {dayjs(period.periodEnd).format('YYYY-MM-DD')}:{' '}
                  {parsePayrollMoney(period.days)} {t('hr.payroll.entry.days')} ·{' '}
                  {formatPayrollMoney(period.earnedSalary, { emptyZero: false })} ETB
                </li>
              ))}
            </ul>
          )}
          <Space className="mt-3" wrap>
            {row.contractId ? (
              <Link href={`/hr/employee-contract/${row.contractId}`}>
                {t('hr.payroll.entry.linkContract')}
              </Link>
            ) : null}
            {row.attendanceRecordId && run ? (
              <Link href={`/hr/attendance/review/${run.month}/${run.year}`}>
                {t('hr.payroll.entry.linkAttendance')}
              </Link>
            ) : null}
            {row.overtimeSheetId ? (
              <Link href={`/hr/overtime/${row.overtimeSheetId}`}>
                {t('hr.payroll.entry.linkOvertime')}
              </Link>
            ) : null}
          </Space>
          {canEditBonus ? (
            <Button
              type="link"
              className="mt-2 px-0"
              onClick={() => {
                setBonusEntry(row);
                bonusForm.setFieldsValue({
                  bonusTopUp: parsePayrollMoney(row.bonusTopUp),
                  bonusTopUpReason: row.bonusTopUpReason ?? '',
                });
              }}
            >
              {t('hr.payroll.entry.editBonusTopUp')}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  function confirmCopy(action: ConfirmAction): { title: string; description: string } {
    switch (action) {
      case 'recalculate':
        return {
          title: t('hr.payroll.confirm.recalculateTitle'),
          description: t('hr.payroll.confirm.recalculateDescription'),
        };
      case 'markReviewed':
        return {
          title: t('hr.payroll.confirm.markReviewedTitle'),
          description: t('hr.payroll.confirm.markReviewedDescription'),
        };
      case 'submit':
        return {
          title: t('hr.payroll.confirm.submitTitle'),
          description: t('hr.payroll.confirm.submitDescription'),
        };
      case 'approve':
        return {
          title: t('hr.payroll.confirm.approveTitle'),
          description: t('hr.payroll.confirm.approveDescription'),
        };
      case 'gmApprove':
        return {
          title: t('hr.payroll.confirm.gmApproveTitle'),
          description: t('hr.payroll.confirm.gmApproveDescription'),
        };
      case 'markPaid':
        return {
          title: t('hr.payroll.confirm.markPaidTitle'),
          description: t('hr.payroll.confirm.markPaidDescription'),
        };
      case 'cancel':
        return {
          title: t('hr.payroll.confirm.cancelTitle'),
          description: t('hr.payroll.confirm.cancelDescription'),
        };
      default:
        return { title: '', description: '' };
    }
  }

  function renderActionButtons(status: PayrollRunStatus): React.ReactNode {
    const buttons: React.ReactNode[] = [];
    const add = (key: string, label: string, action: ConfirmAction, danger?: boolean) => {
      buttons.push(
        <Button
          key={key}
          danger={danger}
          onClick={() => {
            if (action === 'submit' && totalFlagged > 0) {
              setSubmitFlagCounts(
                flagCounts
                  ? Object.fromEntries(
                      Object.entries(flagCounts).filter(([k]) => k !== 'NONE'),
                    )
                  : {},
              );
            }
            setConfirmAction(action);
          }}
        >
          {label}
        </Button>,
      );
    };

    if (status === 'DRAFT' && canCreate) {
      add('recalc', t('hr.payroll.actions.recalculate'), 'recalculate');
      add('review', t('hr.payroll.actions.markReviewed'), 'markReviewed');
      add('cancel', t('hr.payroll.actions.cancel'), 'cancel', true);
    }
    if (status === 'REVIEWED' && canCreate) {
      add('recalc', t('hr.payroll.actions.recalculate'), 'recalculate');
      add('submit', t('hr.payroll.actions.submit'), 'submit');
      add('cancel', t('hr.payroll.actions.cancel'), 'cancel', true);
    }
    if (status === 'SUBMITTED' && (canApprove || isSysAdmin)) {
      add('approve', t('hr.payroll.actions.approve'), 'approve');
    }
    if (status === 'APPROVED' && (canApprove || isSysAdmin)) {
      add('gm', t('hr.payroll.actions.gmApprove'), 'gmApprove');
    }
    if (status === 'GM_APPROVED' && canCreate) {
      add('paid', t('hr.payroll.actions.markPaid'), 'markPaid');
    }

    if (buttons.length === 0) {
      return null;
    }
    return <Space wrap>{buttons}</Space>;
  }

  const confirmLoading =
    recalculateMutation.isPending ||
    markReviewedMutation.isPending ||
    submitMutation.isPending ||
    approveMutation.isPending ||
    gmApproveMutation.isPending ||
    markPaidMutation.isPending ||
    cancelMutation.isPending;

  if (!canAccess) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-payroll-page">
        <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (detailQuery.isLoading && !run) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-payroll-page">
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  if (
    detailQuery.error instanceof ApiRequestError &&
    (detailQuery.error.status === 403 || detailQuery.error.status === 404)
  ) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-payroll-page">
        <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-payroll-page">
        <Alert type="error" showIcon title={t('hr.payroll.detail.notFound')} />
      </div>
    );
  }

  const confirmMeta = confirmAction ? confirmCopy(confirmAction) : null;

  return (
    <div className="erp-pro-list-page erp-users-page erp-payroll-page flex flex-col gap-4">
      <ConfirmDialog
        open={Boolean(confirmAction && confirmAction !== 'submit')}
        title={confirmMeta?.title ?? ''}
        description={confirmMeta?.description ?? ''}
        confirmLabel={t('hr.payroll.confirm.confirmButton')}
        danger={confirmAction === 'cancel'}
        confirmLoading={confirmLoading}
        onConfirm={() => void runConfirmedAction()}
        onCancel={() => setConfirmAction(null)}
      />

      <Modal
        title={t('hr.payroll.confirm.submitTitle')}
        open={confirmAction === 'submit'}
        onCancel={() => {
          setConfirmAction(null);
          setSubmitAcknowledge(false);
          setSubmitFlagCounts(null);
        }}
        onOk={() => void runConfirmedAction()}
        okButtonProps={{
          disabled: totalFlagged > 0 && !submitAcknowledge,
        }}
        confirmLoading={submitMutation.isPending}
      >
        <p>{t('hr.payroll.confirm.submitDescription')}</p>
        {submitFlagCounts && Object.keys(submitFlagCounts).length > 0 ? (
          <ul className="mb-3 list-disc pl-5 text-sm">
            {Object.entries(submitFlagCounts).map(([flag, count]) => (
              <li key={flag}>
                {t(payrollFlagLabelKey(flag as PayrollEntryFlag))}: {count}
              </li>
            ))}
          </ul>
        ) : totalFlagged > 0 && flagCounts ? (
          <ul className="mb-3 list-disc pl-5 text-sm">
            {Object.entries(flagCounts)
              .filter(([k]) => k !== 'NONE')
              .map(([flag, count]) => (
                <li key={flag}>
                  {t(payrollFlagLabelKey(flag as PayrollEntryFlag))}: {count}
                </li>
              ))}
          </ul>
        ) : null}
        {totalFlagged > 0 ? (
          <Checkbox
            checked={submitAcknowledge}
            onChange={(e) => setSubmitAcknowledge(e.target.checked)}
          >
            {t('hr.payroll.confirm.submitAcknowledgeFlags')}
          </Checkbox>
        ) : null}
      </Modal>

      <Modal
        title={t('hr.payroll.entry.editBonusTopUp')}
        open={Boolean(bonusEntry)}
        onCancel={() => {
          setBonusEntry(null);
          bonusForm.resetFields();
        }}
        onOk={() => void saveBonusTopUp()}
        confirmLoading={updateEntryMutation.isPending}
        destroyOnHidden
      >
        <Form form={bonusForm} layout="vertical">
          <Form.Item
            name="bonusTopUp"
            label={t('hr.payroll.entry.bonusTopUpAmount')}
            rules={[{ required: true, message: t('hr.payroll.entry.bonusTopUpRequired') }]}
          >
            <InputNumber min={0} precision={2} className="w-full" />
          </Form.Item>
          <Form.Item
            name="bonusTopUpReason"
            label={t('hr.payroll.entry.bonusTopUpReason')}
            rules={[{ required: true, message: t('hr.payroll.entry.bonusReasonRequired') }]}
          >
            <Input.TextArea rows={3} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>

      <div className="erp-pro-card p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="m-0 text-lg font-semibold">{run.runNumber}</h2>
              <Tag
                bordered={false}
                style={{
                  margin: 0,
                  borderRadius: 999,
                  fontWeight: 500,
                  ...payrollStatusTagStyle(run.status),
                }}
              >
                {t(payrollStatusLabelKey(run.status))}
              </Tag>
            </div>
            <p className="erp-users-cell-sub m-0 mt-1">
              {formatPayrollPeriod(run.month, run.year)}
            </p>
          </div>
          {renderActionButtons(run.status)}
        </div>

        <Steps
          size="small"
          current={stepIndex}
          items={[
            {
              title: t('hr.payroll.steps.draft'),
            },
            {
              title: t('hr.payroll.steps.reviewed'),
            },
            {
              title: t('hr.payroll.steps.submitted'),
              description: run.submittedAt
                ? `${resolveUserLabel(run.submittedBy, userDirectory)} · ${dayjs(run.submittedAt).format('YYYY-MM-DD HH:mm')}`
                : undefined,
            },
            {
              title: t('hr.payroll.steps.hrApproved'),
              description: run.approvedAt
                ? `${resolveUserLabel(run.approvedBy, userDirectory)} · ${dayjs(run.approvedAt).format('YYYY-MM-DD HH:mm')}`
                : undefined,
            },
            {
              title: t('hr.payroll.steps.gmApproved'),
              description: run.gmApprovedAt
                ? `${resolveUserLabel(run.gmApprovedBy, userDirectory)} · ${dayjs(run.gmApprovedAt).format('YYYY-MM-DD HH:mm')}`
                : undefined,
            },
            {
              title: t('hr.payroll.steps.paid'),
              description: run.paidAt
                ? `${resolveUserLabel(run.paidBy, userDirectory)} · ${dayjs(run.paidAt).format('YYYY-MM-DD HH:mm')}`
                : undefined,
            },
          ]}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          {
            label: t('hr.payroll.summary.employees'),
            value: String(run.totalEmployees),
          },
          {
            label: t('hr.payroll.summary.totalGross'),
            value: `${formatPayrollMoney(run.totalGross, { emptyZero: false })} ETB`,
          },
          {
            label: t('hr.payroll.summary.pensionEmp'),
            value: `${formatPayrollMoney(run.totalPensionEmp, { emptyZero: false })} ETB`,
          },
          {
            label: t('hr.payroll.summary.pensionEmr'),
            value: `${formatPayrollMoney(run.totalPensionEmr, { emptyZero: false })} ETB`,
          },
          {
            label: t('hr.payroll.summary.totalTax'),
            value: `${formatPayrollMoney(run.totalTax, { emptyZero: false })} ETB`,
          },
          {
            label: t('hr.payroll.summary.totalNet'),
            value: `${formatPayrollMoney(run.totalNetPay, { emptyZero: false })} ETB`,
          },
        ].map((card) => (
          <div key={card.label} className="erp-pro-card p-3">
            <p className="erp-users-stat-label m-0">{card.label}</p>
            <p className="erp-users-stat-value m-0 mt-1 text-base">{card.value}</p>
          </div>
        ))}
      </div>

      {totalFlagged > 0 ? (
        <Alert
          type="warning"
          showIcon
          title={t('hr.payroll.detail.flaggedBanner', { count: totalFlagged })}
          action={
            <Button size="small" onClick={() => setFlaggedOnly(true)}>
              {t('hr.payroll.detail.showFlaggedOnly')}
            </Button>
          }
        />
      ) : null}

      <div className="erp-pro-card p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Input.Search
            allowClear
            placeholder={t('hr.payroll.entry.searchPlaceholder')}
            onSearch={setSearch}
            style={{ maxWidth: 240 }}
          />
          <Select
            allowClear
            placeholder={t('hr.payroll.entry.filterDepartment')}
            style={{ minWidth: 160 }}
            options={departments.map((d) => ({ value: d, label: d }))}
            value={departmentFilter}
            onChange={setDepartmentFilter}
          />
          <Select
            allowClear
            placeholder={t('hr.payroll.entry.filterDiscipline')}
            style={{ minWidth: 160 }}
            options={disciplines.map((d) => ({ value: d, label: d }))}
            value={disciplineFilter}
            onChange={setDisciplineFilter}
          />
          <span className="flex items-center gap-2 text-sm">
            <Switch size="small" checked={flaggedOnly} onChange={setFlaggedOnly} />
            {t('hr.payroll.entry.flaggedOnly')}
          </span>
        </div>

        <Table<PayrollEntryDetail>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={filteredEntries}
          scroll={{ x: 1400 }}
          sticky
          pagination={false}
          expandable={{
            expandedRowRender: renderExpandedRow,
          }}
          summary={() =>
            totalsRow ? (
              <Table.Summary fixed="bottom">
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}>
                    <strong>{t('hr.payroll.entry.totals')}</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} />
                  <Table.Summary.Cell index={2} align="right">
                    <MoneyCell value={totalsRow.basicSalary} strong />
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">
                    <MoneyCell value={totalsRow.earnedSalary} strong />
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">
                    <MoneyCell value={totalsRow.totalOtPay} strong />
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right">
                    <MoneyCell value={totalsRow.transport} strong />
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="right">
                    <MoneyCell value={totalsRow.bonus} strong />
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={7} align="right">
                    <MoneyCell value={totalsRow.gross} strong />
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={8} align="right">
                    <MoneyCell value={totalsRow.taxable} strong />
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={9} align="right">
                    <MoneyCell value={totalsRow.pension} strong />
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={10} align="right">
                    <MoneyCell value={totalsRow.tax} strong />
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={11} align="right">
                    <MoneyCell value={totalsRow.net} strong />
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={12} />
                </Table.Summary.Row>
              </Table.Summary>
            ) : null
          }
        />
      </div>
    </div>
  );
}
