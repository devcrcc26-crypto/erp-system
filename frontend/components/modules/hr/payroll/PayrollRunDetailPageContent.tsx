'use client';

import './payroll-v2.css';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Button,
  Checkbox,
  Dropdown,
  Empty,
  Form,
  Grid,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Spin,
  Steps,
  Switch,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import type { MenuProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DownloadOutlined,
  FilePdfOutlined,
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
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import PayrollEmploymentReviewPanel from '@/components/modules/hr/payroll/PayrollEmploymentReviewPanel';
import PayrollPaidDaysControls from '@/components/modules/hr/payroll/PayrollPaidDaysControls';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useCanAccessPayroll,
  useCanApprovePayroll,
  useCanCreatePayroll,
  useCanEditPayroll,
  useCanExportPayroll,
  useIsHrManager,
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
  useReleasePayslips,
  useSubmitPayrollRun,
  useUnlockPayrollRun,
  useUpdatePayrollEntry,
} from '@/lib/query/payroll';
import { useFullUsersDirectory } from '@/lib/query/users';
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

function SplitCell({
  lines,
  value,
  total,
}: {
  lines: ContractLine[];
  value: (line: ContractLine) => React.ReactNode;
  total: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="erp-pr-split">
      {lines.map((line) => (
        <div key={line.key} className="erp-pr-split-line" title={line.title}>
          {value(line)}
        </div>
      ))}
      <div className="erp-pr-split-line erp-pr-split-total">{total}</div>
    </div>
  );
}

/** OT buckets with pay — matches policy defaults (÷192 / ÷196 × multipliers). */
type OtBreakdownLine = {
  key: 'normal' | 'evening' | 'sunday' | 'holiday';
  hours: number;
  pay: number;
  labelKey:
    | 'hr.payroll.entry.otNormalLine'
    | 'hr.payroll.entry.otEveningLine'
    | 'hr.payroll.entry.otSundayLine'
    | 'hr.payroll.entry.otHolidayLine';
};

function buildOtBreakdownLines(source: {
  normalOtHours: PayrollEntryDetail['normalOtHours'];
  eveningOtHours: PayrollEntryDetail['eveningOtHours'];
  sundayOtHours: PayrollEntryDetail['sundayOtHours'];
  holidayOtHours: PayrollEntryDetail['holidayOtHours'];
  normalOtPay: PayrollEntryDetail['normalOtPay'];
  eveningOtPay: PayrollEntryDetail['eveningOtPay'];
  sundayOtPay: PayrollEntryDetail['sundayOtPay'];
  holidayOtPay: PayrollEntryDetail['holidayOtPay'];
}): OtBreakdownLine[] {
  const rows: OtBreakdownLine[] = [
    {
      key: 'normal',
      hours: parsePayrollMoney(source.normalOtHours),
      pay: parsePayrollMoney(source.normalOtPay),
      labelKey: 'hr.payroll.entry.otNormalLine',
    },
    {
      key: 'evening',
      hours: parsePayrollMoney(source.eveningOtHours),
      pay: parsePayrollMoney(source.eveningOtPay),
      labelKey: 'hr.payroll.entry.otEveningLine',
    },
    {
      key: 'sunday',
      hours: parsePayrollMoney(source.sundayOtHours),
      pay: parsePayrollMoney(source.sundayOtPay),
      labelKey: 'hr.payroll.entry.otSundayLine',
    },
    {
      key: 'holiday',
      hours: parsePayrollMoney(source.holidayOtHours),
      pay: parsePayrollMoney(source.holidayOtPay),
      labelKey: 'hr.payroll.entry.otHolidayLine',
    },
  ];
  return rows.filter((row) => row.hours > 0 || row.pay > 0);
}

const MOBILE_PAGE_SIZE = 20;

function resolveUserLabel(
  userId: string | null | undefined,
  directory: Map<string, { firstName: string; lastName: string; chineseName: string | null }>,
): string {
  if (!userId) {
    return '-';
  }
  const user = directory.get(userId);
  if (!user) {
    return userId.slice(0, 8);
  }
  return formatUserName(user);
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
  const messageApi = useAppMessage();
  const canAccess = useCanAccessPayroll();
  const canCreate = useCanCreatePayroll();
  const canEdit = useCanEditPayroll();
  const canApprove = useCanApprovePayroll();
  const canExport = useCanExportPayroll();
  const isSysAdmin = useIsSystemAdmin();
  const isHrManager = useIsHrManager();
  const canManageCorrections = isSysAdmin || isHrManager;

  const detailQuery = usePayrollRun(runId, canAccess);
  const runsQuery = usePayrollRuns(canAccess && canManageCorrections);
  const usersQuery = useFullUsersDirectory({ enabled: canAccess });
  const screens = Grid.useBreakpoint();
  const isPhone = screens.md === false;
  const recalculateMutation = useRecalculatePayrollRun(runId);
  const markReviewedMutation = useMarkPayrollRunReviewed(runId);
  const submitMutation = useSubmitPayrollRun(runId);
  const approveMutation = useApprovePayrollRun(runId);
  const gmApproveMutation = useGmApprovePayrollRun(runId);
  const markPaidMutation = useMarkPayrollRunPaid(runId);
  const cancelMutation = useCancelPayrollRun(runId);
  const createCorrectionMutation = useCreatePayrollCorrection(runId);
  const unlockMutation = useUnlockPayrollRun(runId);
  const updateEntryMutation = useUpdatePayrollEntry(runId);
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
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
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
  const [expandedEntryIds, setExpandedEntryIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [mobilePage, setMobilePage] = useState<{ key: string; count: number }>({
    key: '',
    count: MOBILE_PAGE_SIZE,
  });
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string | undefined>();
  const [disciplineFilter, setDisciplineFilter] = useState<string | undefined>();
  const [bonusEntry, setBonusEntry] = useState<PayrollEntryDetail | null>(null);
  const [bonusForm] = Form.useForm<{
    treatment: 'taxable' | 'net';
    amount: number;
    reason: string;
  }>();
  const [bonusPreview, setBonusPreview] = useState<{
    treatment: 'taxable' | 'net';
    amount: number;
  }>({ treatment: 'taxable', amount: 0 });
  const [exporting, setExporting] = useState(false);
  const [bankLetterLoading, setBankLetterLoading] = useState(false);
  const [bankLetterWarn, setBankLetterWarn] = useState<{
    excludedNames: string[];
    includedCount: number;
  } | null>(null);
  const [zipping, setZipping] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [openingPayslipId, setOpeningPayslipId] = useState<string | null>(null);

  const userDirectory = useMemo(() => {
    const map = new Map<
      string,
      { firstName: string; lastName: string; chineseName: string | null }
    >();
    for (const user of usersQuery.data ?? []) {
      map.set(user.id, user);
    }
    return map;
  }, [usersQuery.data]);

  const run = detailQuery.data;

  useEffect(() => {
    if (!bonusEntry) {
      return;
    }
    const taxable = parsePayrollMoney(bonusEntry.bonusTopUp);
    const net = parsePayrollMoney(bonusEntry.netTopUp);
    const treatment: 'taxable' | 'net' =
      net > 0 && taxable === 0 ? 'net' : 'taxable';
    const amount = treatment === 'net' ? net : taxable;
    const reason =
      treatment === 'net'
        ? (bonusEntry.netTopUpReason ?? '')
        : (bonusEntry.bonusTopUpReason ?? '');
    bonusForm.setFieldsValue({ treatment, amount, reason });
    setBonusPreview({ treatment, amount });
  }, [bonusEntry, bonusForm]);

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

  function toggleEntryExpanded(entryId: string): void {
    setExpandedEntryIds((current) => {
      const next = new Set(current);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  }

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
      basicSalary: sum((e) => parsePayrollMoney(e.basicSalary)),
      earnedSalary: sum((e) => parsePayrollMoney(e.earnedSalary)),
      totalOtPay: sum((e) => parsePayrollMoney(e.totalOtPay)),
      transport: sum((e) =>
        parsePayrollMoney(e.taxableTransport) + parsePayrollMoney(e.nonTaxableTransport),
      ),
      bonus: sum((e) =>
        parsePayrollMoney(e.monthlyBonus) + parsePayrollMoney(e.bonusTopUp),
      ),
      netBonus: sum(
        (e) =>
          parsePayrollMoney(e.contractNetBonus) + parsePayrollMoney(e.netTopUp),
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

  async function saveBonusTopUp(): Promise<void> {
    if (!bonusEntry) {
      return;
    }
    try {
      const values = await bonusForm.validateFields();
      const amount = values.amount ?? 0;
      const reason = values.reason?.trim() || undefined;
      const payload =
        values.treatment === 'net'
          ? { netTopUp: amount, netTopUpReason: reason }
          : { bonusTopUp: amount, bonusTopUpReason: reason };
      await updateEntryMutation.mutateAsync({
        entryId: bonusEntry.id,
        payload,
      });
      messageApi.success(t('hr.payroll.entry.bonusSaved'));
      setBonusEntry(null);
      setBonusPreview({ treatment: 'taxable', amount: 0 });
      bonusForm.resetFields();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        messageApi.error(error.message);
      } else if (!(error as { errorFields?: unknown }).errorFields) {
        notifyApiError(error, 'Request failed', messageApi);
      }
    }
  }

  function estimateNetIncrease(
    treatment: 'taxable' | 'net' | undefined,
    amount: number | undefined,
    taxableIncome: number,
  ): number {
    const value = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
    if (value <= 0) {
      return 0;
    }
    if (treatment === 'net') {
      return Math.round(value * 100) / 100;
    }
    const taxBefore = estimateEthiopianTax(taxableIncome);
    const taxAfter = estimateEthiopianTax(taxableIncome + value);
    return Math.round((value - (taxAfter - taxBefore)) * 100) / 100;
  }

  function estimateEthiopianTax(taxableIncome: number): number {
    if (taxableIncome <= 2000) return 0;
    if (taxableIncome <= 4000) return taxableIncome * 0.15 - 300;
    if (taxableIncome <= 7000) return taxableIncome * 0.2 - 500;
    if (taxableIncome <= 10000) return taxableIncome * 0.25 - 850;
    if (taxableIncome <= 14000) return taxableIncome * 0.3 - 1350;
    return taxableIncome * 0.35 - 2050;
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

  const contractLinesById = useMemo(
    () => new Map(filteredEntries.map((e) => [e.id, buildContractLines(e)])),
    [filteredEntries],
  );

  const columns: ColumnsType<PayrollEntryDetail> = useMemo(
    () => [
      {
        title: t('hr.payroll.entry.employee'),
        key: 'employee',
        fixed: 'left',
        width: 220,
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
        title: (
          <Tooltip title={t('hr.payroll.entry.paidDaysBasis')}>
            <span>{t('hr.payroll.entry.paidDays')}</span>
          </Tooltip>
        ),
        key: 'paidDays',
        width: canEdit ? 148 : 128,
        align: 'right',
        render: (_, row) => {
          const lines = contractLinesById.get(row.id);
          const total = (
            <>
              <Tooltip
                title={t('hr.payroll.entry.paidDaysTooltip', {
                  employed: parsePayrollMoney(row.employedDays),
                  absent: parsePayrollMoney(row.absentDays),
                  paid: parsePayrollMoney(row.payrollDays),
                })}
              >
                <span className="erp-payroll-num">{parsePayrollMoney(row.payrollDays)}</span>
              </Tooltip>
              {canEdit ? (
                <PayrollPaidDaysControls
                  runId={runId}
                  entry={row}
                  canOverride={canOverrideDays}
                />
              ) : null}
            </>
          );
          if (!lines) {
            return total;
          }
          return (
            <SplitCell
              lines={lines}
              value={(line) => (
                <>
                  <span className="erp-pr-split-tag">{line.label}</span>
                  <span className="erp-payroll-num">{line.days}</span>
                </>
              )}
              total={total}
            />
          );
        },
      },
      {
        title: t('hr.payroll.entry.groupEarnings'),
        key: 'earnings',
        children: [
          {
            title: t('hr.payroll.entry.basic'),
            dataIndex: 'basicSalary',
            align: 'right',
            width: 112,
            className: 'erp-payroll-col-group-start',
            render: (v, row) => {
              const lines = contractLinesById.get(row.id);
              if (!lines) {
                return <MoneyCell value={v} />;
              }
              return (
                <SplitCell
                  lines={lines}
                  value={(line) => <MoneyCell value={line.basic} />}
                  total={<span aria-hidden="true" />}
                />
              );
            },
          },
          {
            title: t('hr.payroll.entry.earned'),
            dataIndex: 'earnedSalary',
            align: 'right',
            width: 112,
            render: (v, row) => {
              const lines = contractLinesById.get(row.id);
              if (!lines) {
                return <MoneyCell value={v} />;
              }
              return (
                <SplitCell
                  lines={lines}
                  value={(line) => <MoneyCell value={line.earned} />}
                  total={<MoneyCell value={v} strong />}
                />
              );
            },
          },
          {
            title: t('hr.payroll.entry.otPay'),
            dataIndex: 'totalOtPay',
            align: 'right',
            width: 108,
            render: (v, row) => {
              const lines = contractLinesById.get(row.id);
              const otLines = buildOtBreakdownLines(row);
              const otBasic = formatPayrollMoney(row.basicSalary, {
                emptyZero: false,
              });
              const total = (
                <Tooltip
                  title={
                    otLines.length > 0 ? (
                      <div className="text-xs">
                        {otLines.map((line) => (
                          <div key={line.key}>
                            {t(line.labelKey, {
                              hours: line.hours,
                              basic: otBasic,
                            })}
                            : {formatPayrollMoney(line.pay, { emptyZero: false })}
                          </div>
                        ))}
                      </div>
                    ) : undefined
                  }
                >
                  <span
                    style={{ ...PAYROLL_MONEY_CELL_STYLE, fontWeight: lines ? 600 : undefined }}
                  >
                    {formatPayrollMoney(v)}
                  </span>
                </Tooltip>
              );
              if (!lines) {
                return total;
              }
              return (
                <SplitCell
                  lines={lines}
                  value={(line) => <MoneyCell value={line.ot} />}
                  total={total}
                />
              );
            },
          },
          {
            title: t('hr.payroll.entry.transport'),
            key: 'transport',
            align: 'right',
            width: 108,
            render: (_, row) => {
              const lines = contractLinesById.get(row.id);
              const value =
                parsePayrollMoney(row.taxableTransport) +
                parsePayrollMoney(row.nonTaxableTransport);
              if (!lines) {
                return <MoneyCell value={value} />;
              }
              return (
                <SplitCell
                  lines={lines}
                  value={(line) => <MoneyCell value={line.transport} />}
                  total={<MoneyCell value={value} strong />}
                />
              );
            },
          },
          {
            title: t('hr.payroll.entry.bonus'),
            key: 'bonus',
            align: 'right',
            width: 120,
            render: (_, row) => {
              const lines = contractLinesById.get(row.id);
              const topUp = parsePayrollMoney(row.bonusTopUp);
              const value = parsePayrollMoney(row.monthlyBonus) + topUp;
              const total = (
                <span
                  style={{ ...PAYROLL_MONEY_CELL_STYLE, fontWeight: lines ? 600 : undefined }}
                >
                  {formatPayrollMoney(value)}
                  {topUp > 0 ? (
                    <Tooltip
                      title={row.bonusTopUpReason || t('hr.payroll.entry.bonusTopUpAmount')}
                    >
                      <span className="erp-payroll-topup-mark">*</span>
                    </Tooltip>
                  ) : null}
                </span>
              );
              if (!lines) {
                return total;
              }
              return (
                <SplitCell
                  lines={lines}
                  value={(line) => <MoneyCell value={line.bonus} />}
                  total={total}
                />
              );
            },
          },
          {
            title: t('hr.payroll.entry.gross'),
            dataIndex: 'grossIncome',
            align: 'right',
            width: 116,
            className: 'erp-payroll-col-gross',
            render: (v) => <MoneyCell value={v} strong />,
          },
        ],
      },
      {
        title: t('hr.payroll.entry.groupTax'),
        key: 'taxGroup',
        children: [
          {
            title: t('hr.payroll.entry.taxable'),
            dataIndex: 'taxableIncome',
            align: 'right',
            width: 116,
            className: 'erp-payroll-col-group-start',
            render: (v) => <MoneyCell value={v} />,
          },
          {
            title: t('hr.payroll.entry.pensionEmp'),
            dataIndex: 'pensionEmployee',
            align: 'right',
            width: 108,
            render: (v) => <MoneyCell value={v} />,
          },
          {
            title: t('hr.payroll.entry.tax'),
            dataIndex: 'incomeTax',
            align: 'right',
            width: 108,
            render: (v) => <MoneyCell value={v} />,
          },
        ],
      },
      {
        title: t('hr.payroll.entry.groupPay'),
        key: 'payGroup',
        children: [
          {
            title: t('hr.payroll.entry.netBonus'),
            key: 'netBonus',
            align: 'right',
            width: 112,
            className: 'erp-payroll-col-group-start',
            render: (_, row) => {
              const contractNet = parsePayrollMoney(row.contractNetBonus);
              const oneTime = parsePayrollMoney(row.netTopUp);
              const total = contractNet + oneTime;
              return (
                <span style={PAYROLL_MONEY_CELL_STYLE}>
                  {formatPayrollMoney(total)}
                  {oneTime > 0 ? (
                    <Tooltip title={row.netTopUpReason || t('hr.payroll.entry.netTopUpAmount')}>
                      <span className="erp-payroll-topup-mark">*</span>
                    </Tooltip>
                  ) : null}
                </span>
              );
            },
          },
          {
            title: t('hr.payroll.entry.net'),
            dataIndex: 'netPay',
            align: 'right',
            width: 124,
            className: 'erp-payroll-col-net',
            render: (v) => <MoneyCell value={v} strong />,
          },
          ...(isCorrectionRun
            ? [
                {
                  title: t('hr.payroll.correction.originalAmount'),
                  dataIndex: 'originalAmount' as const,
                  align: 'right' as const,
                  width: 112,
                  render: (v: MoneyField | null | undefined) => (
                    <MoneyCell value={v ?? 0} />
                  ),
                },
                {
                  title: t('hr.payroll.correction.correctedAmount'),
                  dataIndex: 'correctedAmount' as const,
                  align: 'right' as const,
                  width: 112,
                  render: (v: MoneyField | null | undefined) => (
                    <MoneyCell value={v ?? 0} />
                  ),
                },
                {
                  title: t('hr.payroll.correction.deltaAmount'),
                  dataIndex: 'deltaAmount' as const,
                  align: 'right' as const,
                  width: 112,
                  render: (v: MoneyField | null | undefined) => (
                    <MoneyCell value={v ?? 0} strong />
                  ),
                },
              ]
            : []),
        ],
      },
      {
        title: t('hr.payroll.entry.flag'),
        dataIndex: 'flag',
        width: 120,
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
    ],
    [
      t,
      showPayslipColumn,
      openingPayslipId,
      contractLinesById,
      canEdit,
      canOverrideDays,
      runId,
      isCorrectionRun,
    ],
  );

  function renderEntryCard(entry: PayrollEntryDetail): React.ReactNode {
    const expanded = expandedEntryIds.has(entry.id);
    const payslipId =
      showPayslipColumn && entry.payslip?.generatedAt ? entry.payslip.id : null;
    const detailsId = `payroll-entry-${entry.id}`;
    return (
      <li key={entry.id} className="erp-payroll-entry-card">
        <div className="erp-payroll-entry-card-head">
          <div className="min-w-0">
            <p className="erp-payroll-employee-name truncate">
              {formatUserName(entry.employee)}
            </p>
            <p className="erp-payroll-employee-id">{entry.employee.employeeId ?? '-'}</p>
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
              {canEdit ? (
                <PayrollPaidDaysControls
                  runId={runId}
                  entry={entry}
                  canOverride={canOverrideDays}
                />
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
            type="text"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => toggleEntryExpanded(entry.id)}
          >
            {expanded
              ? t('hr.payroll.detail.hideDetails')
              : t('hr.payroll.detail.showDetails')}
          </Button>
        </div>
        {expanded ? (
          <div id={detailsId} className="erp-payroll-entry-card-details">
            {renderExpandedRow(entry)}
          </div>
        ) : null}
      </li>
    );
  }

  function renderExpandedRow(row: PayrollEntryDetail): React.ReactNode {
    const canEditBonus =
      canEdit &&
      run &&
      (run.status === 'DRAFT' || run.status === 'REVIEWED');
    const hasLinks = Boolean(
      row.contractId || (row.attendanceRecordId && run) || row.overtimeSheetId,
    );
    return (
      <div className="erp-payroll-entry-detail">
        <div className="erp-payroll-entry-facts">
          {row.flagNote ? (
            <div className="erp-payroll-fact erp-payroll-fact--wide erp-payroll-fact--warning">
              <p className="erp-payroll-fact-label">{t('hr.payroll.entry.flagNote')}</p>
              <p className="erp-payroll-fact-value">{row.flagNote}</p>
            </div>
          ) : null}
          <div className="erp-payroll-fact">
            <p className="erp-payroll-fact-label">{t('hr.payroll.entry.department')}</p>
            <p className="erp-payroll-fact-value">{row.employee.department?.name ?? '-'}</p>
          </div>
          <div className="erp-payroll-fact">
            <p className="erp-payroll-fact-label">{t('hr.payroll.entry.discipline')}</p>
            <p className="erp-payroll-fact-value">
              {row.employee.engineeringDiscipline?.name ?? '-'}
            </p>
          </div>
          <div className="erp-payroll-fact erp-payroll-fact--wide">
            <p className="erp-payroll-fact-label">{t('hr.payroll.entry.bank')}</p>
            <p className="erp-payroll-fact-value">
              {row.bankName ?? '-'}
              {row.bankAccountNumber ? ` · ${row.bankAccountNumber}` : ''}
            </p>
          </div>
          {row.notes ? (
            <div className="erp-payroll-fact erp-payroll-fact--wide">
              <p className="erp-payroll-fact-label">{t('hr.payroll.entry.notes')}</p>
              <p className="erp-payroll-fact-value">{row.notes}</p>
            </div>
          ) : null}
          {parsePayrollMoney(row.contractNetBonus) > 0 ||
          parsePayrollMoney(row.netTopUp) > 0 ? (
            <div className="erp-payroll-fact erp-payroll-fact--wide">
              <p className="erp-payroll-fact-label">
                {t('hr.payroll.entry.netBonus')}
              </p>
              <p className="erp-payroll-fact-value">
                {parsePayrollMoney(row.contractNetBonus) > 0
                  ? t('hr.payroll.entry.contractNetBonusValue', {
                      amount: formatPayrollMoney(row.contractNetBonus, {
                        emptyZero: false,
                      }),
                    })
                  : null}
                {parsePayrollMoney(row.contractNetBonus) > 0 &&
                parsePayrollMoney(row.netTopUp) > 0
                  ? ' · '
                  : null}
                {parsePayrollMoney(row.netTopUp) > 0
                  ? t('hr.payroll.entry.netTopUpValue', {
                      amount: formatPayrollMoney(row.netTopUp, {
                        emptyZero: false,
                      }),
                      reason: row.netTopUpReason?.trim()
                        ? ` - ${row.netTopUpReason.trim()}`
                        : '',
                    })
                  : null}
              </p>
            </div>
          ) : null}
        </div>
        <div className="erp-payroll-entry-side">
          <p className="erp-payroll-fact-label">{t('hr.payroll.entry.salaryPeriods')}</p>
          {row.salaryPeriods.length === 0 ? (
            <p className="erp-payroll-fact-value m-0">-</p>
          ) : (
            <ul className="erp-payroll-entry-periods">
              {row.salaryPeriods.map((period) => {
                const periodOt = parsePayrollMoney(period.totalOtPay);
                return (
                  <li key={period.id}>
                    <span>
                      {dayjs(period.periodStart).format('YYYY-MM-DD')} –{' '}
                      {dayjs(period.periodEnd).format('YYYY-MM-DD')} ·{' '}
                      {parsePayrollMoney(period.days)} {t('hr.payroll.entry.days')}
                      {periodOt > 0
                        ? ` · OT ${formatPayrollMoney(period.totalOtPay, { emptyZero: false })}`
                        : null}
                    </span>
                    <span>
                      {formatPayrollMoney(period.earnedSalary, { emptyZero: false })} ETB
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {(() => {
            const periodsWithOt = row.salaryPeriods.filter(
              (period) => parsePayrollMoney(period.totalOtPay) > 0,
            );
            // Prefer per-period basics when OT was priced across contract changes.
            if (periodsWithOt.length > 1) {
              return (
                <div className="erp-payroll-ot-breakdown">
                  <p className="erp-payroll-fact-label">
                    {t('hr.payroll.entry.otBreakdown')}
                  </p>
                  {periodsWithOt.map((period) => {
                    const periodLines = buildOtBreakdownLines({
                      normalOtHours: period.normalOtHours ?? 0,
                      eveningOtHours: period.eveningOtHours ?? 0,
                      sundayOtHours: period.sundayOtHours ?? 0,
                      holidayOtHours: period.holidayOtHours ?? 0,
                      normalOtPay: period.normalOtPay ?? 0,
                      eveningOtPay: period.eveningOtPay ?? 0,
                      sundayOtPay: period.sundayOtPay ?? 0,
                      holidayOtPay: period.holidayOtPay ?? 0,
                    });
                    if (periodLines.length === 0) return null;
                    const basic = formatPayrollMoney(period.basicSalary, {
                      emptyZero: false,
                    });
                    return (
                      <div key={period.id} className="erp-payroll-ot-period">
                        <p className="erp-payroll-ot-period-label">
                          {dayjs(period.periodStart).format('YYYY-MM-DD')} –{' '}
                          {dayjs(period.periodEnd).format('YYYY-MM-DD')}
                        </p>
                        <ul className="erp-payroll-ot-lines">
                          {periodLines.map((line) => (
                            <li key={line.key}>
                              <span>
                                {t(line.labelKey, {
                                  hours: line.hours,
                                  basic,
                                })}
                              </span>
                              <span>
                                {formatPayrollMoney(line.pay, {
                                  emptyZero: false,
                                })}{' '}
                                ETB
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                  <ul className="erp-payroll-ot-lines">
                    <li className="erp-payroll-ot-total">
                      <span>{t('hr.payroll.entry.otTotal')}</span>
                      <span>
                        {formatPayrollMoney(row.totalOtPay, {
                          emptyZero: false,
                        })}{' '}
                        ETB
                      </span>
                    </li>
                  </ul>
                </div>
              );
            }

            const otLines = buildOtBreakdownLines(row);
            if (otLines.length === 0) return null;
            const basicSource =
              periodsWithOt[0]?.basicSalary ?? row.basicSalary;
            const basic = formatPayrollMoney(basicSource, { emptyZero: false });
            return (
              <div className="erp-payroll-ot-breakdown">
                <p className="erp-payroll-fact-label">
                  {t('hr.payroll.entry.otBreakdown')}
                </p>
                <ul className="erp-payroll-ot-lines">
                  {otLines.map((line) => (
                    <li key={line.key}>
                      <span>
                        {t(line.labelKey, { hours: line.hours, basic })}
                      </span>
                      <span>
                        {formatPayrollMoney(line.pay, { emptyZero: false })} ETB
                      </span>
                    </li>
                  ))}
                  <li className="erp-payroll-ot-total">
                    <span>{t('hr.payroll.entry.otTotal')}</span>
                    <span>
                      {formatPayrollMoney(row.totalOtPay, { emptyZero: false })} ETB
                    </span>
                  </li>
                </ul>
              </div>
            );
          })()}
          {hasLinks ? (
            <div className="erp-payroll-entry-links">
              {row.contractId ? (
                <Link
                  href={`/hr/employee-contract/${row.contractId}`}
                  className="erp-payroll-entry-link"
                >
                  {t('hr.payroll.entry.linkContract')}
                </Link>
              ) : null}
              {row.attendanceRecordId && run ? (
                <Link
                  href={`/hr/attendance/review/${run.month}/${run.year}`}
                  className="erp-payroll-entry-link"
                >
                  {t('hr.payroll.entry.linkAttendance')}
                </Link>
              ) : null}
              {row.overtimeSheetId ? (
                <Link
                  href={`/hr/overtime/${row.overtimeSheetId}`}
                  className="erp-payroll-entry-link"
                >
                  {t('hr.payroll.entry.linkOvertime')}
                </Link>
              ) : null}
            </div>
          ) : null}
          {canEditBonus ? (
            <Button
              onClick={() => {
                setBonusEntry(row);
              }}
            >
              {t('hr.payroll.entry.editBonusTopUp')}
            </Button>
          ) : null}
          {canChangeRun && row.employee.employeeType === 'FREELANCER' ? (
            <Button danger onClick={() => setRemovingEntry(row)}>
              {t('hr.payroll.freelancers.remove')}
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
    if (
      (status === 'SUBMITTED' || status === 'APPROVED' || status === 'GM_APPROVED') &&
      canCreate
    ) {
      add('recalc', t('hr.payroll.actions.recalculate'), 'recalculate');
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
          key="unlock"
          onClick={() => setUnlockModalOpen(true)}
          loading={unlockMutation.isPending}
        >
          {t('hr.payroll.actions.unlockRun')}
        </Button>,
      );
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
    cancelMutation.isPending;

  if (!canAccess) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-payroll-page erp-payroll-v2">
        <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (detailQuery.isLoading && !run) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-payroll-page erp-payroll-v2">
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
      <div className="erp-pro-list-page erp-users-page erp-payroll-page erp-payroll-v2">
        <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-payroll-page erp-payroll-v2">
        <Alert type="error" showIcon title={t('hr.payroll.detail.notFound')} />
      </div>
    );
  }

  const confirmMeta = confirmAction ? confirmCopy(confirmAction) : null;

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
          <Alert
            type="warning"
            showIcon
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
        title={t('hr.payroll.actions.unlockRun')}
        open={unlockModalOpen}
        onCancel={() => setUnlockModalOpen(false)}
        okText={t('hr.payroll.actions.unlockConfirm')}
        okButtonProps={{ danger: true }}
        confirmLoading={unlockMutation.isPending}
        onOk={() => {
          void (async () => {
            try {
              await unlockMutation.mutateAsync();
              messageApi.success(t('hr.payroll.actions.unlockSuccess'));
              setUnlockModalOpen(false);
            } catch (error) {
              notifyApiError(error, t('hr.payroll.actions.unlockRun'), messageApi, t);
            }
          })();
        }}
        destroyOnHidden
        className="erp-payroll-modal"
      >
        <p className="erp-payroll-modal-hint">{t('hr.payroll.correction.unlockHint')}</p>
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

      <Modal
        title={t('hr.payroll.entry.editBonusTopUp')}
        open={Boolean(bonusEntry)}
        onCancel={() => {
          setBonusEntry(null);
          setBonusPreview({ treatment: 'taxable', amount: 0 });
          bonusForm.resetFields();
        }}
        onOk={() => void saveBonusTopUp()}
        confirmLoading={updateEntryMutation.isPending}
        destroyOnHidden
        className="erp-payroll-modal"
      >
        {bonusEntry ? (
          <div className="mb-3 text-sm text-[var(--erp-text-secondary,#6B7280)]">
            {parsePayrollMoney(bonusEntry.bonusTopUp) > 0 ? (
              <p className="m-0">
                {t('hr.payroll.entry.currentTaxableTopUp', {
                  amount: formatPayrollMoney(bonusEntry.bonusTopUp, {
                    emptyZero: false,
                  }),
                  reason: bonusEntry.bonusTopUpReason?.trim()
                    ? ` - ${bonusEntry.bonusTopUpReason.trim()}`
                    : '',
                })}
              </p>
            ) : null}
            {parsePayrollMoney(bonusEntry.netTopUp) > 0 ? (
              <p className="m-0">
                {t('hr.payroll.entry.currentNetTopUp', {
                  amount: formatPayrollMoney(bonusEntry.netTopUp, {
                    emptyZero: false,
                  }),
                  reason: bonusEntry.netTopUpReason?.trim()
                    ? ` - ${bonusEntry.netTopUpReason.trim()}`
                    : '',
                })}
              </p>
            ) : null}
            {parsePayrollMoney(bonusEntry.contractNetBonus) > 0 ? (
              <p className="m-0">
                {t('hr.payroll.entry.contractNetBonusValue', {
                  amount: formatPayrollMoney(bonusEntry.contractNetBonus, {
                    emptyZero: false,
                  }),
                })}
              </p>
            ) : null}
          </div>
        ) : null}
        <Form
          form={bonusForm}
          layout="vertical"
          initialValues={{ treatment: 'taxable', amount: 0, reason: '' }}
          onValuesChange={(_, all) => {
            setBonusPreview({
              treatment: (all.treatment as 'taxable' | 'net' | undefined) ?? 'taxable',
              amount:
                typeof all.amount === 'number' && Number.isFinite(all.amount)
                  ? all.amount
                  : 0,
            });
          }}
        >
          <Form.Item
            name="treatment"
            label={t('hr.payroll.entry.bonusTreatment')}
            rules={[{ required: true }]}
          >
            <Radio.Group
              onChange={(e) => {
                if (!bonusEntry) {
                  return;
                }
                const next = e.target.value as 'taxable' | 'net';
                const amount =
                  next === 'net'
                    ? parsePayrollMoney(bonusEntry.netTopUp)
                    : parsePayrollMoney(bonusEntry.bonusTopUp);
                const reason =
                  next === 'net'
                    ? (bonusEntry.netTopUpReason ?? '')
                    : (bonusEntry.bonusTopUpReason ?? '');
                bonusForm.setFieldsValue({ amount, reason });
                setBonusPreview({ treatment: next, amount });
              }}
              options={[
                {
                  value: 'taxable',
                  label: t('hr.payroll.entry.treatmentTaxable'),
                },
                {
                  value: 'net',
                  label: t('hr.payroll.entry.treatmentNet'),
                },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="amount"
            label={
              bonusPreview.treatment === 'net'
                ? t('hr.payroll.entry.netTopUpAmount')
                : t('hr.payroll.entry.bonusTopUpAmount')
            }
            rules={[
              { required: true, message: t('hr.payroll.entry.bonusTopUpRequired') },
            ]}
          >
            <InputNumber min={0} precision={2} className="w-full" />
          </Form.Item>
          <Form.Item
            name="reason"
            label={
              bonusPreview.treatment === 'net'
                ? t('hr.payroll.entry.netTopUpReason')
                : t('hr.payroll.entry.bonusTopUpReason')
            }
            rules={[
              ({ getFieldValue }) => ({
                validator(_, value) {
                  const amount = getFieldValue('amount') as number | undefined;
                  if (amount != null && amount !== 0 && !String(value ?? '').trim()) {
                    return Promise.reject(
                      new Error(t('hr.payroll.entry.bonusReasonRequired')),
                    );
                  }
                  return Promise.resolve();
                },
              }),
            ]}
          >
            <Input.TextArea rows={3} maxLength={500} />
          </Form.Item>
          {bonusEntry && bonusPreview.amount > 0 ? (
            <Alert
              type="info"
              showIcon
              title={t('hr.payroll.entry.netIncreasePreview', {
                amount: formatPayrollMoney(
                  estimateNetIncrease(
                    bonusPreview.treatment,
                    bonusPreview.amount,
                    parsePayrollMoney(bonusEntry.taxableIncome),
                  ),
                  { emptyZero: false },
                ),
              })}
            />
          ) : null}
        </Form>
      </Modal>

      <section className="erp-pro-card erp-payroll-hero">
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
          </div>
          {renderActionButtons(run.status)}
        </div>

        {isCorrectionRun ? (
          <Alert
            className="mt-3"
            type="info"
            showIcon
            title={t('hr.payroll.correction.bannerTitle', {
              period: formatPayrollPeriod(
                run.originalRun?.month ?? run.month,
                run.originalRun?.year ?? run.year,
              ),
            })}
            description={
              <div className="flex flex-col gap-1">
                <span>{t('hr.payroll.correction.bannerBody')}</span>
                {run.originalRunId ? (
                  <Link href={`/hr/payroll/${run.originalRunId}`}>
                    {t('hr.payroll.correction.viewOriginal', {
                      runNumber: run.originalRun?.runNumber ?? run.originalRunId,
                    })}
                  </Link>
                ) : null}
              </div>
            }
          />
        ) : null}

        {run.attendanceSnapshotStale ? (
          <Alert
            className="mt-3"
            type="warning"
            showIcon
            title={
              run.status === 'DRAFT' || run.status === 'REVIEWED'
                ? t('hr.payroll.actions.attendanceStaleDraft')
                : t('hr.payroll.actions.attendanceStaleApproved')
            }
          />
        ) : null}
        {run.policyReviewRequired ? (
          <Alert
            className="mt-3"
            type="warning"
            showIcon
            title={t('hr.payroll.actions.policyReviewRequired')}
            description={run.policyReviewNote ?? undefined}
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
                    who={resolveUserLabel(run.submittedBy, userDirectory)}
                    when={run.submittedAt}
                  />
                ) : undefined,
              },
              {
                title: t('hr.payroll.steps.hrApproved'),
                content: run.approvedAt ? (
                  <StepMeta
                    who={resolveUserLabel(run.approvedBy, userDirectory)}
                    when={run.approvedAt}
                  />
                ) : undefined,
              },
              {
                title: t('hr.payroll.steps.gmApproved'),
                content: run.gmApprovedAt ? (
                  <StepMeta
                    who={resolveUserLabel(run.gmApprovedBy, userDirectory)}
                    when={run.gmApprovedAt}
                  />
                ) : undefined,
              },
              {
                title: t('hr.payroll.steps.paid'),
                content: run.paidAt ? (
                  <StepMeta
                    who={resolveUserLabel(run.paidBy, userDirectory)}
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

      {canCreate && (run.status === 'GM_APPROVED' || run.status === 'PAID') ? (
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

      {totalFlagged > 0 ? (
        <Alert
          type="warning"
          showIcon
          title={t('hr.payroll.detail.flaggedBanner', { count: totalFlagged })}
          action={
            flaggedOnly ? undefined : (
              <Button size="small" onClick={() => setFlaggedOnly(true)}>
                {t('hr.payroll.detail.showFlaggedOnly')}
              </Button>
            )
          }
        />
      ) : null}

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
              {t('hr.payroll.freelancers.add')}
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
            // Fixed x wider than the columns yields fractional widths; the header copies rounded ones and drifts.
            scroll={{ x: 'max-content', y: 'max(320px, calc(100dvh - 300px))' }}
            className="erp-payroll-entries-table"
            rowClassName={(row) =>
              contractLinesById.get(row.id) ? 'erp-payroll-row--split' : ''
            }
            pagination={false}
            expandable={{
              expandedRowRender: renderExpandedRow,
            }}
            summary={() =>
              totalsRow ? (
                <Table.Summary fixed="bottom">
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} />
                    <Table.Summary.Cell index={1}>
                      <strong>{t('hr.payroll.entry.totals')}</strong>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={2} />
                    <Table.Summary.Cell index={3} align="right">
                      <MoneyCell value={totalsRow.basicSalary} strong />
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={4} align="right">
                      <MoneyCell value={totalsRow.earnedSalary} strong />
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={5} align="right">
                      <MoneyCell value={totalsRow.totalOtPay} strong />
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6} align="right">
                      <MoneyCell value={totalsRow.transport} strong />
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={7} align="right">
                      <MoneyCell value={totalsRow.bonus} strong />
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={8} align="right">
                      <MoneyCell value={totalsRow.gross} strong />
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={9} align="right">
                      <MoneyCell value={totalsRow.taxable} strong />
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={10} align="right">
                      <MoneyCell value={totalsRow.pension} strong />
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={11} align="right">
                      <MoneyCell value={totalsRow.tax} strong />
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={12} align="right">
                      <MoneyCell value={totalsRow.netBonus} strong />
                    </Table.Summary.Cell>
                    <Table.Summary.Cell
                      index={13}
                      align="right"
                      className="erp-payroll-col-net"
                    >
                      <MoneyCell value={totalsRow.net} strong />
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={14} />
                    {showPayslipColumn ? <Table.Summary.Cell index={15} /> : null}
                  </Table.Summary.Row>
                </Table.Summary>
              ) : null
            }
          />
        )}
      </section>
    </div>
  );
}
