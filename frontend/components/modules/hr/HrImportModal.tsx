'use client';

import { useRef, useState } from 'react';
import { Alert, Button, Modal, Spin, Upload } from 'antd';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload as UploadIcon,
} from 'lucide-react';
import type { UseMutationResult } from '@tanstack/react-query';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  HrImportCommitResult,
  HrImportPreviewResult,
  ImportRowStatus,
} from '@/lib/api/types';

type ImportMutation<TResult> = Pick<
  UseMutationResult<TResult, Error, File>,
  'mutateAsync' | 'isPending'
>;

type ImportStep = 'upload' | 'preview' | 'result';

type TranslateFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

function statusLabel(status: ImportRowStatus, t: TranslateFn): string {
  switch (status) {
    case 'ok':
      return t('hr.import.ready');
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
    case 'error':
      return 'error';
    case 'duplicate':
    case 'duplicate_in_file':
      return 'warning';
    default:
      return 'default';
  }
}

function pluralKey(
  count: number,
  singularKey: string,
  pluralKeyName: string,
): string {
  return count === 1 ? singularKey : pluralKeyName;
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

export type HrImportEntityKey =
  | 'contracts'
  | 'leaveRequests'
  | 'overtimeSheets'
  | 'overtimeEntries'
  | 'expenseClaims'
  | 'expenseClaimItems';

/**
 * Shared Excel import modal for HR modules (upload → preview → commit).
 */
export default function HrImportModal({
  entity,
  onClose,
  onImported,
  downloadTemplate,
  previewMutation,
  commitMutation,
}: {
  entity: HrImportEntityKey;
  onClose: () => void;
  onImported: (summary: string) => void;
  downloadTemplate: () => Promise<void>;
  previewMutation: ImportMutation<HrImportPreviewResult>;
  commitMutation: ImportMutation<HrImportCommitResult>;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const entityPrefix = `hr.import.${entity}` as const;

  const [step, setStep] = useState<ImportStep>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<HrImportPreviewResult | null>(null);
  const [result, setResult] = useState<HrImportCommitResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);

  async function handleDownloadTemplate(): Promise<void> {
    setErrorMessage(null);
    setIsDownloadingTemplate(true);
    try {
      await downloadTemplate();
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
    setSelectedFile(file);
    setPreview(null);
    setResult(null);

    try {
      const previewResult = await previewMutation.mutateAsync(file);
      setPreview(previewResult);
      setStep('preview');
    } catch (error) {
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setErrorMessage(
        error instanceof ApiRequestError
          ? error.message
          : t('hr.import.readError'),
      );
    }
  }

  async function handleImport(): Promise<void> {
    if (!selectedFile || !preview || preview.valid === 0) {
      return;
    }

    setErrorMessage(null);

    try {
      const commitResult = await commitMutation.mutateAsync(selectedFile);
      setResult(commitResult);
      setStep('result');

      onImported(
        t(`${entityPrefix}.summary`, {
          created: commitResult.created,
        }),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof ApiRequestError
          ? error.message
          : t('hr.import.importError'),
      );
    }
  }

  function handleReset(): void {
    setStep('upload');
    setSelectedFile(null);
    setPreview(null);
    setResult(null);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  const isBusy = previewMutation.isPending || commitMutation.isPending;
  const validCount = preview?.valid ?? 0;

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
          <Button
            key="cancel"
            className="erp-user-import-btn"
            onClick={onClose}
          >
            {t('common.cancel')}
          </Button>,
          step === 'preview' ? (
            <Button
              key="import"
              type="primary"
              className="erp-user-import-btn"
              onClick={() => void handleImport()}
              loading={commitMutation.isPending}
              disabled={!preview || preview.valid === 0}
            >
              {t(
                pluralKey(
                  validCount,
                  `${entityPrefix}.importRows`,
                  `${entityPrefix}.importRowsPlural`,
                ),
                { count: validCount },
              )}
            </Button>
          ) : null,
        ].filter(Boolean);

  return (
    <Modal
      open
      title={null}
      onCancel={onClose}
      footer={footer}
      width={840}
      centered
      rootClassName="erp-user-import-modal"
      className="erp-user-import-modal"
      classNames={{
        content: 'erp-user-import-modal-content',
        footer: 'erp-user-import-modal-footer',
        body: 'erp-user-import-modal-body',
      }}
      styles={{
        content: {
          borderRadius: 14,
          overflow: 'hidden',
          padding: 0,
        },
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
            <h3 className="erp-user-import-title">{t(`${entityPrefix}.title`)}</h3>
            <p className="erp-user-import-desc">
              {t(`${entityPrefix}.description`)}
            </p>
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
                    {previewMutation.isPending ? (
                      <Spin />
                    ) : (
                      <UploadIcon size={24} strokeWidth={1.75} />
                    )}
                  </div>
                  <p className="erp-user-import-dropzone-title">
                    {t('hr.import.chooseFile')}
                  </p>
                  <p className="erp-user-import-dropzone-hint">
                    {t(`${entityPrefix}.requiredColumns`)}
                  </p>
                </div>
              </Upload.Dragger>
            </div>
          ) : null}

          {step === 'preview' && preview ? (
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
                    {preview.valid}
                  </span>
                  <span className="erp-user-import-stat-label">
                    {t('hr.import.ready')}
                  </span>
                </div>
                <div className="erp-user-import-stat erp-user-import-stat--invalid">
                  <span className="erp-user-import-stat-value">
                    {preview.invalid}
                  </span>
                  <span className="erp-user-import-stat-label">
                    {t('hr.import.invalid')}
                  </span>
                </div>
                <div className="erp-user-import-stat erp-user-import-stat--duplicate">
                  <span className="erp-user-import-stat-value">
                    {preview.duplicate}
                  </span>
                  <span className="erp-user-import-stat-label">
                    {t('hr.import.duplicate')}
                  </span>
                </div>
              </div>

              <div className="erp-user-import-table-wrap">
                <DataTable
                  rowKey="line"
                  className="erp-pro-table erp-users-table"
                  size="small"
                  dataSource={preview.rows}
                  scroll={{ x: true, y: 280 }}
                  pagination={false}
                  columns={[
                    {
                      title: t('hr.import.line'),
                      dataIndex: 'line',
                      width: 70,
                      render: (value: number) => (
                        <span className="erp-users-id-chip">{value}</span>
                      ),
                    },
                    {
                      title: t('hr.import.label'),
                      dataIndex: 'label',
                      render: (value: string) => (
                        <span className="erp-users-cell-strong">
                          {value || '-'}
                        </span>
                      ),
                    },
                    {
                      title: t('common.status'),
                      key: 'status',
                      width: 140,
                      render: (_, row) => (
                        <StatusBadge
                          label={statusLabel(row.status, t)}
                          variant={statusVariant(row.status)}
                        />
                      ),
                    },
                    {
                      title: t('hr.import.message'),
                      dataIndex: 'message',
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
                    {t(
                      pluralKey(
                        result.created,
                        `${entityPrefix}.created`,
                        `${entityPrefix}.createdPlural`,
                      ),
                      { count: result.created },
                    )}
                  </span>
                </div>
                <div className="erp-user-import-stat">
                  <span className="erp-user-import-stat-value">
                    {result.skipped}
                  </span>
                  <span className="erp-user-import-stat-label">
                    {t(
                      pluralKey(
                        result.skipped,
                        'hr.import.skipped',
                        'hr.import.skippedPlural',
                      ),
                      { count: result.skipped },
                    )}
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
