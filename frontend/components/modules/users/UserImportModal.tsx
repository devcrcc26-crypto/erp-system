'use client';

import { useRef, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Modal,
  Spin,
  Upload,
} from 'antd';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload as UploadIcon,
} from 'lucide-react';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  ImportCommitResult,
  ImportPreviewResult,
  ImportRowStatus,
} from '@/lib/api/types';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  downloadUserImportTemplate,
  useImportPreview,
  useImportUsers,
} from '@/lib/query/users';

type ImportStep = 'upload' | 'preview' | 'result';

type TranslateFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

function statusLabel(status: ImportRowStatus, t: TranslateFn): string {
  switch (status) {
    case 'ok':
      return t('users.import.ready');
    case 'error':
      return t('users.import.invalid');
    case 'duplicate':
      return t('users.import.duplicate');
    case 'duplicate_in_file':
      return t('users.import.duplicateInFile');
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

export default function UserImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (summary: string) => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importPreview = useImportPreview();
  const importUsers = useImportUsers();

  const [step, setStep] = useState<ImportStep>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const [sendInvitations, setSendInvitations] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);

  async function handleDownloadTemplate(): Promise<void> {
    setErrorMessage(null);
    setIsDownloadingTemplate(true);
    try {
      await downloadUserImportTemplate();
    } catch (error) {
      setErrorMessage(
        error instanceof ApiRequestError
          ? error.message
          : t('users.import.downloadError'),
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
      const previewResult = await importPreview.mutateAsync(file);
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
          : t('users.import.readError'),
      );
    }
  }

  async function handleImport(): Promise<void> {
    if (!selectedFile || !preview || preview.valid === 0) {
      return;
    }

    setErrorMessage(null);

    try {
      const commitResult = await importUsers.mutateAsync({
        file: selectedFile,
        sendInvitations,
      });
      setResult(commitResult);
      setStep('result');

      const summary = sendInvitations
        ? t('users.import.summary', {
            created: commitResult.created,
            sent: commitResult.invitationsSent,
          })
        : t(
            pluralKey(
              commitResult.created,
              'users.import.created',
              'users.import.createdPlural',
            ),
            { count: commitResult.created },
          );
      onImported(summary);
    } catch (error) {
      setErrorMessage(
        error instanceof ApiRequestError
          ? error.message
          : t('users.import.importError'),
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

  const isBusy = importPreview.isPending || importUsers.isPending;
  const validCount = preview?.valid ?? 0;
  const inviteableCount =
    preview?.rows.filter((row) => row.status === 'ok' && row.email).length ?? 0;

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
              {t('users.import.chooseAnotherFile')}
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
              loading={importUsers.isPending}
              disabled={!preview || preview.valid === 0}
            >
              {t(
                pluralKey(
                  validCount,
                  'users.import.importUsers',
                  'users.import.importUsersPlural',
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
            <h3 className="erp-user-import-title">{t('users.import.title')}</h3>
            <p className="erp-user-import-desc">
              {t('users.import.description')}
            </p>
          </div>
        </div>

        <ImportStepTabs
          step={step}
          labels={{
            upload: t('users.import.chooseFile'),
            preview: t('users.import.ready'),
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
                  {t('users.import.downloadTemplate')}
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
                    {importPreview.isPending ? (
                      <Spin />
                    ) : (
                      <UploadIcon size={24} strokeWidth={1.75} />
                    )}
                  </div>
                  <p className="erp-user-import-dropzone-title">
                    {t('users.import.chooseFile')}
                  </p>
                  <p className="erp-user-import-dropzone-hint">
                    {t('users.import.requiredColumns')}
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
                    {t('users.import.ready')}
                  </span>
                </div>
                <div className="erp-user-import-stat erp-user-import-stat--invalid">
                  <span className="erp-user-import-stat-value">
                    {preview.invalid}
                  </span>
                  <span className="erp-user-import-stat-label">
                    {t('users.import.invalid')}
                  </span>
                </div>
                <div className="erp-user-import-stat erp-user-import-stat--duplicate">
                  <span className="erp-user-import-stat-value">
                    {preview.duplicate}
                  </span>
                  <span className="erp-user-import-stat-label">
                    {t('users.import.duplicate')}
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
                      title: t('users.import.line'),
                      dataIndex: 'line',
                      width: 70,
                      render: (value: number) => (
                        <span className="erp-users-id-chip">{value}</span>
                      ),
                    },
                    {
                      title: t('common.email'),
                      key: 'email',
                      render: (_, row) => (
                        <span className="erp-users-cell-strong">
                          {row.email || '-'}
                        </span>
                      ),
                    },
                    {
                      title: t('users.import.name'),
                      key: 'name',
                      render: (_, row) => (
                        <span className="erp-users-cell-strong">
                          {`${row.firstName} ${row.lastName}`}
                        </span>
                      ),
                    },
                    {
                      title: t('common.chineseName'),
                      key: 'chineseName',
                      render: (_, row) => (
                        <span className="erp-users-cell-sub">
                          {row.chineseName || '-'}
                        </span>
                      ),
                    },
                    {
                      title: t('common.role'),
                      key: 'role',
                      render: (_, row) => (
                        <span className="erp-users-cell-sub">
                          {row.role?.trim() || '-'}
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
                  ]}
                />
              </div>

              <div className="erp-user-import-invite">
                <Checkbox
                  checked={sendInvitations}
                  disabled={inviteableCount === 0}
                  onChange={(event: { target: { checked: boolean } }) =>
                    setSendInvitations(event.target.checked)
                  }
                >
                  {t('users.import.sendInvitationsNow')}
                </Checkbox>
                {sendInvitations && inviteableCount > 0 ? (
                  <p className="erp-user-import-hint">
                    {t('users.import.invitationHint', {
                      count: inviteableCount,
                    })}
                  </p>
                ) : null}
                {inviteableCount === 0 && validCount > 0 ? (
                  <p className="erp-user-import-hint">
                    {t('users.import.recordOnlyHint')}
                  </p>
                ) : null}
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
                        'users.import.created',
                        'users.import.createdPlural',
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
                        'users.import.skipped',
                        'users.import.skippedPlural',
                      ),
                      { count: result.skipped },
                    )}
                  </span>
                </div>
                {sendInvitations ? (
                  <div className="erp-user-import-stat erp-user-import-stat--ready">
                    <span className="erp-user-import-stat-value">
                      {result.invitationsSent}
                    </span>
                    <span className="erp-user-import-stat-label">
                      {t(
                        pluralKey(
                          result.invitationsSent,
                          'users.import.invitationsSent',
                          'users.import.invitationsSentPlural',
                        ),
                        { count: result.invitationsSent },
                      )}
                    </span>
                  </div>
                ) : null}
              </div>

              {sendInvitations && result.invitationsFailed > 0 ? (
                <Alert
                  type="warning"
                  showIcon
                  title={t(
                    pluralKey(
                      result.invitationsFailed,
                      'users.import.invitationsFailed',
                      'users.import.invitationsFailedPlural',
                    ),
                    { count: result.invitationsFailed },
                  )}
                />
              ) : null}

              {result.errors.length > 0 ? (
                <Alert
                  type="error"
                  showIcon
                  title={t('users.import.errorsTitle')}
                  description={
                    <ul className="mt-1 list-disc pl-5">
                      {result.errors.map((error) => (
                        <li key={`${error.line}-${error.email ?? 'no-email'}`}>
                          {t('users.import.errorLine', {
                            line: error.line,
                            email: error.email ?? t('users.noEmailNoLogin'),
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
