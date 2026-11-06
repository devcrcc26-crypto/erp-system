'use client';

import './attendance-v2.css';
import '@/components/modules/hr/import-export/hr-import-v2.css';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Collapse,
  Drawer,
  Input,
  Popconfirm,
  Select,
  Space,
  Spin,
  Steps,
  Table,
  Tag,
  Upload,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { UploadProps } from 'antd';
import {
  CheckCircleFilled,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  InboxOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  getAttendanceImportHistory,
  searchAttendanceEmployees,
  unignoreAttendancePreviewRow,
} from '@/lib/api/attendance.api';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  AttendanceEmployeeSearchResult,
  AttendanceImportBatch,
  AttendanceImportSummary,
  AttendanceMissingEmployee,
  AttendancePreviewResult,
  AttendancePreviewRow,
  IgnoreAttendanceRowDto,
  ManualAssignmentDto,
  MatchConfidence,
  MissingEmployeeImportActionDto,
} from '@/lib/api/attendance.types';
import Link from 'next/link';
import {
  useAttendanceImportConfirm,
  useAttendanceImportPreview,
} from '@/lib/query/attendance';
import { formatDisplayDateTime } from '@/lib/utils/date-format';
import { formatOrdinal } from '@/lib/utils/ordinal';
import { formatUserName } from '@/lib/utils/user-display';
import {
  DRAWER_WIDTH_SUBMITTAL,
  detailDrawerStyles,
  responsiveDetailDrawerClassName,
} from '@/lib/theme/layout';
import { CheckCircle2, FileSpreadsheet, ListChecks } from 'lucide-react';

export interface AttendanceImportModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type ImportStep = 0 | 1 | 2;

type MatchedRow = AttendancePreviewRow & { matchedIndex: number };
type ReviewRow = AttendancePreviewRow & { reviewIndex: number };
type RejectedRow = AttendancePreviewRow & { rejectedIndex: number };
type IgnoredPreviewRow = AttendancePreviewRow & { ignoredIndex: number };
type MissingRow = AttendanceMissingEmployee;
type MissingResolution =
  | 'NONE'
  | 'MARKED_EXEMPT'
  | 'MANUAL_PRESENT'
  | 'NEEDS_ENROLMENT';
type MissingResolutionState = {
  resolution: MissingResolution;
  note: string;
};

type EditingCell =
  | { bucket: 'review'; index: number }
  | { bucket: 'rejected'; index: number }
  | null;

type EmployeeLabel = {
  id: string;
  name: string;
  employeeId: string | null;
};

function formatEmployeeLabel(employee: {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  chineseName?: string | null;
  employeeId: string | null;
}): string {
  const name = formatUserName(employee);
  return employee.employeeId ? `${name} (${employee.employeeId})` : name;
}

function matchTypeLabel(
  confidence: MatchConfidence,
  t: (key: string) => string,
): string {
  if (confidence === 'IDENTITY') {
    return t('pages.hr.attendance.importModal.matchIdentity');
  }
  if (confidence === 'ID_MATCH') {
    return t('pages.hr.attendance.importModal.matchId');
  }
  if (confidence === 'MAPPED_INACTIVE') {
    return t('pages.hr.attendance.importModal.matchMappedInactive');
  }
  if (confidence === 'MANUAL') {
    return t('pages.hr.attendance.importModal.matchManual');
  }
  return t('pages.hr.attendance.importModal.matchName');
}

function matchTypeColor(confidence: MatchConfidence): string {
  if (confidence === 'IDENTITY') {
    return 'cyan';
  }
  if (confidence === 'ID_MATCH') {
    return 'blue';
  }
  if (confidence === 'MAPPED_INACTIVE') {
    return 'orange';
  }
  if (confidence === 'MANUAL') {
    return 'purple';
  }
  return 'green';
}

/**
 * Three-step Deli e+ attendance import: upload → review → done.
 */
export default function AttendanceImportModal({
  open,
  onClose,
  onSuccess,
}: AttendanceImportModalProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const previewMutation = useAttendanceImportPreview();
  const confirmMutation = useAttendanceImportConfirm();

  const [step, setStep] = useState<ImportStep>(0);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<AttendancePreviewResult | null>(null);
  const [importResult, setImportResult] =
    useState<AttendanceImportSummary | null>(null);
  const [reviewSelections, setReviewSelections] = useState<
    Record<number, boolean>
  >({});
  /** reviewIndex → ERP employee user id */
  const [reviewOverrides, setReviewOverrides] = useState<
    Record<number, string>
  >({});
  /** rejectedIndex → ERP employee user id */
  const [rejectedAssignments, setRejectedAssignments] = useState<
    Record<number, string>
  >({});
  /** missing employee id → resolution for the import month */
  const [missingResolutions, setMissingResolutions] = useState<
    Record<string, MissingResolutionState>
  >({});
  /** rejectedIndex → ignore reason (left company) */
  const [ignoredReasons, setIgnoredReasons] = useState<Record<number, string>>(
    {},
  );
  const [ignoreReasonDrafts, setIgnoreReasonDrafts] = useState<
    Record<number, string>
  >({});
  const [employeeLabels, setEmployeeLabels] = useState<
    Record<string, EmployeeLabel>
  >({});
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [employeeSearchResults, setEmployeeSearchResults] = useState<
    AttendanceEmployeeSearchResult[]
  >([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [existingBatch, setExistingBatch] =
    useState<AttendanceImportBatch | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rejectedExpanded, setRejectedExpanded] = useState(false);
  const [unignoringIndex, setUnignoringIndex] = useState<number | null>(null);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetState = useCallback((): void => {
    setStep(0);
    setUploading(false);
    setConfirming(false);
    setPreview(null);
    setImportResult(null);
    setReviewSelections({});
    setReviewOverrides({});
    setRejectedAssignments({});
    setMissingResolutions({});
    setIgnoredReasons({});
    setIgnoreReasonDrafts({});
    setEmployeeLabels({});
    setEditingCell(null);
    setEmployeeSearchResults([]);
    setSearchLoading(false);
    setExistingBatch(null);
    setErrorMessage(null);
    setUnignoringIndex(null);
    setRejectedExpanded(false);
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  const handleClose = useCallback((): void => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const handleImportAnother = useCallback((): void => {
    resetState();
  }, [resetState]);

  const handleDoneClose = useCallback((): void => {
    resetState();
    onClose();
    onSuccess();
  }, [onClose, onSuccess, resetState]);

  const monthName = preview ? t(`hr.months.${preview.month}`) : '';

  const selectedReviewCount = useMemo(() => {
    if (!preview) {
      return 0;
    }
    return preview.review.reduce(
      (sum, _, index) => sum + (reviewSelections[index] ? 1 : 0),
      0,
    );
  }, [preview, reviewSelections]);

  const manuallyAssignedCount = useMemo(
    () => Object.keys(rejectedAssignments).length,
    [rejectedAssignments],
  );

  const reviewOverrideCount = useMemo(
    () => Object.keys(reviewOverrides).length,
    [reviewOverrides],
  );

  const skippedReviewCount =
    (preview?.review.length ?? 0) - selectedReviewCount;
  const importCount =
    (preview?.matched.length ?? 0) +
    selectedReviewCount +
    manuallyAssignedCount;
  const ignoredLocalCount = Object.keys(ignoredReasons).length;
  const rejectedCount =
    (preview?.rejected.length ?? 0) -
    manuallyAssignedCount -
    ignoredLocalCount;
  const totalIgnoredCount =
    (preview?.ignored?.length ?? 0) + ignoredLocalCount;

  /** Employee IDs already claimed by auto-match, included review, or manual picks. */
  const takenEmployeeIds = useMemo(() => {
    const taken = new Set<string>();
    if (!preview) {
      return taken;
    }
    for (const row of preview.matched) {
      if (row.matchedEmployeeId) {
        taken.add(row.matchedEmployeeId);
      }
    }
    preview.review.forEach((row, index) => {
      if (!reviewSelections[index]) {
        return;
      }
      const overrideId = reviewOverrides[index];
      if (overrideId) {
        taken.add(overrideId);
      } else if (row.matchedEmployeeId) {
        taken.add(row.matchedEmployeeId);
      }
    });
    for (const employeeId of Object.values(rejectedAssignments)) {
      taken.add(employeeId);
    }
    return taken;
  }, [preview, reviewSelections, reviewOverrides, rejectedAssignments]);

  const searchOptions = useMemo(() => {
    return employeeSearchResults
      .filter((employee) => {
        if (!takenEmployeeIds.has(employee.id)) {
          return true;
        }
        if (
          editingCell?.bucket === 'review' &&
          reviewOverrides[editingCell.index] === employee.id
        ) {
          return true;
        }
        if (
          editingCell?.bucket === 'rejected' &&
          rejectedAssignments[editingCell.index] === employee.id
        ) {
          return true;
        }
        return false;
      })
      .map((employee) => ({
        value: employee.id,
        label: formatEmployeeLabel(employee),
      }));
  }, [
    employeeSearchResults,
    takenEmployeeIds,
    editingCell,
    reviewOverrides,
    rejectedAssignments,
  ]);

  function rememberEmployeeLabel(
    employee: AttendanceEmployeeSearchResult,
  ): void {
    setEmployeeLabels((prev) => ({
      ...prev,
      [employee.id]: {
        id: employee.id,
        name: formatUserName(employee),
        employeeId: employee.employeeId,
      },
    }));
  }

  function handleEmployeeSearch(query: string): void {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = setTimeout(() => {
      void (async () => {
        const trimmed = query.trim();
        if (trimmed.length < 2) {
          setEmployeeSearchResults([]);
          setSearchLoading(false);
          return;
        }
        setSearchLoading(true);
        try {
          const results = await searchAttendanceEmployees(trimmed);
          setEmployeeSearchResults(results);
        } catch {
          setEmployeeSearchResults([]);
        } finally {
          setSearchLoading(false);
        }
      })();
    }, 300);
  }

  function applyReviewOverride(rowIndex: number, employeeId: string): void {
    const employee = employeeSearchResults.find((row) => row.id === employeeId);
    if (employee) {
      rememberEmployeeLabel(employee);
    }
    setReviewOverrides((prev) => ({ ...prev, [rowIndex]: employeeId }));
    setReviewSelections((prev) => ({ ...prev, [rowIndex]: true }));
    setEditingCell(null);
    setEmployeeSearchResults([]);
  }

  function applyRejectedAssignment(
    rowIndex: number,
    employeeId: string,
  ): void {
    const employee = employeeSearchResults.find((row) => row.id === employeeId);
    if (employee) {
      rememberEmployeeLabel(employee);
    }
    setRejectedAssignments((prev) => ({ ...prev, [rowIndex]: employeeId }));
    setEditingCell(null);
    setEmployeeSearchResults([]);
  }

  async function handleFileSelected(file: File): Promise<void> {
    setErrorMessage(null);
    setUploading(true);
    setExistingBatch(null);
    try {
      const result = await previewMutation.mutateAsync(file);
      const initial: Record<number, boolean> = {};
      result.review.forEach((_, index) => {
        initial[index] = true;
      });
      setReviewSelections(initial);
      setReviewOverrides({});
      setRejectedAssignments({});
      // Still not enrolled from an earlier month → pre-select Needs enrolment.
      setMissingResolutions(
        Object.fromEntries(
          result.missingFromAttendance
            .filter((row) => row.suggestedResolution === 'NEEDS_ENROLMENT')
            .map((row) => [
              row.id,
              { resolution: 'NEEDS_ENROLMENT' as MissingResolution, note: '' },
            ]),
        ),
      );
      setIgnoredReasons({});
      setIgnoreReasonDrafts({});
      setEmployeeLabels({});
      setEditingCell(null);
      setEmployeeSearchResults([]);
      setPreview({
        ...result,
        ignored: result.ignored ?? [],
        missingFromAttendance: result.missingFromAttendance ?? [],
      });

      if (result.alreadyImported) {
        try {
          const history = await getAttendanceImportHistory();
          const batch =
            history.find(
              (row) => row.month === result.month && row.year === result.year,
            ) ?? null;
          setExistingBatch(batch);
        } catch {
          setExistingBatch(null);
        }
      }

      setStep(1);
    } catch (error) {
      setPreview(null);
      setErrorMessage(
        error instanceof ApiRequestError
          ? error.message
          : t('pages.hr.attendance.importModal.previewFailed'),
      );
    } finally {
      setUploading(false);
    }
  }

  const uploadProps: UploadProps = {
    accept:
      '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    maxCount: 1,
    multiple: false,
    showUploadList: false,
    disabled: uploading,
    beforeUpload: (file) => {
      void handleFileSelected(file);
      return false;
    },
  };

  async function runConfirm(overwrite: boolean): Promise<void> {
    if (!preview) {
      return;
    }
    setErrorMessage(null);
    setConfirming(true);
    try {
      const confirmedReviewIndices = Object.entries(reviewSelections)
        .filter(([, include]) => include)
        .map(([idx]) => Number(idx));

      const manualAssignments: ManualAssignmentDto[] = [
        ...Object.entries(reviewOverrides).map(([idx, employeeId]) => ({
          rowIndex: Number(idx),
          bucket: 'review' as const,
          employeeId,
        })),
        ...Object.entries(rejectedAssignments).map(([idx, employeeId]) => ({
          rowIndex: Number(idx),
          bucket: 'rejected' as const,
          employeeId,
        })),
      ];

      const missingEmployeeActions: MissingEmployeeImportActionDto[] = [];
      for (const [employeeId, state] of Object.entries(missingResolutions)) {
        if (state.resolution === 'NONE') {
          continue;
        }
        if (
          state.resolution === 'MANUAL_PRESENT' &&
          state.note.trim().length < 3
        ) {
          setErrorMessage(
            t('pages.hr.attendance.importModal.missingPresentReasonRequired'),
          );
          setConfirming(false);
          return;
        }
        missingEmployeeActions.push({
          employeeId,
          resolution: state.resolution,
          ...(state.note.trim() ? { note: state.note.trim() } : {}),
        });
      }

      const ignoredRows: IgnoreAttendanceRowDto[] = Object.entries(
        ignoredReasons,
      ).map(([idx, reason]) => ({
        rowIndex: Number(idx),
        reason,
      }));

      const result = await confirmMutation.mutateAsync({
        previewToken: preview.previewToken,
        overwrite,
        confirmedReviewIndices,
        manualAssignments,
        ignoredRows,
        missingEmployeeActions,
      });
      setImportResult(result);
      setStep(2);
    } catch (error) {
      setErrorMessage(
        error instanceof ApiRequestError
          ? error.message
          : t('pages.hr.attendance.importModal.confirmFailed'),
      );
    } finally {
      setConfirming(false);
    }
  }

  function handleBackToUpload(): void {
    setStep(0);
    setPreview(null);
    setReviewSelections({});
    setReviewOverrides({});
    setRejectedAssignments({});
    setMissingResolutions({});
    setIgnoredReasons({});
    setIgnoreReasonDrafts({});
    setEmployeeLabels({});
    setEditingCell(null);
    setEmployeeSearchResults([]);
    setExistingBatch(null);
    setErrorMessage(null);
    setUnignoringIndex(null);
  }

  /**
   * Clears a stored IGNORED identity and moves the row into Rejected so it can
   * be assigned on this import.
   */
  async function handleUnignoreStored(ignoredIndex: number): Promise<void> {
    if (!preview) {
      return;
    }
    setUnignoringIndex(ignoredIndex);
    setErrorMessage(null);
    try {
      const result = await unignoreAttendancePreviewRow({
        previewToken: preview.previewToken,
        ignoredIndex,
      });
      setPreview({
        ...preview,
        ignored: result.ignored,
        rejected: result.rejected,
      });
      setRejectedExpanded(true);
    } catch (error) {
      setErrorMessage(
        error instanceof ApiRequestError
          ? error.message
          : t('pages.hr.attendance.importModal.unignoreFailed'),
      );
    } finally {
      setUnignoringIndex(null);
    }
  }

  function renderEmployeeSelect(
    onSelect: (employeeId: string) => void,
  ): React.ReactNode {
    return (
      <Select
        showSearch
        autoFocus
        placeholder={t(
          'pages.hr.attendance.importModal.searchEmployeePlaceholder',
        )}
        filterOption={false}
        loading={searchLoading}
        options={searchOptions}
        style={{ width: 240 }}
        getPopupContainer={() => document.body}
        onSearch={handleEmployeeSearch}
        onChange={(value: string | undefined) => {
          if (value) {
            onSelect(value);
          }
        }}
        onBlur={() => {
          setTimeout(() => {
            setEditingCell(null);
            setEmployeeSearchResults([]);
          }, 200);
        }}
      />
    );
  }

  const matchedColumns: ColumnsType<MatchedRow> = [
    {
      title: t('pages.hr.attendance.importModal.colAttendanceName'),
      dataIndex: 'attendanceName',
      key: 'attendanceName',
      ellipsis: true,
    },
    {
      title: t('pages.hr.attendance.importModal.colErpName'),
      dataIndex: 'matchedEmployeeName',
      key: 'matchedEmployeeName',
      ellipsis: true,
      render: (value: string | null) => value ?? '-',
    },
    {
      title: t('pages.hr.attendance.importModal.colEmployeeId'),
      dataIndex: 'matchedEmployeeErpId',
      key: 'matchedEmployeeErpId',
      width: 120,
      render: (value: string | null) => value ?? '-',
    },
    {
      title: t('pages.hr.attendance.importModal.colMatchType'),
      dataIndex: 'confidence',
      key: 'confidence',
      width: 120,
      render: (confidence: MatchConfidence) => (
        <Tag color={matchTypeColor(confidence)}>
          {matchTypeLabel(confidence, t)}
        </Tag>
      ),
    },
  ];

  const reviewColumns: ColumnsType<ReviewRow> = [
    {
      title: t('pages.hr.attendance.importModal.colAttendanceName'),
      dataIndex: 'attendanceName',
      key: 'attendanceName',
      ellipsis: true,
      width: 150,
    },
    {
      title: t('pages.hr.attendance.importModal.colBestMatch'),
      key: 'bestMatch',
      ellipsis: true,
      render: (_: unknown, row: ReviewRow) => {
        const overrideId = reviewOverrides[row.reviewIndex];
        if (overrideId) {
          const label = employeeLabels[overrideId];
          return (
            <span className="inline-flex items-center gap-1">
              {label?.name ?? row.matchedEmployeeName ?? '-'}
              <Tag color="purple">
                {t('pages.hr.attendance.importModal.matchManual')}
              </Tag>
            </span>
          );
        }
        return (
          <Space orientation="vertical" size={0}>
            <span>{row.matchedEmployeeName ?? '-'}</span>
            {row.matchNote ? (
              <span className="text-[11px] text-amber-700">{row.matchNote}</span>
            ) : null}
          </Space>
        );
      },
    },
    {
      title: t('pages.hr.attendance.importModal.colEmployeeId'),
      key: 'employeeId',
      width: 110,
      render: (_: unknown, row: ReviewRow) => {
        const overrideId = reviewOverrides[row.reviewIndex];
        if (overrideId) {
          return employeeLabels[overrideId]?.employeeId ?? '-';
        }
        return row.matchedEmployeeErpId ?? '-';
      },
    },
    {
      title: t('pages.hr.attendance.importModal.colScore'),
      dataIndex: 'score',
      key: 'score',
      width: 70,
      align: 'right',
      render: (_: unknown, row: ReviewRow) => {
        if (reviewOverrides[row.reviewIndex]) {
          return '-';
        }
        return row.score == null ? '-' : `${row.score}%`;
      },
    },
    {
      title: t('pages.hr.attendance.importModal.colInclude'),
      key: 'include',
      width: 80,
      align: 'center',
      render: (_: unknown, row: ReviewRow) => (
        <Checkbox
          checked={reviewSelections[row.reviewIndex] ?? false}
          onChange={(event) => {
            setReviewSelections((prev) => ({
              ...prev,
              [row.reviewIndex]: event.target.checked,
            }));
          }}
        />
      ),
    },
    {
      title: t('pages.hr.attendance.importModal.colAssign'),
      key: 'override',
      width: 250,
      render: (_: unknown, row: ReviewRow) => {
        const isEditing =
          editingCell?.bucket === 'review' &&
          editingCell.index === row.reviewIndex;
        if (isEditing) {
          return renderEmployeeSelect((employeeId) =>
            applyReviewOverride(row.reviewIndex, employeeId),
          );
        }
        return (
          <Button
            type="link"
            className="!px-0"
            onClick={() => {
              setEmployeeSearchResults([]);
              setEditingCell({ bucket: 'review', index: row.reviewIndex });
            }}
          >
            {t('pages.hr.attendance.importModal.changeEmployee')}
          </Button>
        );
      },
    },
  ];

  const missingColumns: ColumnsType<MissingRow> = [
    {
      title: t('pages.hr.attendance.importModal.colErpName'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, row: MissingRow) => (
        <div className="flex min-w-0 flex-col items-start gap-1">
          <span className="text-[13px] font-medium text-slate-900">{name}</span>
          {row.notEnrolledMonth ? (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200 ring-inset">
              {t('pages.hr.attendance.importModal.notEnrolledMonth', {
                n: row.notEnrolledMonth,
                ordinal: formatOrdinal(row.notEnrolledMonth),
              })}
            </span>
          ) : null}
          {row.fullyCovered && row.coverageLabel ? (
            <Tag color="blue" className="m-0 rounded-full">
              {row.coverageLabel}
            </Tag>
          ) : null}
          {!row.fullyCovered && row.coverageLabel ? (
            <Tag className="m-0 rounded-full">{row.coverageLabel}</Tag>
          ) : null}
        </div>
      ),
    },
    {
      title: t('pages.hr.attendance.importModal.colEmployeeId'),
      dataIndex: 'employeeId',
      key: 'employeeId',
      width: 120,
      render: (value: string | null) => value ?? '-',
    },
    {
      title: t('pages.hr.attendance.importModal.colDepartment'),
      dataIndex: 'departmentName',
      key: 'departmentName',
      ellipsis: true,
      render: (value: string | null) => value ?? '-',
    },
    {
      title: t('pages.hr.attendance.importModal.colPresence'),
      key: 'presence',
      width: 320,
      render: (_: unknown, row: MissingRow) => {
        if (row.fullyCovered) {
          return (
            <span className="text-[12px] text-slate-600">
              {t('pages.hr.attendance.importModal.coveredAutoImport')}
            </span>
          );
        }
        const state = missingResolutions[row.id] ?? {
          resolution: 'NONE' as MissingResolution,
          note: '',
        };
        return (
          <Space orientation="vertical" size={4} style={{ width: '100%' }}>
            <Select
              size="small"
              style={{ width: '100%' }}
              value={state.resolution}
              options={[
                {
                  value: 'NONE',
                  label: t('pages.hr.attendance.importModal.missingActionNone'),
                },
                {
                  value: 'MARKED_EXEMPT',
                  label: t(
                    'pages.hr.attendance.importModal.missingActionExempt',
                  ),
                },
                {
                  value: 'MANUAL_PRESENT',
                  label: t(
                    'pages.hr.attendance.importModal.missingActionPresent',
                  ),
                },
                {
                  value: 'NEEDS_ENROLMENT',
                  label: t(
                    'pages.hr.attendance.importModal.missingActionEnrolment',
                  ),
                },
              ]}
              onChange={(resolution: MissingResolution) => {
                setMissingResolutions((prev) => ({
                  ...prev,
                  [row.id]: {
                    resolution,
                    note: prev[row.id]?.note ?? '',
                  },
                }));
              }}
            />
            {state.resolution === 'MANUAL_PRESENT' ? (
              <Input
                size="small"
                placeholder={t(
                  'pages.hr.attendance.importModal.missingPresentReasonPlaceholder',
                )}
                value={state.note}
                onChange={(event) => {
                  const note = event.target.value;
                  setMissingResolutions((prev) => ({
                    ...prev,
                    [row.id]: {
                      resolution: 'MANUAL_PRESENT',
                      note,
                    },
                  }));
                }}
              />
            ) : null}
            <Link
              href={`/approvals/new/site-assignment`}
              className="text-[12px]"
              target="_blank"
            >
              {t('pages.hr.attendance.importModal.submitSiteAssignment')}
            </Link>
          </Space>
        );
      },
    },
  ];

  const rejectedColumns: ColumnsType<RejectedRow> = [
    {
      title: t('pages.hr.attendance.importModal.colAttendanceName'),
      dataIndex: 'attendanceName',
      key: 'attendanceName',
      ellipsis: true,
      width: 160,
    },
    {
      title: t('pages.hr.attendance.importModal.colIdInSystem'),
      dataIndex: 'attendanceId',
      key: 'attendanceId',
      width: 110,
      render: (value: string) => (value && value !== '-' ? value : '-'),
    },
    {
      title: t('pages.hr.attendance.importModal.colReason'),
      key: 'status',
      width: 260,
      render: (_: unknown, row: RejectedRow) => {
        const assignedId = rejectedAssignments[row.rejectedIndex];
        if (assignedId) {
          const label = employeeLabels[assignedId];
          const name = label
            ? `${label.name}${label.employeeId ? ` (${label.employeeId})` : ''}`
            : assignedId;
          return (
            <span className="inline-flex items-center gap-1 text-[#639922]">
              <CheckCircleOutlined />
              {t('pages.hr.attendance.importModal.assignedTo', { name })}
            </span>
          );
        }
        return t('pages.hr.attendance.importModal.rejectedReason');
      },
    },
    {
      title: t('pages.hr.attendance.importModal.colAssign'),
      key: 'assign',
      width: 250,
      render: (_: unknown, row: RejectedRow) => {
        const isEditing =
          editingCell?.bucket === 'rejected' &&
          editingCell.index === row.rejectedIndex;
        const assignedId = rejectedAssignments[row.rejectedIndex];

        if (isEditing) {
          return renderEmployeeSelect((employeeId) =>
            applyRejectedAssignment(row.rejectedIndex, employeeId),
          );
        }

        if (assignedId) {
          return (
            <Button
              type="link"
              className="!px-0"
              onClick={() => {
                setEmployeeSearchResults([]);
                setEditingCell({
                  bucket: 'rejected',
                  index: row.rejectedIndex,
                });
              }}
            >
              {t('pages.hr.attendance.importModal.changeEmployee')}
            </Button>
          );
        }

        return (
          <Space size={8} wrap>
            <Button
              type="link"
              className="!px-0"
              onClick={() => {
                setEmployeeSearchResults([]);
                setEditingCell({
                  bucket: 'rejected',
                  index: row.rejectedIndex,
                });
              }}
            >
              {t('pages.hr.attendance.importModal.assignEmployee')}
            </Button>
            <Popconfirm
              title={t('pages.hr.attendance.importModal.ignoreTitle')}
              description={
                <Input.TextArea
                  rows={2}
                  placeholder={t(
                    'pages.hr.attendance.importModal.ignoreReasonPlaceholder',
                  )}
                  value={ignoreReasonDrafts[row.rejectedIndex] ?? ''}
                  onChange={(event) => {
                    const reason = event.target.value;
                    setIgnoreReasonDrafts((prev) => ({
                      ...prev,
                      [row.rejectedIndex]: reason,
                    }));
                  }}
                />
              }
              okText={t('pages.hr.attendance.importModal.ignoreConfirm')}
              onConfirm={() => {
                const reason = (
                  ignoreReasonDrafts[row.rejectedIndex] ?? ''
                ).trim();
                if (reason.length < 3) {
                  setErrorMessage(
                    t('pages.hr.attendance.importModal.ignoreReasonRequired'),
                  );
                  return;
                }
                setIgnoredReasons((prev) => ({
                  ...prev,
                  [row.rejectedIndex]: reason,
                }));
                setRejectedAssignments((prev) => {
                  const next = { ...prev };
                  delete next[row.rejectedIndex];
                  return next;
                });
              }}
            >
              <Button type="link" danger className="!px-0">
                {t('pages.hr.attendance.importModal.ignoreLeftCompany')}
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  const matchedRows: MatchedRow[] = (preview?.matched ?? []).map(
    (row, index) => ({
      ...row,
      matchedIndex: index,
    }),
  );

  const reviewRows: ReviewRow[] = (preview?.review ?? []).map((row, index) => ({
    ...row,
    reviewIndex: index,
  }));

  const rejectedRows: RejectedRow[] = (preview?.rejected ?? [])
    .map((row, index) => ({
      ...row,
      rejectedIndex: index,
    }))
    .filter((row) => ignoredReasons[row.rejectedIndex] == null);

  const locallyIgnoredRows: RejectedRow[] = (preview?.rejected ?? [])
    .map((row, index) => ({
      ...row,
      rejectedIndex: index,
    }))
    .filter((row) => ignoredReasons[row.rejectedIndex] != null);

  const previewIgnoredRows: IgnoredPreviewRow[] = (preview?.ignored ?? []).map(
    (row, index) => ({
      ...row,
      ignoredIndex: index,
    }),
  );
  const missingRows: MissingRow[] = preview?.missingFromAttendance ?? [];

  const collapseItems = preview
    ? [
        {
          key: 'matched',
          label: (
            <span className="inline-flex items-center gap-2">
              <CheckCircleOutlined style={{ color: '#639922' }} />
              {t('pages.hr.attendance.importModal.matchedSection')}
              <Badge
                count={preview.matched.length}
                style={{ backgroundColor: '#639922' }}
                showZero
              />
            </span>
          ),
          children: (
            <Table<MatchedRow>
              className="erp-data-table"
              size="small"
              rowKey={(row) => `matched-${row.matchedIndex}`}
              columns={matchedColumns}
              dataSource={matchedRows}
              pagination={false}
              scroll={{ x: 'max-content', y: 220 }}
            />
          ),
        },
        {
          key: 'review',
          label: (
            <span className="inline-flex items-center gap-2">
              <WarningOutlined style={{ color: '#BA7517' }} />
              {t('pages.hr.attendance.importModal.reviewSection')}
              <Badge
                count={preview.review.length}
                style={{ backgroundColor: '#BA7517' }}
                showZero
              />
              {reviewOverrideCount > 0 ? (
                <Tag color="purple">
                  {t('pages.hr.attendance.importModal.matchManual')}:{' '}
                  {reviewOverrideCount}
                </Tag>
              ) : null}
            </span>
          ),
          children: (
            <Table<ReviewRow>
              className="erp-data-table"
              size="small"
              rowKey={(row) => `review-${row.reviewIndex}`}
              columns={reviewColumns}
              dataSource={reviewRows}
              pagination={false}
              scroll={{ y: 260, x: 780 }}
            />
          ),
        },
        {
          key: 'rejected',
          label: (
            <span className="inline-flex items-center gap-2">
              <CloseCircleOutlined style={{ color: '#D32F2F' }} />
              {t('pages.hr.attendance.importModal.rejectedSection')}
              <Badge
                count={rejectedRows.length}
                style={{ backgroundColor: '#D32F2F' }}
                showZero
              />
              {manuallyAssignedCount > 0 ? (
                <Tag color="purple">
                  {t('pages.hr.attendance.importModal.matchManual')}:{' '}
                  {manuallyAssignedCount}
                </Tag>
              ) : null}
            </span>
          ),
          children: (
            <div>
              <Table<RejectedRow>
                className="erp-data-table"
                size="small"
                rowKey={(row) => `rejected-${row.rejectedIndex}`}
                columns={rejectedColumns}
                dataSource={rejectedRows}
                pagination={false}
                scroll={{ y: 280, x: 720 }}
              />
              <p className="m-0 mt-3 text-[12px] text-slate-600">
                {t('pages.hr.attendance.importModal.rejectedNote')}
              </p>
            </div>
          ),
        },
        {
          key: 'missing',
          label: (
            <span className="inline-flex items-center gap-2">
              <UserOutlined style={{ color: '#475569' }} />
              {t('pages.hr.attendance.importModal.missingSection')}
              <Badge
                count={missingRows.length}
                style={{ backgroundColor: '#475569' }}
                showZero
              />
            </span>
          ),
          children: (
            <div>
              <Table<MissingRow>
                className="erp-data-table"
                size="small"
                rowKey={(row) => `missing-${row.id}`}
                columns={missingColumns}
                dataSource={missingRows}
                pagination={false}
                scroll={{ y: 220, x: 780 }}
              />
              <p className="m-0 mt-3 text-[12px] text-slate-600">
                {t('pages.hr.attendance.importModal.missingNote')}
              </p>
            </div>
          ),
        },
        {
          key: 'ignored',
          label: (
            <span className="inline-flex items-center gap-2">
              <ExclamationCircleOutlined style={{ color: '#64748b' }} />
              {t('pages.hr.attendance.importModal.ignoredSection', {
                count: totalIgnoredCount,
              })}
              <Badge
                count={totalIgnoredCount}
                style={{ backgroundColor: '#64748b' }}
                showZero
              />
            </span>
          ),
          children: (
            <div className="space-y-3">
              {previewIgnoredRows.length > 0 ? (
                <Table<IgnoredPreviewRow>
                  className="erp-data-table"
                  size="small"
                  rowKey={(row) => `ignored-preview-${row.ignoredIndex}`}
                  pagination={false}
                  dataSource={previewIgnoredRows}
                  scroll={{ x: 'max-content' }}
                  columns={[
                    {
                      title: t(
                        'pages.hr.attendance.importModal.colAttendanceName',
                      ),
                      dataIndex: 'attendanceName',
                      key: 'attendanceName',
                    },
                    {
                      title: t(
                        'pages.hr.attendance.importModal.colIdInSystem',
                      ),
                      dataIndex: 'attendanceId',
                      key: 'attendanceId',
                      render: (value: string) =>
                        value && value !== '-' ? value : '-',
                    },
                    {
                      title: t('pages.hr.attendance.importModal.colReason'),
                      key: 'reason',
                      render: () =>
                        t('pages.hr.attendance.importModal.ignoredStored'),
                    },
                    {
                      title: t('pages.hr.attendance.importModal.colAssign'),
                      key: 'undo',
                      width: 120,
                      render: (_: unknown, row: IgnoredPreviewRow) => (
                        <Button
                          type="link"
                          className="!px-0"
                          loading={unignoringIndex === row.ignoredIndex}
                          disabled={unignoringIndex != null}
                          onClick={() =>
                            void handleUnignoreStored(row.ignoredIndex)
                          }
                        >
                          {t('pages.hr.attendance.importModal.undoIgnore')}
                        </Button>
                      ),
                    },
                  ]}
                />
              ) : null}
              {locallyIgnoredRows.length > 0 ? (
                <Table<RejectedRow>
                  className="erp-data-table"
                  size="small"
                  rowKey={(row) => `ignored-local-${row.rejectedIndex}`}
                  pagination={false}
                  dataSource={locallyIgnoredRows}
                  scroll={{ x: 'max-content' }}
                  columns={[
                    {
                      title: t(
                        'pages.hr.attendance.importModal.colAttendanceName',
                      ),
                      dataIndex: 'attendanceName',
                      key: 'attendanceName',
                    },
                    {
                      title: t(
                        'pages.hr.attendance.importModal.colIdInSystem',
                      ),
                      dataIndex: 'attendanceId',
                      key: 'attendanceId',
                      render: (value: string) =>
                        value && value !== '-' ? value : '-',
                    },
                    {
                      title: t('pages.hr.attendance.importModal.colReason'),
                      key: 'reason',
                      render: (_: unknown, row: RejectedRow) =>
                        ignoredReasons[row.rejectedIndex] ?? '-',
                    },
                    {
                      title: t('pages.hr.attendance.importModal.colAssign'),
                      key: 'undo',
                      render: (_: unknown, row: RejectedRow) => (
                        <Button
                          type="link"
                          className="!px-0"
                          onClick={() => {
                            setIgnoredReasons((prev) => {
                              const next = { ...prev };
                              delete next[row.rejectedIndex];
                              return next;
                            });
                          }}
                        >
                          {t('pages.hr.attendance.importModal.undoIgnore')}
                        </Button>
                      ),
                    },
                  ]}
                />
              ) : null}
              {totalIgnoredCount === 0 ? (
                <p className="m-0 text-[12px] text-slate-600">
                  {t('pages.hr.attendance.importModal.ignoredEmpty')}
                </p>
              ) : null}
            </div>
          ),
        },
      ]
    : [];

  const defaultActiveKeys = useMemo(() => {
    if (!preview) {
      return [];
    }
    const keys: string[] = [];
    if (preview.review.length > 0) {
      keys.push('review');
    }
    if (preview.rejected.length > 0) {
      keys.push('rejected');
    }
    if ((preview.missingFromAttendance?.length ?? 0) > 0) {
      keys.push('missing');
    }
    return keys;
  }, [preview]);

  const confirmButton = (
    <Button
      type="primary"
      loading={confirming}
      disabled={!preview || confirming}
      onClick={
        preview?.alreadyImported
          ? undefined
          : () => void runConfirm(false)
      }
    >
      {t('pages.hr.attendance.importModal.confirm')}
    </Button>
  );

  const stepLabels = [
    t('pages.hr.attendance.importModal.stepUpload'),
    t('pages.hr.attendance.importModal.stepReview'),
    t('pages.hr.attendance.importModal.stepDone'),
  ];
  const headerSubtitle = t('pages.hr.attendance.importModal.stepOf', {
    current: step + 1,
    label:
      step === 1 && preview
        ? `${stepLabels[1]} · ${preview.fileName}`
        : stepLabels[step],
  });
  const headerIcon =
    step === 2 ? (
      <CheckCircle2 size={19} strokeWidth={2} />
    ) : step === 1 ? (
      <ListChecks size={19} strokeWidth={2} />
    ) : (
      <FileSpreadsheet size={19} strokeWidth={2} />
    );
  const busy = uploading || confirming;

  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      {step === 0 ? (
        <Button onClick={handleClose} disabled={uploading}>
          {t('common.cancel')}
        </Button>
      ) : null}
      {step === 1 && preview ? (
        <>
          <Button onClick={handleBackToUpload} disabled={confirming}>
            {t('common.back')}
          </Button>
          {preview.alreadyImported ? (
            <Popconfirm
              title={t('pages.hr.attendance.importModal.replaceTitle')}
              description={t(
                'pages.hr.attendance.importModal.replaceDescription',
                { month: monthName, year: preview.year },
              )}
              okText={t('pages.hr.attendance.importModal.replaceConfirm')}
              cancelText={t('common.cancel')}
              onConfirm={() => void runConfirm(true)}
              disabled={confirming}
            >
              {confirmButton}
            </Popconfirm>
          ) : (
            confirmButton
          )}
        </>
      ) : null}
      {step === 2 && importResult ? (
        <>
          <Button onClick={handleImportAnother}>
            {t('pages.hr.attendance.importModal.importAnother')}
          </Button>
          <Button type="primary" onClick={handleDoneClose}>
            {t('common.close')}
          </Button>
        </>
      ) : null}
    </div>
  );

  return (
    <Drawer
      open={open}
      placement="right"
      size={DRAWER_WIDTH_SUBMITTAL}
      rootClassName="erp-att-import-v2"
      className={responsiveDetailDrawerClassName}
      styles={{
        ...detailDrawerStyles,
        header: {
          ...(detailDrawerStyles as { header?: React.CSSProperties }).header,
          height: 'auto',
          minHeight: 68,
          padding: '12px 20px',
        },
      }}
      onClose={handleClose}
      mask={{ closable: !busy }}
      closable={!busy}
      destroyOnHidden
      footer={footer}
      title={
        <div className="flex min-w-0 items-center gap-3 py-1">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-800"
            aria-hidden
          >
            {headerIcon}
          </span>
          <div className="min-w-0">
            <div className="text-base leading-snug font-semibold text-slate-900">
              {t('pages.hr.attendance.importModal.title')}
            </div>
            <p className="m-0 mt-0.5 truncate text-[13px] leading-snug font-normal text-slate-600">
              {headerSubtitle}
            </p>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <Steps size="small" current={step} items={stepLabels.map((title) => ({ title }))} />

        {step === 0 ? (
          <div className="relative">
            {uploading ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-[14px] bg-white/80">
                <Spin />
                <span className="text-[13px] text-slate-600">
                  {t('pages.hr.attendance.importModal.previewing')}
                </span>
              </div>
            ) : null}
            <Upload.Dragger
              {...uploadProps}
              className="erp-att-import-dropzone"
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">
                {t('pages.hr.attendance.importModal.dropTitle')}
              </p>
              <p className="ant-upload-hint">
                {t('pages.hr.attendance.importModal.dropHint')}
              </p>
            </Upload.Dragger>
            <p className="m-0 mt-3 text-center text-[12px] text-slate-600">
              {t('pages.hr.attendance.importModal.formatNote')}
            </p>
            {errorMessage ? (
              <p className="m-0 mt-3 text-[13px] text-red-700">
                {errorMessage}
              </p>
            ) : null}
          </div>
        ) : null}

        {step === 1 && preview ? (
          <div className="flex flex-col gap-4">
            {preview.alreadyImported ? (
              <div className="erp-notice erp-notice--warning">
                <span className="erp-notice-chip" aria-hidden>
                  <ExclamationCircleOutlined />
                </span>
                <div className="erp-notice-body">
                  <p className="erp-notice-title">
                    {t('pages.hr.attendance.importModal.alreadyImportedTitle', {
                      month: monthName,
                      year: preview.year,
                    })}
                  </p>
                  <div className="erp-notice-description">
                    <p>
                      {t(
                        'pages.hr.attendance.importModal.alreadyImportedBody',
                        {
                          date: existingBatch?.importedAt
                            ? formatDisplayDateTime(existingBatch.importedAt)
                            : '-',
                          count:
                            existingBatch?._count.records ??
                            existingBatch?.matchedRows ??
                            '-',
                        },
                      )}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <p className="m-0 text-[14px] font-semibold text-slate-900">
                {t('pages.hr.attendance.importModal.periodHeading', {
                  month: monthName,
                  year: preview.year,
                })}
              </p>
              <span className="erp-users-id-chip">{preview.fileName}</span>
            </div>

            <Collapse
              key={preview.previewToken}
              size="small"
              defaultActiveKey={defaultActiveKeys}
              items={collapseItems}
            />

            <p className="m-0 text-[12px] text-slate-600">
              {t('pages.hr.attendance.importModal.summaryFooter', {
                importCount,
                skippedCount: skippedReviewCount,
                rejectedCount,
              })}
            </p>

            {errorMessage ? (
              <p className="m-0 text-[13px] text-red-700">{errorMessage}</p>
            ) : null}

          </div>
        ) : null}

        {step === 2 && importResult ? (
          <div className="flex flex-col gap-4">
            <div className="erp-notice erp-notice--success">
              <span className="erp-notice-chip" aria-hidden>
                <CheckCircleFilled />
              </span>
              <div className="erp-notice-body">
                <p className="erp-notice-title">
                  {t('pages.hr.attendance.importModal.doneTitle')}
                </p>
                <div className="erp-notice-description">
                  <p>
                    {t('pages.hr.attendance.importModal.doneAutoMatched', {
                      count: importResult.autoMatchedCount,
                    })}
                  </p>
                  <p>
                    {t('pages.hr.attendance.importModal.doneManualAssigned', {
                      count: importResult.manualAssignedCount,
                    })}
                  </p>
                  <p>
                    {t('pages.hr.attendance.importModal.doneSkipped', {
                      count: importResult.skippedReviewCount,
                    })}
                  </p>
                  <p>
                    {t('pages.hr.attendance.importModal.doneRejected', {
                      count: importResult.rejectedCount,
                    })}
                  </p>
                </div>
              </div>
            </div>

            {importResult.rejectedCount > 0 ? (
              <div>
                <Button
                  type="link"
                  className="!px-0"
                  onClick={() => setRejectedExpanded((prev) => !prev)}
                >
                  {t('pages.hr.attendance.importModal.rejectedListToggle', {
                    count: importResult.rejectedCount,
                  })}
                </Button>
                {rejectedExpanded ? (
                  <ul className="m-0 mt-2 list-disc pl-5 text-[13px] text-slate-900">
                    {importResult.rejectedNames.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                ) : null}
                <p className="m-0 mt-2 text-[12px] text-slate-600">
                  {t('pages.hr.attendance.importModal.rejectedFollowUp')}
                </p>
              </div>
            ) : null}

          </div>
        ) : null}
      </div>
    </Drawer>
  );
}
