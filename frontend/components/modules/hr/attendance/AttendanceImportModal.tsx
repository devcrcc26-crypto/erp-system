'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Collapse,
  Modal,
  Popconfirm,
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
import { ApiRequestError } from '@/lib/api/errors';
import type {
  AttendanceImportBatch,
  AttendanceImportSummary,
  AttendancePreviewResult,
  AttendancePreviewRow,
  MatchConfidence,
} from '@/lib/api/attendance.types';
import { getAttendanceImportHistory } from '@/lib/api/attendance.api';
import {
  useAttendanceImportConfirm,
  useAttendanceImportPreview,
} from '@/lib/query/attendance';
import { formatDisplayDateTime } from '@/lib/utils/date-format';

export interface AttendanceImportModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type ImportStep = 0 | 1 | 2;

type ReviewRow = AttendancePreviewRow & { reviewIndex: number };

function matchTypeLabel(
  confidence: MatchConfidence,
  t: (key: string) => string,
): string {
  if (confidence === 'ID_MATCH') {
    return t('pages.hr.attendance.importModal.matchId');
  }
  return t('pages.hr.attendance.importModal.matchName');
}

function matchTypeColor(confidence: MatchConfidence): string {
  return confidence === 'ID_MATCH' ? 'blue' : 'green';
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
  const [existingBatch, setExistingBatch] =
    useState<AttendanceImportBatch | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rejectedExpanded, setRejectedExpanded] = useState(false);

  const resetState = useCallback((): void => {
    setStep(0);
    setUploading(false);
    setConfirming(false);
    setPreview(null);
    setImportResult(null);
    setReviewSelections({});
    setExistingBatch(null);
    setErrorMessage(null);
    setRejectedExpanded(false);
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

  const monthName = preview
    ? t(`hr.months.${preview.month}`)
    : '';

  const selectedReviewCount = useMemo(() => {
    if (!preview) {
      return 0;
    }
    return preview.review.reduce(
      (sum, _, index) => sum + (reviewSelections[index] ? 1 : 0),
      0,
    );
  }, [preview, reviewSelections]);

  const skippedReviewCount = (preview?.review.length ?? 0) - selectedReviewCount;
  const importCount = (preview?.matched.length ?? 0) + selectedReviewCount;
  const rejectedCount = preview?.rejected.length ?? 0;

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
      const result = await confirmMutation.mutateAsync({
        previewToken: preview.previewToken,
        overwrite,
        confirmedReviewIndices,
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
    setExistingBatch(null);
    setErrorMessage(null);
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
    },
    {
      title: t('pages.hr.attendance.importModal.colBestMatch'),
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
      title: t('pages.hr.attendance.importModal.colScore'),
      dataIndex: 'score',
      key: 'score',
      width: 80,
      align: 'right',
      render: (score: number | null) =>
        score == null ? '—' : `${score}%`,
    },
    {
      title: t('pages.hr.attendance.importModal.colInclude'),
      key: 'include',
      width: 90,
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
  ];

  const rejectedColumns: ColumnsType<AttendancePreviewRow> = [
    {
      title: t('pages.hr.attendance.importModal.colAttendanceName'),
      dataIndex: 'attendanceName',
      key: 'attendanceName',
      ellipsis: true,
    },
    {
      title: t('pages.hr.attendance.importModal.colIdInSystem'),
      dataIndex: 'attendanceId',
      key: 'attendanceId',
      width: 140,
      render: (value: string) => (value && value !== '-' ? value : '—'),
    },
    {
      title: t('pages.hr.attendance.importModal.colReason'),
      key: 'reason',
      render: () => t('pages.hr.attendance.importModal.rejectedReason'),
    },
  ];

  const reviewRows: ReviewRow[] = (preview?.review ?? []).map((row, index) => ({
    ...row,
    reviewIndex: index,
  }));

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
              scroll={{ y: 260 }}
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
            </span>
          ),
          children: (
            <div>
              <Table<AttendancePreviewRow>
                className="erp-data-table"
                size="small"
                rowKey={(_, index) => `rejected-${index}`}
                columns={rejectedColumns}
                dataSource={preview.rejected}
                pagination={false}
                scroll={{ y: 220 }}
              />
              <p className="m-0 mt-3 text-[12px] text-[#6B7280]">
                {t('pages.hr.attendance.importModal.rejectedNote')}
              </p>
            </div>
          ),
        },
      ]
    : [];

  const defaultActiveKeys =
    preview && preview.review.length > 0 ? ['review'] : [];

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

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      title={t('pages.hr.attendance.importModal.title')}
      width={800}
      footer={null}
      mask={{ closable: false }}
      destroyOnHidden
      rootClassName="erp-user-import-modal"
      className="erp-user-import-modal"
      classNames={{
        body: 'erp-user-import-modal-body',
      }}
    >
      <div className="erp-user-import mb-4">
        <Steps
          size="small"
          current={step}
          items={[
            { title: t('pages.hr.attendance.importModal.stepUpload') },
            { title: t('pages.hr.attendance.importModal.stepReview') },
            { title: t('pages.hr.attendance.importModal.stepDone') },
          ]}
        />
      </div>

      {step === 0 ? (
        <div className="relative">
          {uploading ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-white/70">
              <Spin />
              <span className="text-[13px] text-[#6B7280]">
                {t('pages.hr.attendance.importModal.previewing')}
              </span>
            </div>
          ) : null}
          <Upload.Dragger {...uploadProps}>
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
          <p className="m-0 mt-3 text-center text-[12px] text-[#6B7280]">
            {t('pages.hr.attendance.importModal.formatNote')}
          </p>
          {errorMessage ? (
            <p className="m-0 mt-3 text-[13px] text-[#D32F2F]">{errorMessage}</p>
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
            <p className="m-0 text-[14px] font-semibold text-[#1A1A1A]">
              {t('pages.hr.attendance.importModal.periodHeading', {
                month: monthName,
                year: preview.year,
              })}
            </p>
            <span className="erp-users-id-chip">{preview.fileName}</span>
          </div>

          <Collapse
            size="small"
            defaultActiveKey={defaultActiveKeys}
            items={collapseItems}
          />

          <p className="m-0 text-[12px] text-[#6B7280]">
            {t('pages.hr.attendance.importModal.summaryFooter', {
              importCount,
              skippedCount: skippedReviewCount,
              rejectedCount,
            })}
          </p>

          {errorMessage ? (
            <p className="m-0 text-[13px] text-[#D32F2F]">{errorMessage}</p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-[#E5E7EB] pt-4">
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
          </div>
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
                  {t('pages.hr.attendance.importModal.doneImported', {
                    count: importResult.importedCount,
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
                <ul className="m-0 mt-2 list-disc pl-5 text-[13px] text-[#1A1A1A]">
                  {importResult.rejectedNames.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              ) : null}
              <p className="m-0 mt-2 text-[12px] text-[#6B7280]">
                {t('pages.hr.attendance.importModal.rejectedFollowUp')}
              </p>
            </div>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-[#E5E7EB] pt-4">
            <Button onClick={handleImportAnother}>
              {t('pages.hr.attendance.importModal.importAnother')}
            </Button>
            <Button type="primary" onClick={handleDoneClose}>
              {t('common.close')}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
