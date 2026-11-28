'use client';

import './payroll-v2.css';
import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Button,
  Checkbox,
  Dropdown,
  Empty,
  Form,
  Grid,
  Input,
  Modal,
  Popconfirm,
  Select,
  Skeleton,
  Spin,
  Steps,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
} from 'antd';
import type { MenuProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DownloadOutlined,
  FilePdfOutlined,
  RightOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  Landmark,
  PiggyBank,
  Receipt,
  Users,
  Wallet,
} from 'lucide-react';
import dayjs from 'dayjs';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import PayrollCorrectionDrawer from '@/components/modules/hr/payroll/PayrollCorrectionDrawer';
import PayrollRunAdjustmentsTab from '@/components/modules/hr/payroll/PayrollRunAdjustmentsTab';
import PayrollRunHistoryTab from '@/components/modules/hr/payroll/PayrollRunHistoryTab';
import PayrollRemittancePanel from '@/components/modules/hr/payroll/PayrollRemittancePanel';
import PayrollRunWarningsBar, {
  type PayrollRunTab,
} from '@/components/modules/hr/payroll/PayrollRunWarningsBar';
import PayrollEmploymentReviewPanel from '@/components/modules/hr/payroll/PayrollEmploymentReviewPanel';
import PayrollEntryDrawer from '@/components/modules/hr/payroll/PayrollEntryDrawer';
import PayrollAttendanceToggle from '@/components/modules/hr/payroll/PayrollAttendanceToggle';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useCanAccessPayroll,
  useCanApprovePayroll,
  useCanCreatePayroll,
  useCanEditPayroll,
  useCanExportPayroll,
  useCanManagePayrollCorrections,
  useIsSystemAdmin,
} from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import {
  downloadPayrollBankLetter,
  downloadPayrollRunExcel,
  downloadPayslipZip,
  openPayslipPdf,
  previewPayrollBankLetter,
} from '@/lib/api/payroll';
import type {
  MoneyField,
  PayrollEntryDetail,
  PayrollRunPerson,
  PayrollEntryFlag,
  PayrollRunStatus,
} from '@/lib/api/payroll.types';
import {
  useAddPayrollFreelancers,
  useAvailablePayrollFreelancers,
  useRemovePayrollFreelancerEntry,
  useApprovePayrollRun,
  useCancelPayrollRun,
  useCreatePayrollCorrection,
  useGeneratePayslips,
  useGmApprovePayrollRun,
  usePayrollEmploymentReview,
  useMarkPayrollRunPaid,
  useMarkPayrollRunReviewed,
  usePayrollRun,
  usePayrollRuns,
  useRecalculatePayrollRun,
  useUpdatePayrollRun,
  useReleasePayslips,
  useReturnPayrollRunToDraft,
  useSubmitPayrollRun,
  useWithdrawPayrollRun,
} from '@/lib/query/payroll';
import {
  usePayrollRunHistory,
  usePayrollRunWarnings,
  useReopenPayrollRun,
} from '@/lib/query/payroll-adjustments';
import {
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
import { useAuthStore } from '@/stores/auth.store';

type ConfirmAction =
  | 'recalculate'
  | 'markReviewed'
  | 'submit'
  | 'approve'
  | 'gmApprove'
  | 'markPaid'
  | 'withdraw'
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

interface ContractLine {
  key: string;
  label: string;
  title: string;
  days: number;
  basic: number;
  earned: number;
  ot: number;
  transport: number;
  bonus: number;
}

// Shares are rounded to cents; the last share absorbs the remainder so lines sum to the total.
function splitByWeight(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0 || total === 0) {
    return weights.map(() => 0);
  }
  let allocated = 0;
  return weights.map((w, i) => {
    if (i === weights.length - 1) {
      return Math.round((total - allocated) * 100) / 100;
    }
    const share = Math.round(((total * w) / sum) * 100) / 100;
    allocated += share;
    return share;
  });
}

/** Compact period labels for the employees table (one or more contracts). */
function formatContractPeriodLines(row: PayrollEntryDetail): {
  lines: string[];
  title: string;
} | null {
  if (!row.salaryPeriods.length) {
    return null;
  }
  const periods = [...row.salaryPeriods].sort((a, b) =>
    a.periodStart.localeCompare(b.periodStart),
  );
  const lines = periods.map((p) => {
    const start = dayjs(p.periodStart.slice(0, 10));
    const end = dayjs(p.periodEnd.slice(0, 10));
    const days = parsePayrollMoney(p.days);
    const number = p.contract?.contractNumber;
    const range = `${start.format('D MMM')}–${end.format('D MMM')}`;
    return number ? `${number} · ${range} (${days}d)` : `${range} (${days}d)`;
  });
  const title = periods
    .map((p) => {
      const start = dayjs(p.periodStart.slice(0, 10)).format('YYYY-MM-DD');
      const end = dayjs(p.periodEnd.slice(0, 10)).format('YYYY-MM-DD');
      const number = p.contract?.contractNumber;
      return number ? `${number}: ${start} – ${end}` : `${start} – ${end}`;
    })
    .join('\n');
  return { lines, title };
}

// Transport and bonus are Σ(contract amount × days / 30) on the backend, with any
// attendance/leaver scale applied uniformly - so splitting the stored total by
// amount × days reproduces each contract's share exactly.
function buildContractLines(row: PayrollEntryDetail): ContractLine[] | null {
  if (row.salaryPeriods.length < 2) {
    return null;
  }
  const periods = [...row.salaryPeriods].sort((a, b) =>
    a.periodStart.localeCompare(b.periodStart),
  );
  const days = periods.map((p) => parsePayrollMoney(p.days));
  const transport = splitByWeight(
    parsePayrollMoney(row.taxableTransport) + parsePayrollMoney(row.nonTaxableTransport),
    periods.map((p, i) => parsePayrollMoney(p.contract?.transportationAllowance) * days[i]),
  );
  const bonus = splitByWeight(
    parsePayrollMoney(row.monthlyBonus),
    periods.map((p, i) => parsePayrollMoney(p.contract?.monthlyBonus) * days[i]),
  );
  return periods.map((p, i) => {
    const start = dayjs(p.periodStart.slice(0, 10));
    const end = dayjs(p.periodEnd.slice(0, 10));
    return {
      key: p.id,
      label: `${start.format('D')}–${end.format('D MMM')}`,
      title: [
        p.contract?.contractNumber,
        `${start.format('YYYY-MM-DD')} – ${end.format('YYYY-MM-DD')}`,
      ]
        .filter(Boolean)
        .join(' · '),
      days: days[i],
      basic: parsePayrollMoney(p.basicSalary),
      earned: parsePayrollMoney(p.earnedSalary),
      ot: parsePayrollMoney(p.totalOtPay),
      transport: transport[i],
      bonus: bonus[i],
    };
  });
}

/**
 * Net effect of a run's adjustment lines on an entry: bonus and net top-ups
 * and other earnings, less deductions.
 */
function entryAdjustmentsTotal(entry: PayrollEntryDetail): number {
  return (
    parsePayrollMoney(entry.bonusTopUp) +
    parsePayrollMoney(entry.netTopUp) +
    parsePayrollMoney(entry.adjustmentTaxable ?? 0) +
    parsePayrollMoney(entry.adjustmentNonTaxable ?? 0) -
    parsePayrollMoney(entry.adjustmentDeductions ?? 0)
  );
}

const MOBILE_PAGE_SIZE = 20;

/** Name of a person on an approval step (sent with the run). */
function personLabel(
  person: PayrollRunPerson | null | undefined,
  userId: string | null | undefined,
): string {
  if (person) {
    return formatUserName(person);
  }
  return userId ? userId.slice(0, 8) : '-';
}

function StepMeta({ who, when }: { who: string; when: string }): React.ReactNode {
  return (
    <span className="erp-payroll-step-meta">
      <span className="erp-payroll-step-who">{who}</span>
      <span className="erp-payroll-step-when">{dayjs(when).format('YYYY-MM-DD HH:mm')}</span>
    </span>
  );
}

export default function PayrollRunDetailPageContent({
  runId,
}: {
  runId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The open employee lives in the URL (?entry=), so links and refresh reopen it.
  const selectedEntryId = searchParams.get('entry');

  const setSelectedEntry = useCallback(
    (entryId: string | null): void => {
      const params = new URLSearchParams(searchParams.toString());
      if (entryId) {
        params.set('entry', entryId);
      } else {
        params.delete('entry');
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );
  const messageApi = useAppMessage();
  const canAccess = useCanAccessPayroll();
  const canCreate = useCanCreatePayroll();
  const canEdit = useCanEditPayroll();
  const canApprove = useCanApprovePayroll();
  const canExport = useCanExportPayroll();
  const isSysAdmin = useIsSystemAdmin();
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const canManageCorrections = useCanManagePayrollCorrections();

  const detailQuery = usePayrollRun(runId, canAccess);
  const runsQuery = usePayrollRuns(canAccess && canManageCorrections);
  const screens = Grid.useBreakpoint();
  const isPhone = screens.md === false;
  const recalculateMutation = useRecalculatePayrollRun(runId);
  const updateRunMutation = useUpdatePayrollRun(runId);
  const markReviewedMutation = useMarkPayrollRunReviewed(runId);
  const submitMutation = useSubmitPayrollRun(runId);
  const approveMutation = useApprovePayrollRun(runId);
  const gmApproveMutation = useGmApprovePayrollRun(runId);
  const markPaidMutation = useMarkPayrollRunPaid(runId);
  const cancelMutation = useCancelPayrollRun(runId);
  const createCorrectionMutation = useCreatePayrollCorrection(runId);
  const reopenMutation = useReopenPayrollRun(runId);
  const returnToDraftMutation = useReturnPayrollRunToDraft(runId);
  const withdrawMutation = useWithdrawPayrollRun(runId);
  const generatePayslipsMutation = useGeneratePayslips(runId);
  const releasePayslipsMutation = useReleasePayslips(runId);
  const addFreelancersMutation = useAddPayrollFreelancers(runId);
  const removeFreelancerMutation = useRemovePayrollFreelancerEntry(runId);
  const [freelancerModalOpen, setFreelancerModalOpen] = useState(false);
  const [freelancerSelection, setFreelancerSelection] = useState<string[]>([]);
  const [removingEntry, setRemovingEntry] = useState<PayrollEntryDetail | null>(null);
  const availableFreelancersQuery = useAvailablePayrollFreelancers(
    runId,
    freelancerModalOpen,
  );

  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
  const [correctionNote, setCorrectionNote] = useState('');
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [activeTab, setActiveTab] = useState<PayrollRunTab>('summary');
  const warningsQuery = usePayrollRunWarnings(runId, canAccess && (canCreate || canEdit || canApprove));
  const historyQuery = usePayrollRunHistory(runId, canAccess);
  const [submitAcknowledge, setSubmitAcknowledge] = useState(false);
  // Submit / HR approve / GM approve need an explicit review of employment-flagged entries.
  const reviewStep =
    confirmAction === 'submit' || confirmAction === 'approve' || confirmAction === 'gmApprove';
  const employmentReviewQuery = usePayrollEmploymentReview(runId, reviewStep);
  const employmentReview = employmentReviewQuery.data ?? [];
  const [employmentReviewed, setEmploymentReviewed] = useState(false);
  const reviewBlocked =
    employmentReviewQuery.isLoading || (employmentReview.length > 0 && !employmentReviewed);
  const confirmEmploymentReview = employmentReviewed ? employmentReview.length : undefined;
  const [submitFlagCounts, setSubmitFlagCounts] = useState<Record<string, number> | null>(
    null,
  );
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [changedOnly, setChangedOnly] = useState(false);
  const [mobilePage, setMobilePage] = useState<{ key: string; count: number }>({
    key: '',
    count: MOBILE_PAGE_SIZE,
  });
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string | undefined>();
  const [disciplineFilter, setDisciplineFilter] = useState<string | undefined>();
  const [exporting, setExporting] = useState(false);
  const [bankLetterLoading, setBankLetterLoading] = useState(false);
  const [bankLetterWarn, setBankLetterWarn] = useState<{
    excludedNames: string[];
    includedCount: number;
  } | null>(null);
  const [zipping, setZipping] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [openingPayslipId, setOpeningPayslipId] = useState<string | null>(null);

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

  const payslipCounts = useMemo(() => {
    let generated = 0;
    let released = 0;
    let downloaded = 0;
    for (const entry of run?.entries ?? []) {
      if (!entry.payslip?.generatedAt) {
        continue;
      }
      generated += 1;
      if (entry.payslip.releasedAt) {
        released += 1;
      }
      if (entry.payslip.downloadedAt) {
        downloaded += 1;
      }
    }
    return {
      generated,
      released,
      downloaded,
      pendingRelease: generated - released,
    };
  }, [run]);

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
      if (
        changedOnly &&
        parsePayrollMoney(entry.deltaAmount) === 0
      ) {
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
      const name = formatUserName(entry.employee).toLowerCase();
      const empId = (entry.employee.employeeId ?? '').toLowerCase();
      return name.includes(q) || empId.includes(q);
    });
  }, [run, search, departmentFilter, disciplineFilter, flaggedOnly, changedOnly]);

  // Phone card list shows a page at a time; any filter change starts over.
  const mobileFilterKey = [search, departmentFilter, disciplineFilter, flaggedOnly, changedOnly].join('|');
  const mobileVisible =
    mobilePage.key === mobileFilterKey ? mobilePage.count : MOBILE_PAGE_SIZE;

  const hasEntryFilters =
    Boolean(search.trim()) ||
    departmentFilter !== undefined ||
    disciplineFilter !== undefined ||
    flaggedOnly ||
    changedOnly;

  function resetEntryFilters(): void {
    setSearch('');
    setDepartmentFilter(undefined);
    setDisciplineFilter(undefined);
    setFlaggedOnly(false);
    setChangedOnly(false);
  }

  const totalsRow = useMemo(() => {
    if (filteredEntries.length === 0) {
      return null;
    }
    const sum = (pick: (e: PayrollEntryDetail) => number) =>
      filteredEntries.reduce((acc, e) => acc + pick(e), 0);
    return {
      monthlyBonus: sum((e) => parsePayrollMoney(e.monthlyBonus)),
      gross: sum((e) => parsePayrollMoney(e.grossIncome)),
      pension: sum((e) => parsePayrollMoney(e.pensionEmployee)),
      pensionEmployer: sum((e) => parsePayrollMoney(e.pensionEmployer)),
      tax: sum((e) => parsePayrollMoney(e.incomeTax)),
      adjustments: sum(entryAdjustmentsTotal),
      net: sum((e) => parsePayrollMoney(e.netPay)),
      original: sum((e) => parsePayrollMoney(e.originalAmount ?? 0)),
      delta: sum((e) => parsePayrollMoney(e.deltaAmount ?? 0)),
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
          await submitMutation.mutateAsync({
            acknowledgeFlags: submitAcknowledge || undefined,
            confirmEmploymentReview,
          });
          messageApi.success(t('hr.payroll.actions.submitSuccess'));
          setSubmitFlagCounts(null);
          setSubmitAcknowledge(false);
          break;
        case 'approve':
          await approveMutation.mutateAsync({ confirmEmploymentReview });
          messageApi.success(t('hr.payroll.actions.approveSuccess'));
          break;
        case 'gmApprove':
          await gmApproveMutation.mutateAsync({ confirmEmploymentReview });
          messageApi.success(t('hr.payroll.actions.gmApproveSuccess'));
          break;
        case 'markPaid':
          await markPaidMutation.mutateAsync();
          messageApi.success(t('hr.payroll.actions.markPaidSuccess'));
          break;
        case 'withdraw':
          await withdrawMutation.mutateAsync();
          messageApi.success(t('hr.payroll.actions.withdrawSuccess'));
          break;
        case 'cancel':
          await cancelMutation.mutateAsync();
          messageApi.success(t('hr.payroll.actions.cancelSuccess'));
          break;
        default:
          break;
      }
      setConfirmAction(null);
      setEmploymentReviewed(false);
    } catch (error) {
      if (
        error instanceof ApiRequestError &&
        error.status === 400 &&
        (error.details as { code?: string } | undefined)?.code === 'EMPLOYMENT_REVIEW_REQUIRED'
      ) {
        // The list changed since it was shown: reload it and ask again.
        setEmploymentReviewed(false);
        void employmentReviewQuery.refetch();
        notifyApiError(error, 'Request failed', messageApi);
        return;
      }
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

  async function downloadBankLetterFile(
    runId: string,
    year: number,
    month: number,
    runNumber: string,
  ): Promise<void> {
    const mm = String(month).padStart(2, '0');
    const safeRun = runNumber.replace(/[^\w.-]+/g, '_');
    const filename = `Bank_Letter_${year}_${mm}_${safeRun}.docx`;
    setBankLetterLoading(true);
    try {
      const result = await downloadPayrollBankLetter(runId, filename);
      messageApi.success(
        result.refNo
          ? t('hr.payroll.actions.exportBankLetterSuccessRef', {
              ref: result.refNo,
            })
          : t('hr.payroll.actions.exportBankLetterSuccess'),
      );
      if (result.excludedAccounts.length > 0) {
        messageApi.warning(
          t('hr.payroll.actions.exportBankLetterExcluded', {
            count: result.excludedAccounts.length,
            names: result.excludedAccounts.join(', '),
          }),
        );
      }
    } finally {
      setBankLetterLoading(false);
    }
  }

  const showPayslipColumn =
    canCreate &&
    (run?.status === 'GM_APPROVED' || run?.status === 'PAID');
  const canChangeRun =
    canCreate &&
    Boolean(run) &&
    run?.status !== 'PAID' &&
    run?.status !== 'CANCELLED' &&
    run?.status !== 'SUPERSEDED';
  const runInApproval =
    run?.status === 'SUBMITTED' || run?.status === 'APPROVED' || run?.status === 'GM_APPROVED';
  const canOverrideDays = canEdit && (run?.status === 'DRAFT' || run?.status === 'REVIEWED');
  const overriddenEntryCount = run?.entries.filter((e) => e.hasOverride).length ?? 0;
  const isCorrectionRun = run?.type === 'CORRECTION';
  const isLockedRegular =
    run?.type !== 'CORRECTION' &&
    (run?.status === 'GM_APPROVED' || run?.status === 'PAID');
  const existingCorrection = useMemo(() => {
    if (!run || !runsQuery.data) {
      return null;
    }
    return (
      runsQuery.data.find(
        (item) =>
          item.type === 'CORRECTION' &&
          item.originalRunId === run.id &&
          item.status !== 'CANCELLED',
      ) ?? null
    );
  }, [run, runsQuery.data]);

  async function addSelectedFreelancers(): Promise<void> {
    try {
      await addFreelancersMutation.mutateAsync(freelancerSelection);
      messageApi.success(
        t('hr.payroll.freelancers.added', { count: freelancerSelection.length }),
      );
      setFreelancerModalOpen(false);
      setFreelancerSelection([]);
    } catch (error) {
      notifyApiError(error, t('hr.payroll.freelancers.add'), messageApi, t);
    }
  }

  async function removeFreelancerEntry(): Promise<void> {
    if (!removingEntry) {
      return;
    }
    try {
      await removeFreelancerMutation.mutateAsync(removingEntry.id);
      messageApi.success(t('hr.payroll.freelancers.removed'));
      setRemovingEntry(null);
    } catch (error) {
      notifyApiError(error, t('hr.payroll.freelancers.remove'), messageApi, t);
    }
  }

  async function openPayslip(payslipId: string): Promise<void> {
    setOpeningPayslipId(payslipId);
    try {
      await openPayslipPdf(payslipId);
    } catch (error) {
      notifyApiError(error, t('hr.payroll.payslips.openPdf'), messageApi, t);
    } finally {
      setOpeningPayslipId(null);
    }
  }

  const [correctionEntryId, setCorrectionEntryId] = useState<string | null>(null);
  const openEntry = useCallback(
    (entryId: string): void => {
      if (run?.type === 'CORRECTION') {
        setCorrectionEntryId(entryId);
      } else {
        setSelectedEntry(entryId);
      }
    },
    [run?.type, setSelectedEntry, setCorrectionEntryId],
  );

  const contractLinesById = useMemo(
    () => new Map(filteredEntries.map((e) => [e.id, buildContractLines(e)])),
    [filteredEntries],
  );
  const contractPeriodLinesById = useMemo(
    () => new Map(filteredEntries.map((e) => [e.id, formatContractPeriodLines(e)])),
    [filteredEntries],
  );

  // Essentials only; the full component breakdown is in the entry drawer
  // (correction runs: the paid vs corrected drawer).
  const columns: ColumnsType<PayrollEntryDetail> = useMemo(
    () => [
      {
        title: t('hr.payroll.entry.employee'),
        key: 'employee',
        fixed: 'left',
        width: 240,
        className: 'erp-payroll-col-employee',
        render: (_, row) => {
          const lines = contractLinesById.get(row.id);
          return (
            <div className="min-w-[160px]">
              <p className="erp-payroll-employee-name truncate">
                {formatUserName(row.employee)}
              </p>
              <p className="erp-payroll-employee-id">
                {row.employee.employeeId ?? '-'}
              </p>
              {row.employee.employeeType === 'FREELANCER' ? (
                <span className="erp-payroll-split-pill erp-payroll-freelancer-pill">
                  {t('hr.payroll.freelancers.tag')}
                </span>
              ) : null}
              {row.settlementOnly ? (
                <span className="erp-payroll-split-pill">
                  {t('hr.payroll.settlementOnly.tag')}
                </span>
              ) : null}
              {row.settlementOnly && parsePayrollMoney(row.netPay) < -0.005 ? (
                <span className="erp-payroll-split-pill erp-payroll-freelancer-pill">
                  {t('hr.payroll.settlementOnly.collect')}
                </span>
              ) : null}
              {lines ? (
                <span className="erp-payroll-split-pill">
                  {t('hr.payroll.entry.contractsCount', { count: lines.length })}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        title: t('hr.payroll.entry.paidDays'),
        key: 'paidDays',
        align: 'right',
        width: 100,
        render: (_: unknown, row: PayrollEntryDetail) => {
          const paid = parsePayrollMoney(row.payrollDays);
          const employed = parsePayrollMoney(row.employedDays);
          const absent = parsePayrollMoney(row.absentDays);
          return (
            <Tooltip
              title={t('hr.payroll.entry.paidDaysTooltip', {
                employed,
                absent,
                paid,
              })}
            >
              <span className="erp-payroll-num">
                {formatPayrollMoney(paid, { emptyZero: false })}
                {row.hasOverride ? (
                  <Tag color="orange" className="erp-payroll-edited-tag ml-1">
                    {t('hr.payroll.entry.daysOverride.edited')}
                  </Tag>
                ) : null}
              </span>
            </Tooltip>
          );
        },
      },
      {
        title: t('hr.payroll.entry.contractPeriods'),
        key: 'contractPeriods',
        width: 200,
        render: (_: unknown, row: PayrollEntryDetail) => {
          const periods = contractPeriodLinesById.get(row.id);
          if (!periods) {
            return <span className="erp-payroll-num erp-payroll-num--muted">-</span>;
          }
          return (
            <Tooltip title={<span className="whitespace-pre-line">{periods.title}</span>}>
              <div className="erp-payroll-period-lines">
                {periods.lines.map((line) => (
                  <p key={line} className="m-0 text-[12px] leading-snug text-[var(--color-text-secondary)]">
                    {line}
                  </p>
                ))}
              </div>
            </Tooltip>
          );
        },
      },
      ...(isCorrectionRun
        ? [
            {
              title: t('hr.payroll.correctionLines.paid'),
              dataIndex: 'originalAmount' as const,
              align: 'right' as const,
              width: 130,
              render: (v: MoneyField | null | undefined) => <MoneyCell value={v ?? 0} />,
            },
            {
              title: t('hr.payroll.correctionLines.corrected'),
              dataIndex: 'netPay' as const,
              align: 'right' as const,
              width: 130,
              render: (v: MoneyField) => <MoneyCell value={v} />,
            },
            {
              title: t('hr.payroll.correctionLines.netDifference'),
              dataIndex: 'deltaAmount' as const,
              align: 'right' as const,
              width: 140,
              className: 'erp-payroll-col-net',
              render: (v: MoneyField | null | undefined) => {
                const value = parsePayrollMoney(v ?? 0);
                return (
                  <span
                    className={`erp-payroll-num${Math.abs(value) >= 0.005 ? ' font-semibold' : ' erp-payroll-num--muted'}`}
                  >
                    {value > 0 ? '+' : value < 0 ? '−' : ''}
                    {formatPayrollMoney(Math.abs(value), { emptyZero: false })}
                  </span>
                );
              },
            },
          ]
        : [
            {
              title: t('hr.payroll.entry.monthlyBonus'),
              dataIndex: 'monthlyBonus' as const,
              align: 'right' as const,
              width: 120,
              render: (v: MoneyField) => <MoneyCell value={v} />,
            },
            {
              title: t('hr.payroll.entry.gross'),
              dataIndex: 'grossIncome' as const,
              align: 'right' as const,
              width: 130,
              className: 'erp-payroll-col-gross',
              render: (v: MoneyField) => <MoneyCell value={v} />,
            },
            {
              title: t('hr.payroll.entry.pensionEmp'),
              dataIndex: 'pensionEmployee' as const,
              align: 'right' as const,
              width: 140,
              render: (v: MoneyField) => <MoneyCell value={v} />,
            },
            {
              title: t('hr.payroll.entry.pensionEmr'),
              dataIndex: 'pensionEmployer' as const,
              align: 'right' as const,
              width: 140,
              render: (v: MoneyField) => <MoneyCell value={v} />,
            },
            {
              title: t('hr.payroll.entry.tax'),
              dataIndex: 'incomeTax' as const,
              align: 'right' as const,
              width: 116,
              render: (v: MoneyField) => <MoneyCell value={v} />,
            },
            {
              title: t('hr.payroll.adjustments.column'),
              key: 'adjustments',
              align: 'right' as const,
              width: 124,
              render: (_: unknown, row: PayrollEntryDetail) => {
                const value = entryAdjustmentsTotal(row);
                if (Math.abs(value) < 0.005) {
                  return <span className="erp-payroll-num erp-payroll-num--muted">-</span>;
                }
                return (
                  <span className="erp-payroll-num">
                    {value > 0 ? '+' : '−'}
                    {formatPayrollMoney(Math.abs(value), { emptyZero: false })}
                  </span>
                );
              },
            },
            {
              title: t('hr.payroll.entry.net'),
              dataIndex: 'netPay' as const,
              align: 'right' as const,
              width: 136,
              className: 'erp-payroll-col-net',
              render: (v: MoneyField) => <MoneyCell value={v} strong />,
            },
          ]),
      {
        title: t('hr.payroll.entry.flag'),
        dataIndex: 'flag',
        width: 130,
        render: (flag: PayrollEntryFlag) =>
          flag === 'NONE' ? (
            '-'
          ) : (
            <Tag variant="filled" className="erp-payroll-flag">
              {t(payrollFlagLabelKey(flag))}
            </Tag>
          ),
      },
      ...(showPayslipColumn
        ? [
            {
              title: t('hr.payroll.payslips.column'),
              key: 'payslip',
              width: 72,
              align: 'center' as const,
              render: (_: unknown, row: PayrollEntryDetail) => {
                const payslipId = row.payslip?.generatedAt ? row.payslip.id : null;
                if (!payslipId) {
                  return '-';
                }
                return (
                  <Tooltip title={t('hr.payroll.payslips.openPdf')}>
                    <Button
                      type="text"
                      icon={<FilePdfOutlined />}
                      aria-label={t('hr.payroll.payslips.openPdf')}
                      loading={openingPayslipId === payslipId}
                      onClick={() => void openPayslip(payslipId)}
                    />
                  </Tooltip>
                );
              },
            },
          ]
        : []),
      {
        title: <span className="sr-only">{t('hr.payroll.entryDrawer.open')}</span>,
        key: 'details',
        fixed: 'right',
        width: 52,
        align: 'center',
        className: 'erp-payroll-col-details',
        render: (_: unknown, row: PayrollEntryDetail) => (
          <Tooltip title={t('hr.payroll.entryDrawer.open')}>
            <Button
              type="text"
              size="small"
              icon={<RightOutlined />}
              aria-label={t('hr.payroll.entryDrawer.openFor', {
                name: formatUserName(row.employee),
              })}
              onClick={(event) => {
                event.stopPropagation();
                openEntry(row.id);
              }}
            />
          </Tooltip>
        ),
      },
    ],
    [
      t,
      showPayslipColumn,
      openingPayslipId,
      contractLinesById,
      contractPeriodLinesById,
      isCorrectionRun,
      openEntry,
    ],
  );

  // Integer scroll width = sum of leaf widths so header / body / footer share
  // one colgroup (fractional max-content widths drift between the three tables).
  const entriesScrollX = useMemo((): number => {
    const leafWidth = (cols: ColumnsType<PayrollEntryDetail>): number =>
      cols.reduce((sum, col) => {
        if (col.children && col.children.length > 0) {
          return sum + leafWidth(col.children);
        }
        return sum + (typeof col.width === 'number' ? col.width : 0);
      }, 0);
    return leafWidth(columns);
  }, [columns]);

  function renderEntryCard(entry: PayrollEntryDetail): React.ReactNode {
    const payslipId =
      showPayslipColumn && entry.payslip?.generatedAt ? entry.payslip.id : null;
    return (
      <li key={entry.id} className="erp-payroll-entry-card">
        <div className="erp-payroll-entry-card-head">
          <div className="min-w-0">
            <p className="erp-payroll-employee-name truncate">
              {formatUserName(entry.employee)}
            </p>
            <p className="erp-payroll-employee-id">{entry.employee.employeeId ?? '-'}</p>
            {entry.settlementOnly ? (
              <span className="erp-payroll-split-pill">{t('hr.payroll.settlementOnly.tag')}</span>
            ) : null}
            {entry.settlementOnly && parsePayrollMoney(entry.netPay) < -0.005 ? (
              <span className="erp-payroll-split-pill erp-payroll-freelancer-pill">
                {t('hr.payroll.settlementOnly.collect')}
              </span>
            ) : null}
          </div>
          {entry.flag !== 'NONE' ? (
            <Tag variant="filled" className="erp-payroll-flag">
              {t(payrollFlagLabelKey(entry.flag))}
            </Tag>
          ) : null}
        </div>
        <div className="erp-payroll-entry-card-net">
          <span>{t('hr.payroll.entry.net')}</span>
          <strong>
            {formatPayrollMoney(entry.netPay, { emptyZero: false })}
            <small>ETB</small>
          </strong>
        </div>
        <dl className="erp-payroll-entry-card-grid">
          <div>
            <dt>{t('hr.payroll.entry.paidDays')}</dt>
            <dd>
              {parsePayrollMoney(entry.payrollDays)}
              {entry.hasOverride ? (
                <Tag color="orange" className="erp-payroll-edited-tag">
                  {t('hr.payroll.entry.daysOverride.edited')}
                </Tag>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>{t('hr.payroll.entry.gross')}</dt>
            <dd>{formatPayrollMoney(entry.grossIncome)}</dd>
          </div>
          <div>
            <dt>{t('hr.payroll.entry.tax')}</dt>
            <dd>{formatPayrollMoney(entry.incomeTax)}</dd>
          </div>
          <div>
            <dt>{t('hr.payroll.entry.pensionEmp')}</dt>
            <dd>{formatPayrollMoney(entry.pensionEmployee)}</dd>
          </div>
          <div>
            <dt>{t('hr.payroll.entry.pensionEmr')}</dt>
            <dd>{formatPayrollMoney(entry.pensionEmployer)}</dd>
          </div>
        </dl>
        <div className="erp-payroll-entry-card-actions">
          {payslipId ? (
            <Button
              size="small"
              icon={<FilePdfOutlined />}
              loading={openingPayslipId === payslipId}
              onClick={() => void openPayslip(payslipId)}
            >
              {t('hr.payroll.payslips.column')}
            </Button>
          ) : null}
          <Button
            size="small"
            type="primary"
            ghost
            icon={<RightOutlined />}
            iconPlacement="end"
            onClick={() => openEntry(entry.id)}
          >
            {t('hr.payroll.detail.showDetails')}
          </Button>
        </div>
      </li>
    );
  }

  /**
   * Footer cells in the same leaf order as `columns` so header / body / totals
   * share one colgroup. Blank cells keep paid-days, periods, flag, and actions
   * aligned without inventing totals for them.
   */
  function summaryCells(totals: NonNullable<typeof totalsRow>): Array<{
    content?: React.ReactNode;
    align?: 'right' | 'center';
    className?: string;
  }> {
    const money = (value: number): { content: React.ReactNode; align: 'right' } => ({
      content: <MoneyCell value={value} strong />,
      align: 'right',
    });
    const signedMoney = (value: number): { content: React.ReactNode; align: 'right' } => ({
      content: (
        <strong className="erp-payroll-num">
          {value > 0 ? '+' : value < 0 ? '−' : ''}
          {formatPayrollMoney(Math.abs(value), { emptyZero: false })}
        </strong>
      ),
      align: 'right',
    });
    const blank = (): { content?: React.ReactNode } => ({});
    return [
      { content: <strong>{t('hr.payroll.entry.totals')}</strong> },
      blank(), // paid days
      blank(), // contract periods
      ...(isCorrectionRun
        ? [
            money(totals.original),
            money(totals.net),
            { ...signedMoney(totals.delta), className: 'erp-payroll-col-net' },
          ]
        : [
            money(totals.monthlyBonus),
            { ...money(totals.gross), className: 'erp-payroll-col-gross' },
            money(totals.pension),
            money(totals.pensionEmployer),
            money(totals.tax),
            signedMoney(totals.adjustments),
            { ...money(totals.net), className: 'erp-payroll-col-net' },
          ]),
      blank(), // flag
      ...(showPayslipColumn ? [blank()] : []),
      blank(), // details
    ];
  }

  function confirmCopy(action: ConfirmAction): { title: string; description: string } {
    switch (action) {
      case 'recalculate':
        return {
          title: t('hr.payroll.confirm.recalculateTitle'),
          description: [
            runInApproval
              ? t('hr.payroll.confirm.recalculateReopenDescription')
              : t('hr.payroll.confirm.recalculateDescription'),
            overriddenEntryCount > 0
              ? t('hr.payroll.confirm.recalculateOverridesWarning', {
                  count: overriddenEntryCount,
                })
              : '',
          ]
            .filter(Boolean)
            .join(' '),
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
      case 'withdraw':
        return {
          title: t('hr.payroll.confirm.withdrawTitle'),
          description: t('hr.payroll.confirm.withdrawDescription'),
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
    const add = (
      key: string,
      label: string,
      action: ConfirmAction,
      variant: 'primary' | 'default' | 'danger' = 'default',
    ) => {
      buttons.push(
        <Button
          key={key}
          type={variant === 'primary' ? 'primary' : 'default'}
          danger={variant === 'danger'}
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

    if (canExport && status !== 'CANCELLED' && run) {
      const bankLetterEnabled =
        status === 'GM_APPROVED' || status === 'PAID';
      const exportItems: MenuProps['items'] = [
        {
          key: 'excel',
          label: t('hr.payroll.actions.exportSalarySheet'),
          onClick: () => {
            void (async () => {
              const mm = String(run.month).padStart(2, '0');
              const safeRun = run.runNumber.replace(/[^\w.-]+/g, '_');
              const filename = `Payroll_${run.year}_${mm}_${safeRun}.xlsx`;
              setExporting(true);
              try {
                await downloadPayrollRunExcel(run.id, filename);
                messageApi.success(t('hr.payroll.actions.exportExcelSuccess'));
              } catch (error) {
                notifyApiError(
                  error,
                  t('hr.payroll.actions.exportExcel'),
                  messageApi,
                  t,
                );
              } finally {
                setExporting(false);
              }
            })();
          },
        },
        {
          key: 'bank-letter',
          label: t('hr.payroll.actions.exportBankLetter'),
          disabled: !bankLetterEnabled,
          onClick: () => {
            if (!bankLetterEnabled) {
              return;
            }
            void (async () => {
              setBankLetterLoading(true);
              try {
                const preview = await previewPayrollBankLetter(run.id);
                if ((preview.collectFromEmployees?.length ?? 0) > 0) {
                  // Recoveries on settlement-only rows can't be paid: they are collected, then Record receipt.
                  messageApi.info(
                    t('hr.payroll.settlementOnly.bankLetterCollect', {
                      names: (preview.collectFromEmployees ?? []).map((e) => e.name).join(', '),
                    }),
                  );
                }
                if (preview.excludedEmployees.length > 0) {
                  setBankLetterWarn({
                    excludedNames: preview.excludedEmployees.map((e) => e.name),
                    includedCount: preview.includedCount,
                  });
                  return;
                }
                await downloadBankLetterFile(run.id, run.year, run.month, run.runNumber);
              } catch (error) {
                notifyApiError(
                  error,
                  t('hr.payroll.actions.exportBankLetter'),
                  messageApi,
                  t,
                );
              } finally {
                setBankLetterLoading(false);
              }
            })();
          },
        },
      ];
      buttons.push(
        <Dropdown
          key="export"
          menu={{ items: exportItems }}
          trigger={['click']}
          disabled={exporting || bankLetterLoading}
        >
          <Button
            icon={<DownloadOutlined />}
            loading={exporting || bankLetterLoading}
          >
            {t('hr.payroll.actions.exportMenu')}
          </Button>
        </Dropdown>,
      );
    }

    // Secondary actions first, the next workflow step last as the primary button.
    if (status === 'DRAFT' && canCreate) {
      add('cancel', t('hr.payroll.actions.cancel'), 'cancel', 'danger');
      add('recalc', t('hr.payroll.actions.recalculate'), 'recalculate');
      add('review', t('hr.payroll.actions.markReviewed'), 'markReviewed', 'primary');
    }
    if (status === 'REVIEWED' && canCreate) {
      add('cancel', t('hr.payroll.actions.cancel'), 'cancel', 'danger');
      add('recalc', t('hr.payroll.actions.recalculate'), 'recalculate');
      add('submit', t('hr.payroll.actions.submit'), 'submit', 'primary');
    }
    // Recalculating sends a submitted run back to draft. An approved run can't
    // be recalculated or deleted: it is reopened as a new version.
    if (status === 'SUBMITTED' && canCreate) {
      add('recalc', t('hr.payroll.actions.recalculate'), 'recalculate');
    }
    if ((status === 'APPROVED' || status === 'GM_APPROVED') && (canApprove || isSysAdmin)) {
      buttons.push(
        <Button
          key="reopen"
          onClick={() => {
            setReopenReason('');
            setReopenModalOpen(true);
          }}
          loading={reopenMutation.isPending}
        >
          {t('hr.payroll.reopen.action')}
        </Button>,
      );
    }
    if (
      status === 'SUBMITTED' &&
      canCreate &&
      currentUserId !== null &&
      run?.submittedBy === currentUserId
    ) {
      add('withdraw', t('hr.payroll.actions.withdraw'), 'withdraw');
    }
    if (status === 'SUBMITTED' && canApprove) {
      buttons.push(
        <Button
          key="returnToDraft"
          onClick={() => {
            setReturnReason('');
            setReturnModalOpen(true);
          }}
          loading={returnToDraftMutation.isPending}
        >
          {t('hr.payroll.actions.returnToDraft')}
        </Button>,
      );
    }
    if (status === 'SUBMITTED' && (canApprove || isSysAdmin)) {
      add('approve', t('hr.payroll.actions.approve'), 'approve', 'primary');
    }
    if (status === 'APPROVED' && (canApprove || isSysAdmin)) {
      add('gm', t('hr.payroll.actions.gmApprove'), 'gmApprove', 'primary');
    }
    if (status === 'GM_APPROVED' && canCreate && !isCorrectionRun) {
      add('paid', t('hr.payroll.actions.markPaid'), 'markPaid', 'primary');
    }
    if (status === 'SUPERSEDED') {
      return null;
    }
    if (isLockedRegular && canManageCorrections) {
      buttons.push(
        <Button
          key="correction"
          type="primary"
          onClick={() => {
            setCorrectionNote('');
            setCorrectionModalOpen(true);
          }}
          loading={createCorrectionMutation.isPending}
        >
          {existingCorrection
            ? t('hr.payroll.actions.rerunCorrection')
            : t('hr.payroll.actions.createCorrection')}
        </Button>,
      );
    }

    if (buttons.length === 0) {
      return null;
    }
    return <div className="erp-payroll-hero-actions">{buttons}</div>;
  }

  const confirmLoading =
    recalculateMutation.isPending ||
    markReviewedMutation.isPending ||
    submitMutation.isPending ||
    approveMutation.isPending ||
    gmApproveMutation.isPending ||
    markPaidMutation.isPending ||
    withdrawMutation.isPending ||
    cancelMutation.isPending;

  if (!canAccess) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-payroll-page erp-payroll-v2">
        <ErpNotice tone="warning" title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (detailQuery.isLoading && !run) {
    // Page-shaped placeholder so the layout does not jump when data arrives.
    return (
      <div
        className="erp-pro-list-page erp-users-page erp-payroll-page erp-payroll-v2"
        aria-busy="true"
      >
        <div className="erp-payroll-skeleton erp-payroll-skeleton--hero">
          <Skeleton active title={{ width: '30%' }} paragraph={{ rows: 2, width: ['45%', '60%'] }} />
        </div>
        <div className="erp-payroll-skeleton-tiles">
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="erp-payroll-skeleton">
              <Skeleton active title={false} paragraph={{ rows: 2, width: ['60%', '80%'] }} />
            </div>
          ))}
        </div>
        <div className="erp-payroll-skeleton">
          <Skeleton active title={{ width: '20%' }} paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (
    detailQuery.error instanceof ApiRequestError &&
    (detailQuery.error.status === 403 || detailQuery.error.status === 404)
  ) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-payroll-page erp-payroll-v2">
        <ErpNotice tone="warning" title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-payroll-page erp-payroll-v2">
        <ErpNotice tone="error" title={t('hr.payroll.detail.notFound')} />
      </div>
    );
  }

  const confirmMeta = confirmAction ? confirmCopy(confirmAction) : null;
  const nextVersionId =
    historyQuery.data?.versions.find((version) => version.previousVersionId === run.id)?.id ??
    null;
  const warnings = warningsQuery.data;
  const followUpPanel =
    (warnings &&
      (warnings.pendingOvertime.length > 0 ||
        warnings.overtimeNotIncluded.length > 0 ||
        warnings.overtimeChangedSinceCalculation.length > 0 ||
        warnings.deductionsOverCap.length > 0)) ||
    run.attendanceSnapshotStale ||
    run.policyReviewRequired ? (
      <section className="erp-pro-card erp-payroll-panel erp-payroll-followup">
        {run.attendanceSnapshotStale ? (
          <ErpNotice
            tone="warning"
            title={
              run.status === 'DRAFT' || run.status === 'REVIEWED'
                ? t('hr.payroll.actions.attendanceStaleDraft')
                : t('hr.payroll.actions.attendanceStaleApproved')
            }
          />
        ) : null}
        {run.policyReviewRequired ? (
          <ErpNotice
            tone="warning"
            title={t('hr.payroll.actions.policyReviewRequired')}
            description={run.policyReviewNote ?? undefined}
          />
        ) : null}
        {warnings && warnings.pendingOvertime.length > 0 ? (
          <div className="erp-payroll-followup-group">
            <h4 className="erp-payroll-followup-title">{t('hr.payroll.warnings.pendingOvertimeTitle')}</h4>
            <p className="erp-payroll-muted-note">{t('hr.payroll.warnings.pendingOvertimeHint')}</p>
            <ul className="erp-payroll-followup-list">
              {warnings.pendingOvertime.map((row) => (
                <li key={row.sheetId}>
                  <span className="truncate">
                    {row.employeeName}
                    {row.employeeCode ? ` · ${row.employeeCode}` : ''}
                  </span>
                  <span className="erp-payroll-muted-note">
                    {row.sheetNumber} ·{' '}
                    {t('hr.payroll.warnings.entriesHours', { entries: row.entries, hours: row.hours })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {warnings && warnings.overtimeNotIncluded.length > 0 ? (
          <div className="erp-payroll-followup-group">
            <h4 className="erp-payroll-followup-title">{t('hr.payroll.warnings.notIncludedTitle')}</h4>
            <p className="erp-payroll-muted-note">{t('hr.payroll.warnings.notIncludedHint')}</p>
            <ul className="erp-payroll-followup-list">
              {warnings.overtimeNotIncluded.map((row) => (
                <li key={row.sheetId}>
                  <span className="truncate">
                    {row.employeeName}
                    {row.employeeCode ? ` · ${row.employeeCode}` : ''}
                  </span>
                  <span className="erp-payroll-muted-note">
                    {row.sheetNumber} ·{' '}
                    {t('hr.payroll.warnings.entriesHours', { entries: row.entries, hours: row.hours })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {warnings && warnings.overtimeChangedSinceCalculation.length > 0 ? (
          <div className="erp-payroll-followup-group">
            <h4 className="erp-payroll-followup-title">{t('hr.payroll.warnings.overtimeChangedTitle')}</h4>
            <p className="erp-payroll-muted-note">{t('hr.payroll.warnings.overtimeChangedHint')}</p>
            <ul className="erp-payroll-followup-list">
              {warnings.overtimeChangedSinceCalculation.map((row) => (
                <li key={row.sheetId}>
                  <span className="truncate">
                    {row.employeeName}
                    {row.employeeCode ? ` · ${row.employeeCode}` : ''}
                  </span>
                  <span className="erp-payroll-muted-note">
                    {row.sheetNumber} ·{' '}
                    {t('hr.payroll.warnings.entriesHours', { entries: row.entries, hours: row.hours })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {warnings && warnings.deductionsOverCap.length > 0 ? (
          <div className="erp-payroll-followup-group">
            <h4 className="erp-payroll-followup-title">{t('hr.payroll.warnings.deductionsTitle')}</h4>
            <ul className="erp-payroll-followup-list">
              {warnings.deductionsOverCap.map((row) => (
                <li key={row.employeeId}>
                  <span className="truncate">{row.employeeName}</span>
                  <span className="erp-payroll-num">
                    {formatPayrollMoney(row.deductions, { emptyZero: false })} /{' '}
                    {formatPayrollMoney(row.cap, { emptyZero: false })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    ) : null;

  return (
    <div className="erp-pro-list-page erp-users-page erp-payroll-page erp-payroll-v2 erp-payroll-detail">
      <ConfirmDialog
        open={Boolean(bankLetterWarn)}
        title={t('hr.payroll.actions.exportBankLetterWarnTitle')}
        description={
          bankLetterWarn
            ? t('hr.payroll.actions.exportBankLetterWarnDescription', {
                count: bankLetterWarn.excludedNames.length,
                names: bankLetterWarn.excludedNames.join(', '),
                included: bankLetterWarn.includedCount,
              })
            : ''
        }
        confirmLabel={t('hr.payroll.actions.exportBankLetterContinue')}
        confirmLoading={bankLetterLoading}
        onConfirm={() => {
          if (!run || !bankLetterWarn) {
            return;
          }
          void (async () => {
            try {
              setBankLetterWarn(null);
              await downloadBankLetterFile(
                run.id,
                run.year,
                run.month,
                run.runNumber,
              );
            } catch (error) {
              notifyApiError(
                error,
                t('hr.payroll.actions.exportBankLetter'),
                messageApi,
                t,
              );
            }
          })();
        }}
        onCancel={() => setBankLetterWarn(null)}
      />

      <ConfirmDialog
        open={releaseOpen}
        title={t('hr.payroll.payslips.releaseTitle')}
        description={t('hr.payroll.payslips.releaseDescription', {
          count: payslipCounts.pendingRelease,
        })}
        confirmLabel={t('hr.payroll.confirm.confirmButton')}
        confirmLoading={releasePayslipsMutation.isPending}
        onConfirm={() => {
          void (async () => {
            try {
              const result = await releasePayslipsMutation.mutateAsync();
              messageApi.success(
                t('hr.payroll.payslips.releaseSuccess', { count: result.notified }),
              );
              setReleaseOpen(false);
            } catch (error) {
              notifyApiError(error, t('hr.payroll.payslips.release'), messageApi, t);
            }
          })();
        }}
        onCancel={() => setReleaseOpen(false)}
      />

      <Modal
        title={t('hr.payroll.freelancers.addTitle')}
        open={freelancerModalOpen}
        onCancel={() => {
          setFreelancerModalOpen(false);
          setFreelancerSelection([]);
        }}
        onOk={() => void addSelectedFreelancers()}
        okText={t('hr.payroll.freelancers.addConfirm')}
        okButtonProps={{ disabled: freelancerSelection.length === 0 }}
        confirmLoading={addFreelancersMutation.isPending}
        destroyOnHidden
        className="erp-payroll-modal"
      >
        <p className="erp-payroll-modal-hint">{t('hr.payroll.freelancers.addHint')}</p>
        {runInApproval ? (
          <ErpNotice
            tone="warning"
            className="!mb-4"
            title={t('hr.payroll.freelancers.reopenWarning')}
          />
        ) : null}
        <Select
          mode="multiple"
          allowClear
          showSearch
          className="w-full"
          aria-label={t('hr.payroll.freelancers.selectLabel')}
          placeholder={t('hr.payroll.freelancers.selectPlaceholder')}
          loading={availableFreelancersQuery.isLoading}
          value={freelancerSelection}
          onChange={setFreelancerSelection}
          optionFilterProp="label"
          notFoundContent={
            availableFreelancersQuery.isLoading ? (
              <Spin size="small" />
            ) : (
              t('hr.payroll.freelancers.none')
            )
          }
          options={(availableFreelancersQuery.data ?? []).map((u) => ({
            value: u.id,
            label: `${formatUserName(u)}${u.employeeId ? ` · ${u.employeeId}` : ''}`,
          }))}
        />
      </Modal>

      <Modal
        title={
          existingCorrection
            ? t('hr.payroll.actions.rerunCorrection')
            : t('hr.payroll.actions.createCorrection')
        }
        open={correctionModalOpen}
        onCancel={() => setCorrectionModalOpen(false)}
        okText={t('hr.payroll.actions.runCorrection')}
        confirmLoading={createCorrectionMutation.isPending}
        onOk={() => {
          void (async () => {
            try {
              const created = await createCorrectionMutation.mutateAsync({
                note: correctionNote.trim() || undefined,
              });
              messageApi.success(t('hr.payroll.actions.correctionSuccess'));
              setCorrectionModalOpen(false);
              router.push(`/hr/payroll/${created.id}`);
            } catch (error) {
              notifyApiError(
                error,
                t('hr.payroll.actions.createCorrection'),
                messageApi,
                t,
              );
            }
          })();
        }}
        destroyOnHidden
        className="erp-payroll-modal"
      >
        <p className="erp-payroll-modal-hint">
          {existingCorrection
            ? t('hr.payroll.correction.rerunWarning')
            : t('hr.payroll.correction.createHint', {
                period: run
                  ? formatPayrollPeriod(run.month, run.year)
                  : '',
              })}
        </p>
        <Form layout="vertical">
          <Form.Item label={t('hr.payroll.correction.reasonLabel')}>
            <Input.TextArea
              rows={3}
              value={correctionNote}
              onChange={(event) => setCorrectionNote(event.target.value)}
              placeholder={t('hr.payroll.correction.reasonPlaceholder')}
              maxLength={2000}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('hr.payroll.reopen.title', { runNumber: run.runNumber })}
        open={reopenModalOpen}
        onCancel={() => setReopenModalOpen(false)}
        okText={t('hr.payroll.reopen.confirm')}
        okButtonProps={{ disabled: reopenReason.trim().length < 5 }}
        confirmLoading={reopenMutation.isPending}
        onOk={() => {
          void (async () => {
            try {
              const next = await reopenMutation.mutateAsync(reopenReason.trim());
              messageApi.success(
                t('hr.payroll.reopen.success', { version: next.version ?? 2 }),
              );
              setReopenModalOpen(false);
              router.push(`/hr/payroll/${next.id}`);
            } catch (error) {
              notifyApiError(error, t('hr.payroll.reopen.action'), messageApi, t);
            }
          })();
        }}
        destroyOnHidden
        className="erp-payroll-modal"
      >
        <p className="erp-payroll-modal-hint">{t('hr.payroll.reopen.hint')}</p>
        <Form layout="vertical">
          <Form.Item
            label={t('hr.payroll.reopen.reasonLabel')}
            required
            help={
              reopenReason.length > 0 && reopenReason.trim().length < 5
                ? t('hr.payroll.reopen.reasonRequired')
                : undefined
            }
          >
            <Input.TextArea
              rows={3}
              value={reopenReason}
              onChange={(event) => setReopenReason(event.target.value)}
              placeholder={t('hr.payroll.reopen.reasonPlaceholder')}
              maxLength={1000}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('hr.payroll.returnToDraft.title', { runNumber: run.runNumber })}
        open={returnModalOpen}
        onCancel={() => setReturnModalOpen(false)}
        okText={t('hr.payroll.returnToDraft.confirm')}
        okButtonProps={{ disabled: returnReason.trim().length < 5 }}
        confirmLoading={returnToDraftMutation.isPending}
        onOk={() => {
          void (async () => {
            try {
              await returnToDraftMutation.mutateAsync(returnReason.trim());
              messageApi.success(t('hr.payroll.returnToDraft.success'));
              setReturnModalOpen(false);
            } catch (error) {
              notifyApiError(error, t('hr.payroll.actions.returnToDraft'), messageApi, t);
            }
          })();
        }}
        destroyOnHidden
        className="erp-payroll-modal"
      >
        <p className="erp-payroll-modal-hint">{t('hr.payroll.returnToDraft.hint')}</p>
        <Form layout="vertical">
          <Form.Item
            label={t('hr.payroll.returnToDraft.reasonLabel')}
            required
            help={
              returnReason.length > 0 && returnReason.trim().length < 5
                ? t('hr.payroll.returnToDraft.reasonRequired')
                : undefined
            }
          >
            <Input.TextArea
              rows={3}
              value={returnReason}
              onChange={(event) => setReturnReason(event.target.value)}
              placeholder={t('hr.payroll.returnToDraft.reasonPlaceholder')}
              maxLength={1000}
            />
          </Form.Item>
        </Form>
      </Modal>

      <ConfirmDialog
        open={Boolean(removingEntry)}
        title={t('hr.payroll.freelancers.removeTitle')}
        description={
          removingEntry
            ? `${t('hr.payroll.freelancers.removeDescription', {
                name: formatUserName(removingEntry.employee),
              })}${runInApproval ? ` ${t('hr.payroll.freelancers.reopenWarning')}` : ''}`
            : ''
        }
        confirmLabel={t('hr.payroll.freelancers.remove')}
        danger
        confirmLoading={removeFreelancerMutation.isPending}
        onConfirm={() => void removeFreelancerEntry()}
        onCancel={() => setRemovingEntry(null)}
      />

      <ConfirmDialog
        open={Boolean(
          confirmAction &&
            confirmAction !== 'submit' &&
            confirmAction !== 'approve' &&
            confirmAction !== 'gmApprove',
        )}
        title={confirmMeta?.title ?? ''}
        description={confirmMeta?.description ?? ''}
        confirmLabel={t('hr.payroll.confirm.confirmButton')}
        danger={confirmAction === 'cancel'}
        confirmLoading={confirmLoading}
        onConfirm={() => void runConfirmedAction()}
        onCancel={() => setConfirmAction(null)}
      />

      <Modal
        title={confirmMeta?.title ?? ''}
        open={confirmAction === 'approve' || confirmAction === 'gmApprove'}
        onCancel={() => {
          setConfirmAction(null);
          setEmploymentReviewed(false);
        }}
        onOk={() => void runConfirmedAction()}
        okButtonProps={{ disabled: reviewBlocked }}
        okText={t('hr.payroll.confirm.confirmButton')}
        confirmLoading={confirmLoading}
        className="erp-payroll-modal"
      >
        <p className="erp-payroll-modal-hint">{confirmMeta?.description ?? ''}</p>
        <PayrollEmploymentReviewPanel
          entries={employmentReview}
          loading={employmentReviewQuery.isLoading}
          reviewed={employmentReviewed}
          onReviewedChange={setEmploymentReviewed}
        />
      </Modal>

      <Modal
        title={t('hr.payroll.confirm.submitTitle')}
        open={confirmAction === 'submit'}
        onCancel={() => {
          setConfirmAction(null);
          setSubmitAcknowledge(false);
          setSubmitFlagCounts(null);
          setEmploymentReviewed(false);
        }}
        onOk={() => void runConfirmedAction()}
        okButtonProps={{
          disabled: (totalFlagged > 0 && !submitAcknowledge) || reviewBlocked,
        }}
        okText={t('hr.payroll.actions.submit')}
        confirmLoading={submitMutation.isPending}
        className="erp-payroll-modal"
      >
        <p className="erp-payroll-modal-hint">{t('hr.payroll.confirm.submitDescription')}</p>
        {submitFlagCounts && Object.keys(submitFlagCounts).length > 0 ? (
          <ul className="erp-payroll-flag-list">
            {Object.entries(submitFlagCounts).map(([flag, count]) => (
              <li key={flag}>
                <span>{t(payrollFlagLabelKey(flag as PayrollEntryFlag))}</span>
                <strong>{count}</strong>
              </li>
            ))}
          </ul>
        ) : totalFlagged > 0 && flagCounts ? (
          <ul className="erp-payroll-flag-list">
            {Object.entries(flagCounts)
              .filter(([k, count]) => k !== 'NONE' && count > 0)
              .map(([flag, count]) => (
                <li key={flag}>
                  <span>{t(payrollFlagLabelKey(flag as PayrollEntryFlag))}</span>
                  <strong>{count}</strong>
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
        <PayrollEmploymentReviewPanel
          entries={employmentReview}
          loading={employmentReviewQuery.isLoading}
          reviewed={employmentReviewed}
          onReviewedChange={setEmploymentReviewed}
        />
      </Modal>


      <section className="erp-pro-card erp-payroll-hero erp-brand-hero">
        <div className="erp-payroll-hero-top">
          <div className="min-w-0">
            <Link href="/hr/payroll" className="erp-payroll-back">
              <ArrowLeft size={14} strokeWidth={2} aria-hidden />
              {t('hr.payroll.detail.allRuns')}
            </Link>
            <div className="erp-payroll-hero-title-row">
              <h2 className="erp-payroll-hero-title">{run.runNumber}</h2>
              {isCorrectionRun && run.status === 'SUPERSEDED' ? (
                <Tag
                  variant="filled"
                  className="erp-payroll-status"
                  style={payrollStatusTagStyle('SUPERSEDED')}
                >
                  {t('hr.payroll.list.badgeVoided')}
                </Tag>
              ) : null}
              {isCorrectionRun && run.status !== 'SUPERSEDED' ? (
                <Tag
                  variant="filled"
                  className="erp-payroll-status"
                  style={{ color: '#9A3412', background: '#FFF7ED' }}
                >
                  {t('hr.payroll.list.badgeCorrection')}
                </Tag>
              ) : null}
              {!(isCorrectionRun && run.status === 'SUPERSEDED') ? (
                <Tag
                  variant="filled"
                  className="erp-payroll-status"
                  style={payrollStatusTagStyle(run.status)}
                >
                  {t(payrollStatusLabelKey(run.status))}
                </Tag>
              ) : null}
              {run.considerAttendance === false ? (
                <Tag variant="filled" className="erp-payroll-status erp-payroll-attendance-off-tag">
                  {t('hr.payroll.attendanceSetting.badge')}
                </Tag>
              ) : null}
            </div>
            <p className="erp-payroll-hero-meta">
              <span>
                <CalendarDays size={14} strokeWidth={2} aria-hidden />
                {formatPayrollPeriod(run.month, run.year)}
              </span>
              <span>
                <Users size={14} strokeWidth={2} aria-hidden />
                {t('hr.payroll.summary.employees')}: {run.totalEmployees}
              </span>
              <span>
                {t('hr.payroll.detail.createdOn', {
                  date: dayjs(run.createdAt).format('YYYY-MM-DD'),
                })}
              </span>
            </p>
            {canCreate && (run.status === 'DRAFT' || run.status === 'REVIEWED') ? (
              <PayrollAttendanceToggle
                className="erp-payroll-hero-attendance"
                checked={run.considerAttendance !== false}
                loading={updateRunMutation.isPending}
                wrapSwitch={(switchNode) => (
                  <Popconfirm
                    title={t('hr.payroll.attendanceSetting.confirmTitle')}
                    description={
                      run.considerAttendance === false
                        ? t('hr.payroll.attendanceSetting.confirmOn')
                        : t('hr.payroll.attendanceSetting.confirmOff')
                    }
                    okText={t('hr.payroll.attendanceSetting.confirmOk')}
                    cancelText={t('common.cancel')}
                    onConfirm={async () => {
                      const next = run.considerAttendance === false;
                      try {
                        await updateRunMutation.mutateAsync({ considerAttendance: next });
                        messageApi.success(
                          next
                            ? t('hr.payroll.attendanceSetting.changedOn')
                            : t('hr.payroll.attendanceSetting.changedOff'),
                        );
                      } catch (error) {
                        notifyApiError(
                          error,
                          t('hr.payroll.attendanceSetting.changeFailed'),
                          messageApi,
                        );
                      }
                    }}
                  >
                    <span>{switchNode}</span>
                  </Popconfirm>
                )}
              />
            ) : null}
          </div>
        </div>
        {run.status === 'SUPERSEDED' ? (
          <ErpNotice
            tone="info"
            className="mt-3"
            title={t('hr.payroll.reopen.supersededNotice', {
              date: run.reopenedAt ? dayjs(run.reopenedAt).format('YYYY-MM-DD') : '-',
              reason: run.reopenReason ?? '-',
            })}
            action={
              nextVersionId ? (
                <Link href={`/hr/payroll/${nextVersionId}`}>
                  {t('hr.payroll.reopen.openLatest')}
                </Link>
              ) : undefined
            }
          />
        ) : null}
      </section>

      <PayrollRunWarningsBar
        run={run}
        warnings={warningsQuery.data}
        flaggedCount={totalFlagged}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          if (tab === 'employees' && totalFlagged > 0) {
            setFlaggedOnly(true);
          }
        }}
      />

      <Tabs
        className="erp-payroll-tabs"
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as PayrollRunTab)}
        items={[
          {
            key: 'summary',
            label: t('hr.payroll.tabs.summary'),
            children: (
              <div className="erp-payroll-tab-stack">
                <section className="erp-pro-card erp-payroll-panel">
                  <div className="erp-payroll-summary-actions">
                    {renderActionButtons(run.status)}
                  </div>
                  {isCorrectionRun ? (
                    <ErpNotice
                      tone="info"
                      className="mt-3"
                      title={t('hr.payroll.correction.bannerTitle', {
                        period: formatPayrollPeriod(
                          run.originalRun?.month ?? run.month,
                          run.originalRun?.year ?? run.year,
                        ),
                      })}
                      description={t('hr.payroll.correction.bannerBody')}
                      action={
                        run.originalRunId ? (
                          <Link href={`/hr/payroll/${run.originalRunId}`}>
                            {t('hr.payroll.correction.viewOriginal', {
                              runNumber: run.originalRun?.runNumber ?? run.originalRunId,
                            })}
                          </Link>
                        ) : undefined
                      }
                    />
                  ) : null}
                  <div className="erp-payroll-steps">
                    <Steps
                      size="small"
                      titlePlacement="vertical"
                      current={stepIndex}
                      status={
                        run.status === 'CANCELLED'
                          ? 'error'
                          : run.status === 'PAID'
                            ? 'finish'
                            : 'process'
                      }
                      items={[
                        {
                          title: t('hr.payroll.steps.draft'),
                        },
                        {
                          title: t('hr.payroll.steps.reviewed'),
                        },
                        {
                          title: t('hr.payroll.steps.submitted'),
                          content: run.submittedAt ? (
                            <StepMeta
                              who={personLabel(run.submitter, run.submittedBy)}
                              when={run.submittedAt}
                            />
                          ) : undefined,
                        },
                        {
                          title: t('hr.payroll.steps.hrApproved'),
                          content: run.approvedAt ? (
                            <StepMeta
                              who={personLabel(run.approver, run.approvedBy)}
                              when={run.approvedAt}
                            />
                          ) : undefined,
                        },
                        {
                          title: t('hr.payroll.steps.gmApproved'),
                          content: run.gmApprovedAt ? (
                            <StepMeta
                              who={personLabel(run.gmApprover, run.gmApprovedBy)}
                              when={run.gmApprovedAt}
                            />
                          ) : undefined,
                        },
                        {
                          title: t('hr.payroll.steps.paid'),
                          content: run.paidAt ? (
                            <StepMeta
                              who={personLabel(run.payer, run.paidBy)}
                              when={run.paidAt}
                            />
                          ) : undefined,
                        },
                      ]}
                    />
                  </div>
                </section>
                <section className="erp-payroll-summary">
                  {[
                    {
                      key: 'employees',
                      label: t('hr.payroll.summary.employees'),
                      value: String(run.totalEmployees),
                      icon: <Users size={15} strokeWidth={2} />,
                      money: false,
                    },
                    {
                      key: 'gross',
                      label: t('hr.payroll.summary.totalGross'),
                      value: formatPayrollMoney(run.totalGross, { emptyZero: false }),
                      icon: <Wallet size={15} strokeWidth={2} />,
                      money: true,
                    },
                    {
                      key: 'pensionEmp',
                      label: t('hr.payroll.summary.pensionEmp'),
                      value: formatPayrollMoney(run.totalPensionEmp, { emptyZero: false }),
                      icon: <PiggyBank size={15} strokeWidth={2} />,
                      money: true,
                    },
                    {
                      key: 'pensionEmr',
                      label: t('hr.payroll.summary.pensionEmr'),
                      value: formatPayrollMoney(run.totalPensionEmr, { emptyZero: false }),
                      icon: <Landmark size={15} strokeWidth={2} />,
                      money: true,
                    },
                    {
                      key: 'tax',
                      label: t('hr.payroll.summary.totalTax'),
                      value: formatPayrollMoney(run.totalTax, { emptyZero: false }),
                      icon: <Receipt size={15} strokeWidth={2} />,
                      money: true,
                    },
                    {
                      key: 'netBonus',
                      label: t('hr.payroll.summary.totalNetBonus'),
                      value: formatPayrollMoney(run.totalNetBonus ?? 0, {
                        emptyZero: false,
                      }),
                      icon: <Wallet size={15} strokeWidth={2} />,
                      money: true,
                    },
                    {
                      key: 'net',
                      label: t('hr.payroll.summary.totalNet'),
                      value: formatPayrollMoney(run.totalNetPay, { emptyZero: false }),
                      icon: <Banknote size={15} strokeWidth={2} />,
                      money: true,
                    },
                  ].map((card) => (
                    <div
                      key={card.key}
                      className={`erp-payroll-summary-tile${card.key === 'net' ? ' erp-payroll-summary-tile--net' : ''}`}
                    >
                      <p className="erp-payroll-summary-label">
                        <span className="erp-payroll-summary-chip" aria-hidden>
                          {card.icon}
                        </span>
                        <span className="truncate">{card.label}</span>
                      </p>
                      <p className="erp-payroll-summary-value" title={card.value}>
                        {card.value}
                        {card.money ? <span className="erp-payroll-summary-unit">ETB</span> : null}
                      </p>
                    </div>
                  ))}
                </section>
                {followUpPanel}
                {isCorrectionRun ? null : <PayrollRemittancePanel runId={run.id} />}
                {canCreate && !isCorrectionRun && (run.status === 'GM_APPROVED' || run.status === 'PAID') ? (
                  <section className="erp-pro-card erp-payroll-payslips">
                    <div>
                      <h3 className="erp-payroll-payslips-title">
                        {t('hr.payroll.payslips.title')}
                      </h3>
                      <div className="erp-payroll-payslips-counts">
                        <span className="erp-payroll-count-chip">
                          {t('hr.payroll.payslips.generated')}
                          <strong>{payslipCounts.generated}</strong>
                        </span>
                        <span className="erp-payroll-count-chip">
                          {t('hr.payroll.payslips.released')}
                          <strong>{payslipCounts.released}</strong>
                        </span>
                        <span className="erp-payroll-count-chip">
                          {t('hr.payroll.payslips.downloaded')}
                          <strong>{payslipCounts.downloaded}</strong>
                        </span>
                      </div>
                    </div>
                    <div className="erp-payroll-payslips-actions">
                      <Button
                        loading={generatePayslipsMutation.isPending}
                        onClick={() => {
                          void (async () => {
                            try {
                              const result = await generatePayslipsMutation.mutateAsync();
                              messageApi.success(
                                t('hr.payroll.payslips.generateSuccess', {
                                  created: result.created,
                                  updated: result.updated,
                                  skipped: result.skipped,
                                }),
                              );
                            } catch (error) {
                              notifyApiError(
                                error,
                                t('hr.payroll.payslips.generate'),
                                messageApi,
                                t,
                              );
                            }
                          })();
                        }}
                      >
                        {t('hr.payroll.payslips.generate')}
                      </Button>
                      <Button
                        type="primary"
                        disabled={payslipCounts.pendingRelease === 0}
                        onClick={() => setReleaseOpen(true)}
                      >
                        {t('hr.payroll.payslips.release')}
                      </Button>
                      <Button
                        icon={<DownloadOutlined />}
                        loading={zipping}
                        onClick={() => {
                          void (async () => {
                            const mm = String(run.month).padStart(2, '0');
                            const safeRun = run.runNumber.replace(/[^\w.-]+/g, '_');
                            setZipping(true);
                            try {
                              await downloadPayslipZip(
                                run.id,
                                `Payslips_${run.year}_${mm}_${safeRun}.zip`,
                              );
                              messageApi.success(t('hr.payroll.payslips.zipSuccess'));
                            } catch (error) {
                              notifyApiError(
                                error,
                                t('hr.payroll.payslips.downloadZip'),
                                messageApi,
                                t,
                              );
                            } finally {
                              setZipping(false);
                            }
                          })();
                        }}
                      >
                        {t('hr.payroll.payslips.downloadZip')}
                      </Button>
                    </div>
                  </section>
                ) : null}
              </div>
            ),
          },
          {
            key: 'employees',
            label: t('hr.payroll.tabs.employees'),
            children: (
              <div className="erp-payroll-tab-stack">
                <section className="erp-pro-card erp-payroll-entries">
                  <div className="erp-pro-card-toolbar erp-users-toolbar">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <h3 className="erp-pro-card-toolbar-title m-0">
                        {t('hr.payroll.detail.entriesTitle')}
                      </h3>
                      <span className="erp-users-count-pill">
                        {filteredEntries.length.toLocaleString()}
                      </span>
                    </div>
                    {canChangeRun ? (
                      <Button onClick={() => setFreelancerModalOpen(true)}>
                        {isCorrectionRun
                          ? t('hr.payroll.freelancers.addPerson')
                          : t('hr.payroll.freelancers.add')}
                      </Button>
                    ) : null}
                  </div>

                  <div className="erp-users-filter-bar">
                    <Input
                      allowClear
                      prefix={<SearchOutlined className="erp-users-search-icon" />}
                      placeholder={t('hr.payroll.entry.searchPlaceholder')}
                      className="erp-users-search-input min-w-0"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <Select
                      allowClear
                      placeholder={t('hr.payroll.entry.filterDepartment')}
                      className="erp-users-filter-select"
                      options={departments.map((d) => ({ value: d, label: d }))}
                      value={departmentFilter}
                      onChange={setDepartmentFilter}
                    />
                    <Select
                      allowClear
                      placeholder={t('hr.payroll.entry.filterDiscipline')}
                      className="erp-users-filter-select"
                      options={disciplines.map((d) => ({ value: d, label: d }))}
                      value={disciplineFilter}
                      onChange={setDisciplineFilter}
                    />
                    <label className="erp-payroll-switch">
                      <Switch size="small" checked={flaggedOnly} onChange={setFlaggedOnly} />
                      {t('hr.payroll.entry.flaggedOnly')}
                    </label>
                    {isCorrectionRun ? (
                      <label className="erp-payroll-switch">
                        <Switch size="small" checked={changedOnly} onChange={setChangedOnly} />
                        {t('hr.payroll.correction.changedOnly')}
                      </label>
                    ) : null}
                    {hasEntryFilters ? (
                      <Button type="link" onClick={resetEntryFilters} className="!px-1">
                        {t('common.reset')}
                      </Button>
                    ) : null}
                  </div>

                  {isPhone ? (
                    <div className="erp-payroll-entry-cards">
                      {totalsRow ? (
                        <div className="erp-payroll-mobile-totals">
                          <p className="erp-payroll-mobile-totals-title">
                            {t('hr.payroll.detail.filteredTotals')}
                          </p>
                          <dl>
                            <div>
                              <dt>{t('hr.payroll.entry.gross')}</dt>
                              <dd>{formatPayrollMoney(totalsRow.gross, { emptyZero: false })}</dd>
                            </div>
                            <div>
                              <dt>{t('hr.payroll.entry.tax')}</dt>
                              <dd>{formatPayrollMoney(totalsRow.tax, { emptyZero: false })}</dd>
                            </div>
                            <div className="erp-payroll-mobile-totals-net">
                              <dt>{t('hr.payroll.entry.net')}</dt>
                              <dd>{formatPayrollMoney(totalsRow.net, { emptyZero: false })}</dd>
                            </div>
                          </dl>
                        </div>
                      ) : null}
                      {filteredEntries.length === 0 ? (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} className="py-6" />
                      ) : (
                        <ul className="erp-payroll-entry-card-list">
                          {filteredEntries.slice(0, mobileVisible).map(renderEntryCard)}
                        </ul>
                      )}
                      {filteredEntries.length > mobileVisible ? (
                        <Button
                          block
                          className="erp-payroll-entry-cards-more"
                          onClick={() =>
                            setMobilePage({
                              key: mobileFilterKey,
                              count: mobileVisible + MOBILE_PAGE_SIZE,
                            })
                          }
                        >
                          {t('hr.payroll.detail.showMore', {
                            count: Math.min(MOBILE_PAGE_SIZE, filteredEntries.length - mobileVisible),
                          })}
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <Table<PayrollEntryDetail>
                      rowKey="id"
                      size="small"
                      columns={columns}
                      dataSource={filteredEntries}
                      scroll={{
                        x: entriesScrollX,
                        y: 'max(320px, calc(100dvh - 300px))',
                      }}
                      className="erp-payroll-entries-table"
                      rowClassName={(row) =>
                        [
                          'erp-payroll-row',
                          contractLinesById.get(row.id) ? 'erp-payroll-row--split' : '',
                          row.id === selectedEntryId ? 'erp-payroll-row--active' : '',
                          row.flag !== 'NONE' ? 'erp-payroll-row--flagged' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')
                      }
                      onRow={(row) => ({
                        onClick: (event) => {
                          // Buttons / links inside the row keep their own action.
                          if ((event.target as HTMLElement).closest('button, a')) {
                            return;
                          }
                          openEntry(row.id);
                        },
                      })}
                      pagination={false}
                      summary={() =>
                        totalsRow ? (
                          <Table.Summary fixed="bottom">
                            <Table.Summary.Row>
                              {summaryCells(totalsRow).map((cell, index) => (
                                <Table.Summary.Cell
                                  key={index}
                                  index={index}
                                  align={cell.align}
                                  className={cell.className}
                                >
                                  {cell.content}
                                </Table.Summary.Cell>
                              ))}
                            </Table.Summary.Row>
                          </Table.Summary>
                        ) : null
                      }
                    />
                  )}
                </section>
              </div>
            ),
          },
          {
            key: 'adjustments',
            label: t('hr.payroll.tabs.adjustments'),
            children: (
              <PayrollRunAdjustmentsTab
                run={run}
                canEdit={canEdit}
                canWaive={canApprove || isSysAdmin}
              />
            ),
          },
          {
            key: 'history',
            label: t('hr.payroll.tabs.history'),
            children: <PayrollRunHistoryTab run={run} />,
          },
        ]}
      />

      <PayrollCorrectionDrawer
        runId={run.id}
        entry={
          correctionEntryId
            ? (run.entries.find((row) => row.id === correctionEntryId) ?? null)
            : null
        }
        editable={
          canEdit &&
          isCorrectionRun &&
          (run.status === 'DRAFT' || run.status === 'REVIEWED' || run.status === 'SUBMITTED')
        }
        onClose={() => setCorrectionEntryId(null)}
      />

      <PayrollEntryDrawer
        entry={
          selectedEntryId
            ? (run.entries.find((row) => row.id === selectedEntryId) ?? null)
            : null
        }
        entries={filteredEntries}
        run={run}
        canEdit={canEdit}
        canChangeRun={canChangeRun}
        canOverrideDays={canOverrideDays}
        payslipLoading={openingPayslipId != null}
        onOpenPayslip={showPayslipColumn ? (id) => void openPayslip(id) : undefined}
        onNavigate={setSelectedEntry}
        onClose={() => setSelectedEntry(null)}
        onRemoveFreelancer={(row) => {
          setSelectedEntry(null);
          setRemovingEntry(row);
        }}
      />
    </div>
  );
}
