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
import {
  downloadUserImportTemplate,
  useImportPreview,
  useImportUsers,
} from '@/lib/query/users';

type ImportStep = 'upload' | 'preview' | 'result';

function statusLabel(status: ImportRowStatus): string {
  switch (status) {
    case 'ok':
      return 'Ready';
    case 'error':
      return 'Invalid';
    case 'duplicate':
      return 'Duplicate';
    case 'duplicate_in_file':
      return 'Duplicate in file';
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

export default function UserImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (summary: string) => void;
}): React.ReactNode {
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
          : 'Could not download template.',
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
          : 'Could not read the import file.',
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

      const summary =
        `${commitResult.created} user${commitResult.created === 1 ? '' : 's'} imported` +
        (sendInvitations
          ? `, ${commitResult.invitationsSent} activation email${commitResult.invitationsSent === 1 ? '' : 's'} sent`
          : '');
      onImported(summary);
    } catch (error) {
      setErrorMessage(
        error instanceof ApiRequestError
          ? error.message
          : 'Import failed. Please try again.',
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

  const footer =
    step === 'result'
      ? [
          <Button key="done" type="primary" onClick={onClose}>
            Done
          </Button>,
        ]
      : [
          step === 'preview' && (
            <Button key="reset" onClick={handleReset} disabled={isBusy}>
              Choose another file
            </Button>
          ),
          <Button key="cancel" onClick={onClose}>
            Cancel
          </Button>,
          step === 'preview' && (
            <Button
              key="import"
              type="primary"
              onClick={() => void handleImport()}
              loading={importUsers.isPending}
              disabled={!preview || preview.valid === 0}
            >
              {`Import ${preview?.valid ?? 0} user${preview?.valid === 1 ? '' : 's'}`}
            </Button>
          ),
        ].filter(Boolean);

  return (
    <Modal
      open
      title="Import users from Excel"
      onCancel={onClose}
      footer={footer}
      width={800}
      className="erp-responsive-modal"
      destroyOnHidden
    >
      <p className="mb-4 text-sm text-slate-500">
        Upload a spreadsheet to invite multiple employees. Each user receives an
        activation email to verify their address and set a password.
      </p>

      {step === 'upload' && (
        <Space orientation="vertical" size="middle" className="w-full">
          <Button
            onClick={() => void handleDownloadTemplate()}
            loading={isDownloadingTemplate}
          >
            Download template
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
              Choose .xlsx file
            </Button>
          </Upload>
          <p className="text-xs text-slate-500">
            Required columns: email, firstName, lastName, role. Optional: phone.
          </p>
        </Space>
      )}

      {step === 'preview' && preview && (
        <div className="space-y-4">
          <Space wrap>
            <Tag color="green">{preview.valid} ready</Tag>
            <Tag color="red">{preview.invalid} invalid</Tag>
            <Tag color="gold">{preview.duplicate} duplicate</Tag>
          </Space>

          <DataTable
            rowKey="line"
            dataSource={preview.rows}
            scroll={{ x: true }}
            columns={[
              { title: 'Line', dataIndex: 'line', width: 70 },
              { title: 'Email', dataIndex: 'email' },
              {
                title: 'Name',
                key: 'name',
                render: (_, row) => `${row.firstName} ${row.lastName}`,
              },
              { title: 'Role', dataIndex: 'role' },
              {
                title: 'Status',
                key: 'status',
                render: (_, row) => (
                  <Tag color={statusColor(row.status)} title={row.message}>
                    {statusLabel(row.status)}
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
            Send activation emails immediately
          </Checkbox>

          {sendInvitations && (
            <p className="text-xs text-slate-500">
              In local development, check Mailpit at http://localhost:8025 or the
              backend terminal for [DEV Activation] links.
            </p>
          )}
        </div>
      )}

      {step === 'result' && result && (
        <div className="space-y-3 text-sm text-slate-700">
          <p>
            <span className="font-semibold">{result.created}</span> user
            {result.created === 1 ? '' : 's'} created.
          </p>
          <p>
            <span className="font-semibold">{result.skipped}</span> row
            {result.skipped === 1 ? '' : 's'} skipped.
          </p>
          {sendInvitations && (
            <>
              <p>
                <span className="font-semibold">{result.invitationsSent}</span>{' '}
                activation email{result.invitationsSent === 1 ? '' : 's'} sent.
              </p>
              {result.invitationsFailed > 0 && (
                <Alert
                  type="warning"
                  showIcon
                  title={`${result.invitationsFailed} invitation${result.invitationsFailed === 1 ? '' : 's'} failed to send. Use Resend verification on the Users page.`}
                />
              )}
            </>
          )}
          {result.errors.length > 0 && (
            <Alert
              type="error"
              showIcon
              title="Errors during import"
              description={
                <ul className="mt-1 list-disc pl-5">
                  {result.errors.map((error) => (
                    <li key={`${error.line}-${error.email}`}>
                      Line {error.line} ({error.email}): {error.message}
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
