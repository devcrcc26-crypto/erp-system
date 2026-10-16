'use client';

import './hr-import-v2.css';

import { useMemo, useState } from 'react';
import { Alert, Button, Modal, Spin, Upload } from 'antd';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload as UploadIcon,
} from 'lucide-react';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { apiPostForm, downloadApiFile } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  HrImportCommitResult,
  HrImportPreviewResult,
  ImportRowStatus,
} from '@/lib/api/types';
import type {
  HrClientParsedRow,
  HrImportModuleSchema,
} from '@/lib/utils/hr-import-schema';
import { parseHrImportFile } from '@/lib/utils/hr-import-schema';

type ImportStep = 'upload' | 'preview' | 'result';

type TranslateFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

/** A parsed row merged with whatever the server said about the same line. */
interface PreviewRow {
  line: number;
  label: string;
  cells: Record<string, string>;
  status: ImportRowStatus;
  message?: string;
}

function statusLabel(status: ImportRowStatus, t: TranslateFn): string {
  switch (status) {
    case 'ok':
      return t('hr.import.ready');
    case 'warning':
      return t('hr.import.warning');
    case 'error':
      return t('hr.import.invalid');
    case 'duplicate':
      return t('hr.import.duplicate');
    case 'duplicate_in_file':
      return t('hr.import.duplicateInFile');
    default:
      return status;
  }
}

function statusVariant(status: ImportRowStatus): StatusBadgeVariant {
  switch (status) {
    case 'ok':
      return 'success';
    case 'warning':
      return 'warning';
    case 'error':
      return 'error';
    case 'duplicate':
    case 'duplicate_in_file':
      return 'warning';
    default:
      return 'default';
  }
}

function ImportStepTabs({
  step,
  labels,
}: {
  step: ImportStep;
  labels: { upload: string; preview: string; result: string };
}): React.ReactNode {
  const steps: ImportStep[] = ['upload', 'preview', 'result'];
  const activeIndex = steps.indexOf(step);

  return (
    <ol className="erp-user-import-steps" aria-label="Import steps">
      {steps.map((key, index) => {
        const state =
          index < activeIndex
            ? 'done'
            : index === activeIndex
              ? 'active'
              : 'todo';
        return (
          <li
            key={key}
            className={`erp-user-import-step erp-user-import-step--${state}`}
          >
            <span className="erp-user-import-step-index" aria-hidden>
              {index < activeIndex ? (
                <CheckCircle2 size={14} strokeWidth={2} />
              ) : (
                index + 1
              )}
            </span>
            <span className="erp-user-import-step-label">{labels[key]}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Config-driven Excel import modal shared by the HR modules.
 *
 * Given a module's schema (its column definitions and endpoint prefix) it runs
 * the whole flow: template download, upload, client-side validation, a preview
 * table of the parsed rows, then the server commit with per-row feedback.
 * Imported records are always created as drafts.
 */
export default function ImportModal({
  schema,
  title,
  description,
  onClose,
  onImported,
}: {
  schema: HrImportModuleSchema;
  title: string;
  description: string;
  onClose: () => void;
  /** Called after a successful commit so the list can refetch. */
  onImported: (result: HrImportCommitResult) => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();

  const [step, setStep] = useState<ImportStep>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [result, setResult] = useState<HrImportCommitResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);

  /** The first few columns are enough to recognise a row in the preview. */
  const previewColumns = useMemo(
    () => schema.columns.filter((column) => column.required).slice(0, 3),
    [schema.columns],
  );

  const counts = useMemo(() => {
    const valid = rows.filter((row) => row.status === 'ok').length;
    const duplicate = rows.filter(
      (row) => row.status === 'duplicate' || row.status === 'duplicate_in_file',
    ).length;
    return { valid, duplicate, invalid: rows.length - valid - duplicate };
  }, [rows]);

  async function handleDownloadTemplate(): Promise<void> {
    setErrorMessage(null);
    setIsDownloadingTemplate(true);
    try {
      await downloadApiFile(
        `${schema.endpoint}/import/template`,
        schema.templateFileName,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof ApiRequestError
          ? error.message
          : t('hr.import.downloadError'),
      );
    } finally {
      setIsDownloadingTemplate(false);
    }
  }

  async function handleFileChange(file: File): Promise<void> {
    setErrorMessage(null);
    setResult(null);
    setRows([]);
    setIsParsing(true);

    try {
      const parsed = await parseHrImportFile(file, schema);
      if (parsed.fatalError) {
        setSelectedFile(null);
        setErrorMessage(parsed.fatalError);
        return;
      }

      setSelectedFile(file);
      setRows(await mergeWithServerPreview(parsed.rows, file, schema));
      setStep('preview');
    } catch (error) {
      setSelectedFile(null);
      setErrorMessage(
        error instanceof ApiRequestError
          ? error.message
          : t('hr.import.readError'),
      );
    } finally {
      setIsParsing(false);
    }
  }

  async function handleImport(): Promise<void> {
    if (!selectedFile || counts.valid === 0) {
      return;
    }
    setErrorMessage(null);
    setIsImporting(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      const commitResult = await apiPostForm<HrImportCommitResult>(
        `${schema.endpoint}/import`,
        formData,
      );
      setResult(commitResult);
      setStep('result');
      onImported(commitResult);
    } catch (error) {
      setErrorMessage(
        error instanceof ApiRequestError
          ? error.message
          : t('hr.import.importError'),
      );
    } finally {
      setIsImporting(false);
    }
  }

  function handleReset(): void {
    setStep('upload');
    setSelectedFile(null);
    setRows([]);
    setResult(null);
    setErrorMessage(null);
  }

  const isBusy = isParsing || isImporting;

  const footer =
    step === 'result'
      ? [
          <Button
            key="done"
            type="primary"
            className="erp-user-import-btn"
            onClick={onClose}
          >
            {t('common.done')}
          </Button>,
        ]
      : [
          step === 'preview' ? (
            <Button
              key="reset"
              className="erp-user-import-btn"
              onClick={handleReset}
              disabled={isBusy}
            >
              {t('hr.import.chooseAnotherFile')}
            </Button>
          ) : null,
          <Button key="cancel" className="erp-user-import-btn" onClick={onClose}>
            {t('common.cancel')}
          </Button>,
          step === 'preview' ? (
            <Button
              key="import"
              type="primary"
              className="erp-user-import-btn"
              onClick={() => void handleImport()}
              loading={isImporting}
              disabled={counts.valid === 0}
            >
              {t('hr.exportImport.importRows', { count: counts.valid })}
            </Button>
          ) : null,
        ].filter(Boolean);

  return (
    <Modal
      open
      title={null}
      onCancel={onClose}
      footer={footer}
      width={920}
      centered
      rootClassName="erp-user-import-modal erp-hr-import-v2"
      className="erp-user-import-modal erp-hr-import-v2"
      classNames={{
        footer: 'erp-user-import-modal-footer',
        body: 'erp-user-import-modal-body',
      }}
      destroyOnHidden
      mask={{ closable: !isBusy }}
      closable={!isBusy}
    >
      <div className="erp-user-import">
        <div className="erp-user-import-header">
          <div className="erp-user-import-header-icon" aria-hidden>
            <FileSpreadsheet size={22} strokeWidth={1.75} />
          </div>
          <div className="erp-user-import-header-copy">
            <h3 className="erp-user-import-title">{title}</h3>
            <p className="erp-user-import-desc">{description}</p>
          </div>
        </div>

        <ImportStepTabs
          step={step}
          labels={{
            upload: t('hr.import.chooseFile'),
            preview: t('hr.import.ready'),
            result: t('common.done'),
          }}
        />

        <div className="erp-user-import-panel">
          {step === 'upload' ? (
            <div className="erp-user-import-upload">
              <div className="erp-user-import-actions">
                <Button
                  className="erp-user-import-btn"
                  icon={<Download size={15} />}
                  onClick={() => void handleDownloadTemplate()}
                  loading={isDownloadingTemplate}
                >
                  {t('hr.import.downloadTemplate')}
                </Button>
              </div>

              <Upload.Dragger
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                showUploadList={false}
                beforeUpload={(file: File) => {
                  void handleFileChange(file);
                  return false;
                }}
                disabled={isBusy}
                className="erp-user-import-dropzone"
              >
                <div className="erp-user-import-dropzone-inner">
                  <div className="erp-user-import-dropzone-icon" aria-hidden>
                    {isParsing ? (
                      <Spin />
                    ) : (
                      <UploadIcon size={24} strokeWidth={1.75} />
                    )}
                  </div>
                  <p className="erp-user-import-dropzone-title">
                    {t('hr.import.chooseFile')}
                  </p>
                  <p className="erp-user-import-dropzone-hint">
                    {t('hr.exportImport.requiredColumns', {
                      columns: schema.columns
                        .filter((column) => column.required)
                        .map((column) => column.label)
                        .join(', '),
                    })}
                  </p>
                </div>
              </Upload.Dragger>
            </div>
          ) : null}

          {step === 'preview' ? (
            <div className="erp-user-import-preview">
              {selectedFile ? (
                <div className="erp-user-import-file-chip">
                  <FileSpreadsheet size={14} strokeWidth={1.75} />
                  <span className="truncate">{selectedFile.name}</span>
                </div>
              ) : null}

              <div className="erp-user-import-stats">
                <div className="erp-user-import-stat erp-user-import-stat--ready">
                  <span className="erp-user-import-stat-value">
                    {counts.valid}
                  </span>
                  <span className="erp-user-import-stat-label">
                    {t('hr.import.ready')}
                  </span>
                </div>
                <div className="erp-user-import-stat erp-user-import-stat--invalid">
                  <span className="erp-user-import-stat-value">
                    {counts.invalid}
                  </span>
                  <span className="erp-user-import-stat-label">
                    {t('hr.import.invalid')}
                  </span>
                </div>
                <div className="erp-user-import-stat erp-user-import-stat--duplicate">
                  <span className="erp-user-import-stat-value">
                    {counts.duplicate}
                  </span>
                  <span className="erp-user-import-stat-label">
                    {t('hr.import.duplicate')}
                  </span>
                </div>
              </div>

              <div className="erp-user-import-table-wrap">
                <DataTable<PreviewRow>
                  rowKey="line"
                  className="erp-pro-table erp-users-table"
                  size="small"
                  dataSource={rows}
                  scroll={{ x: true, y: 300 }}
                  pagination={false}
                  columns={[
                    {
                      title: t('hr.import.line'),
                      dataIndex: 'line',
                      key: 'line',
                      width: 70,
                      render: (value: number) => (
                        <span className="erp-users-id-chip">{value}</span>
                      ),
                    },
                    ...previewColumns.map((column) => ({
                      title: column.label,
                      key: column.field,
                      ellipsis: true,
                      render: (_: unknown, row: PreviewRow) => (
                        <span className="erp-users-cell-sub">
                          {row.cells[column.field] || '-'}
                        </span>
                      ),
                    })),
                    {
                      title: t('common.status'),
                      key: 'status',
                      width: 140,
                      render: (_: unknown, row: PreviewRow) => (
                        <StatusBadge
                          label={statusLabel(row.status, t)}
                          variant={statusVariant(row.status)}
                        />
                      ),
                    },
                    {
                      title: t('hr.import.message'),
                      dataIndex: 'message',
                      key: 'message',
                      render: (value: string | undefined) => (
                        <span className="erp-users-cell-sub">
                          {value || '-'}
                        </span>
                      ),
                    },
                  ]}
                />
              </div>
            </div>
          ) : null}

          {step === 'result' && result ? (
            <div className="erp-user-import-result">
              <div className="erp-user-import-result-icon" aria-hidden>
                <CheckCircle2 size={28} strokeWidth={1.75} />
              </div>
              <div className="erp-user-import-result-stats">
                <div className="erp-user-import-stat erp-user-import-stat--ready">
                  <span className="erp-user-import-stat-value">
                    {result.created}
                  </span>
                  <span className="erp-user-import-stat-label">
                    {t('hr.exportImport.createdDrafts', {
                      count: result.created,
                    })}
                  </span>
                </div>
                <div className="erp-user-import-stat">
                  <span className="erp-user-import-stat-value">
                    {result.skipped}
                  </span>
                  <span className="erp-user-import-stat-label">
                    {t('hr.import.skippedPlural', { count: result.skipped })}
                  </span>
                </div>
              </div>

              {result.errors.length > 0 ? (
                <Alert
                  type="error"
                  showIcon
                  title={t('hr.import.errorsTitle')}
                  description={
                    <ul className="mt-1 list-disc pl-5">
                      {result.errors.map((error) => (
                        <li key={`${error.line}-${error.label ?? 'row'}`}>
                          {t('hr.import.errorLine', {
                            line: error.line,
                            label: error.label ?? '-',
                            message: error.message,
                          })}
                        </li>
                      ))}
                    </ul>
                  }
                />
              ) : null}
            </div>
          ) : null}

          {errorMessage ? (
            <Alert
              type="error"
              showIcon
              title={errorMessage}
              className="erp-user-import-error"
            />
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

/**
 * Overlays the server's authoritative verdict on the locally parsed rows.
 *
 * Client-side errors win, since the server stops at the first problem per row;
 * rows the client accepted take the server's status (employee lookups and
 * database duplicates can only be judged there). If the server preview call
 * fails the local verdict stands on its own.
 */
async function mergeWithServerPreview(
  parsedRows: HrClientParsedRow[],
  file: File,
  schema: HrImportModuleSchema,
): Promise<PreviewRow[]> {
  const local: PreviewRow[] = parsedRows.map((row) => ({
    line: row.line,
    label: row.label,
    cells: row.cells,
    status: row.errors.length > 0 ? 'error' : 'ok',
    message: row.errors.join('; ') || undefined,
  }));

  if (local.every((row) => row.status === 'error')) {
    return local;
  }

  let serverRows: HrImportPreviewResult['rows'];
  try {
    const formData = new FormData();
    formData.append('file', file);
    const preview = await apiPostForm<HrImportPreviewResult>(
      `${schema.endpoint}/import/preview`,
      formData,
    );
    serverRows = preview.rows;
  } catch {
    return local;
  }

  const byLine = new Map(serverRows.map((row) => [row.line, row] as const));
  return local.map((row) => {
    if (row.status === 'error') {
      return row;
    }
    const serverRow = byLine.get(row.line);
    if (!serverRow) {
      return row;
    }
    return {
      ...row,
      label: serverRow.label || row.label,
      status: serverRow.status,
      message: serverRow.message,
    };
  });
}
