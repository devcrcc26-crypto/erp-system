'use client';

import { useRef, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Modal,
  Space,
  Spin,
  Tag,
  Upload,
} from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { ApiRequestError } from '@/lib/api/errors';
import type { ImportCommitResult, ImportPreviewResult, ImportRowStatus } from '@/lib/api/types';
import DataTable from '@/components/ui/DataTable/DataTable';
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

function statusColor(status: ImportRowStatus): string {
  switch (status) {
    case 'ok':
      return 'green';
    case 'error':
      return 'red';
    case 'duplicate':
    case 'duplicate_in_file':
      return 'gold';
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

  const footer =
    step === 'result'
      ? [
          <Button key="done" type="primary" onClick={onClose}>
            {t('common.done')}
          </Button>,
        ]
      : [
          step === 'preview' && (
            <Button key="reset" onClick={handleReset} disabled={isBusy}>
              {t('users.import.chooseAnotherFile')}
            </Button>
          ),
          <Button key="cancel" onClick={onClose}>
            {t('common.cancel')}
          </Button>,
          step === 'preview' && (
            <Button
              key="import"
              type="primary"
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
          ),
        ].filter(Boolean);

  return (
    <Modal
      open
      title={t('users.import.title')}
      onCancel={onClose}
      footer={footer}
      width={800}
      className="erp-responsive-modal"
      destroyOnHidden
    >
      <p className="mb-4 text-sm text-slate-500">
        {t('users.import.description')}
      </p>

      {step === 'upload' && (
        <Space orientation="vertical" size="middle" className="w-full">
          <Button
            onClick={() => void handleDownloadTemplate()}
            loading={isDownloadingTemplate}
          >
            {t('users.import.downloadTemplate')}
          </Button>

          <Upload
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            showUploadList={false}
            beforeUpload={(file: File) => {
              void handleFileChange(file);
              return false;
            }}
            disabled={isBusy}
          >
            <Button
              type="primary"
              icon={<UploadOutlined />}
              loading={importPreview.isPending}
            >
              {t('users.import.chooseFile')}
            </Button>
          </Upload>
          <p className="text-xs text-slate-500">
            {t('users.import.requiredColumns')}
          </p>
        </Space>
      )}

      {step === 'preview' && preview && (
        <div className="space-y-4">
          <Space wrap>
            <Tag color="green">
              {t('users.import.readyCount', { count: preview.valid })}
            </Tag>
            <Tag color="red">
              {t('users.import.invalidCount', { count: preview.invalid })}
            </Tag>
            <Tag color="gold">
              {t('users.import.duplicateCount', { count: preview.duplicate })}
            </Tag>
          </Space>

          <DataTable
            rowKey="line"
            dataSource={preview.rows}
            scroll={{ x: true }}
            columns={[
              { title: t('users.import.line'), dataIndex: 'line', width: 70 },
              { title: t('common.email'), dataIndex: 'email' },
              {
                title: t('users.import.name'),
                key: 'name',
                render: (_, row) => `${row.firstName} ${row.lastName}`,
              },
              { title: t('common.role'), dataIndex: 'role' },
              {
                title: t('common.status'),
                key: 'status',
                render: (_, row) => (
                  <Tag color={statusColor(row.status)} title={row.message}>
                    {statusLabel(row.status, t)}
                  </Tag>
                ),
              },
            ]}
          />

          <Checkbox
            checked={sendInvitations}
            onChange={(event: { target: { checked: boolean } }) =>
              setSendInvitations(event.target.checked)
            }
          >
            {t('users.import.sendInvitationsNow')}
          </Checkbox>

          {sendInvitations && (
            <p className="text-xs text-slate-500">
              {t('users.import.devMailpitHint')}
            </p>
          )}
        </div>
      )}

      {step === 'result' && result && (
        <div className="space-y-3 text-sm text-slate-700">
          <p>
            {t(
              pluralKey(
                result.created,
                'users.import.created',
                'users.import.createdPlural',
              ),
              { count: result.created },
            )}
          </p>
          <p>
            {t(
              pluralKey(
                result.skipped,
                'users.import.skipped',
                'users.import.skippedPlural',
              ),
              { count: result.skipped },
            )}
          </p>
          {sendInvitations && (
            <>
              <p>
                {t(
                  pluralKey(
                    result.invitationsSent,
                    'users.import.invitationsSent',
                    'users.import.invitationsSentPlural',
                  ),
                  { count: result.invitationsSent },
                )}
              </p>
              {result.invitationsFailed > 0 && (
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
              )}
            </>
          )}
          {result.errors.length > 0 && (
            <Alert
              type="error"
              showIcon
              title={t('users.import.errorsTitle')}
              description={
                <ul className="mt-1 list-disc pl-5">
                  {result.errors.map((error) => (
                    <li key={`${error.line}-${error.email}`}>
                      {t('users.import.errorLine', {
                        line: error.line,
                        email: error.email,
                        message: error.message,
                      })}
                    </li>
                  ))}
                </ul>
              }
            />
          )}
        </div>
      )}

      {errorMessage && (
        <Alert type="error" showIcon title={errorMessage} className="!mt-4" />
      )}

      {isBusy && step === 'upload' && (
        <div className="mt-4 flex justify-center">
          <Spin />
        </div>
      )}
    </Modal>
  );
}
