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
  Popconfirm,
  Select,
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
  WarningOutlined,
} from '@ant-design/icons';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  getAttendanceImportHistory,
  searchAttendanceEmployees,
} from '@/lib/api/attendance.api';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  AttendanceEmployeeSearchResult,
  AttendanceImportBatch,
  AttendanceImportSummary,
  AttendancePreviewResult,
  AttendancePreviewRow,
  ManualAssignmentDto,
  MatchConfidence,
} from '@/lib/api/attendance.types';
import {
  useAttendanceImportConfirm,
  useAttendanceImportPreview,
} from '@/lib/query/attendance';
import { formatDisplayDateTime } from '@/lib/utils/date-format';
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

type ReviewRow = AttendancePreviewRow & { reviewIndex: number };
type RejectedRow = AttendancePreviewRow & { rejectedIndex: number };

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
  lastName: string;
  employeeId: string | null;
}): string {
  const name = `${employee.firstName} ${employee.lastName}`.trim();
  return employee.employeeId ? `${name} (${employee.employeeId})` : name;
}

function matchTypeLabel(
  confidence: MatchConfidence,
  t: (key: string) => string,
): string {
  if (confidence === 'ID_MATCH') {
    return t('pages.hr.attendance.importModal.matchId');
  }
  if (confidence === 'MANUAL') {
    return t('pages.hr.attendance.importModal.matchManual');
  }
  return t('pages.hr.attendance.importModal.matchName');
}

function matchTypeColor(confidence: MatchConfidence): string {
  if (confidence === 'ID_MATCH') {
    return 'blue';
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
    setEmployeeLabels({});
    setEditingCell(null);
    setEmployeeSearchResults([]);
    setSearchLoading(false);
    setExistingBatch(null);
    setErrorMessage(null);
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
  const rejectedCount =
    (preview?.rejected.length ?? 0) - manuallyAssignedCount;

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
        name: `${employee.firstName} ${employee.lastName}`.trim(),
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
      setEmployeeLabels({});
      setEditingCell(null);
      setEmployeeSearchResults([]);
      setPreview(result);

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

      const result = await confirmMutation.mutateAsync({
        previewToken: preview.previewToken,
        overwrite,
        confirmedReviewIndices,
        manualAssignments,
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
    setEmployeeLabels({});
    setEditingCell(null);
    setEmployeeSearchResults([]);
    setExistingBatch(null);
    setErrorMessage(null);
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

  const matchedColumns: ColumnsType<AttendancePreviewRow> = [
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
      render: (value: string | null) => value ?? '—',
    },
    {
      title: t('pages.hr.attendance.importModal.colEmployeeId'),
      dataIndex: 'matchedEmployeeErpId',
      key: 'matchedEmployeeErpId',
      width: 120,
      render: (value: string | null) => value ?? '—',
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
              {label?.name ?? row.matchedEmployeeName ?? '—'}
              <Tag color="purple">
                {t('pages.hr.attendance.importModal.matchManual')}
              </Tag>
            </span>
          );
        }
        return row.matchedEmployeeName ?? '—';
      },
    },
    {
      title: t('pages.hr.attendance.importModal.colEmployeeId'),
      key: 'employeeId',
      width: 110,
      render: (_: unknown, row: ReviewRow) => {
        const overrideId = reviewOverrides[row.reviewIndex];
        if (overrideId) {
          return employeeLabels[overrideId]?.employeeId ?? '—';
        }
        return row.matchedEmployeeErpId ?? '—';
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
          return '—';
        }
        return row.score == null ? '—' : `${row.score}%`;
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
      render: (value: string) => (value && value !== '-' ? value : '—'),
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
        );
      },
    },
  ];

  const reviewRows: ReviewRow[] = (preview?.review ?? []).map((row, index) => ({
    ...row,
    reviewIndex: index,
  }));

  const rejectedRows: RejectedRow[] = (preview?.rejected ?? []).map(
    (row, index) => ({
      ...row,
      rejectedIndex: index,
    }),
  );

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
            <Table<AttendancePreviewRow>
              className="erp-data-table"
              size="small"
              rowKey={(_, index) => `matched-${index}`}
              columns={matchedColumns}
              dataSource={preview.matched}
              pagination={false}
              scroll={{ y: 220 }}
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
                count={preview.rejected.length}
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
      maskClosable={!busy}
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
                            : '—',
                          count:
                            existingBatch?._count.records ??
                            existingBatch?.matchedRows ??
                            '—',
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
