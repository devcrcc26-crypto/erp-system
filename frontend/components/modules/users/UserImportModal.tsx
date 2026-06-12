'use client';

import { useRef, useState } from 'react';
import { ApiRequestError } from '@/lib/api/errors';
import type { ImportCommitResult, ImportPreviewResult, ImportRowStatus } from '@/lib/api/types';
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

function statusClass(status: ImportRowStatus): string {
  switch (status) {
    case 'ok':
      return 'bg-green-100 text-green-800';
    case 'error':
      return 'bg-red-100 text-red-800';
    case 'duplicate':
    case 'duplicate_in_file':
      return 'bg-amber-100 text-amber-800';
    default:
      return 'bg-slate-100 text-slate-700';
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

  async function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

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

      const summary = `${commitResult.created} user${commitResult.created === 1 ? '' : 's'} imported` +
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-import-title"
        className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-md bg-white shadow-lg"
      >
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 id="user-import-title" className="text-lg font-semibold text-slate-900">
            Import users from Excel
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Upload a spreadsheet to invite multiple employees. Each user receives
            an activation email to verify their address and set a password.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {step === 'upload' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => void handleDownloadTemplate()}
                disabled={isDownloadingTemplate}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {isDownloadingTemplate ? 'Downloading…' : 'Download template'}
              </button>

              <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(event) => void handleFileChange(event)}
                />
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-md px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                  style={{ backgroundColor: '#f97316' }}
                >
                  {importPreview.isPending ? 'Validating…' : 'Choose .xlsx file'}
                </button>
                <p className="mt-2 text-xs text-slate-500">
                  Required columns: email, firstName, lastName, role. Optional: phone.
                </p>
              </div>
            </div>
          )}

          {step === 'preview' && preview && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="rounded-full bg-green-100 px-3 py-1 font-medium text-green-800">
                  {preview.valid} ready
                </span>
                <span className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-800">
                  {preview.invalid} invalid
                </span>
                <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-800">
                  {preview.duplicate} duplicate
                </span>
              </div>

              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Line</th>
                      <th className="px-3 py-2 font-medium">Email</th>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Role</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr key={row.line} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-500">{row.line}</td>
                        <td className="px-3 py-2">{row.email}</td>
                        <td className="px-3 py-2">
                          {row.firstName} {row.lastName}
                        </td>
                        <td className="px-3 py-2">{row.role}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(row.status)}`}
                            title={row.message}
                          >
                            {statusLabel(row.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={sendInvitations}
                  onChange={(event) => setSendInvitations(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Send activation emails immediately
              </label>

              {sendInvitations && (
                <p className="text-xs text-slate-500">
                  In local development, check Mailpit at http://localhost:8025 or
                  the backend terminal for [DEV Activation] links.
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
                    <p className="text-amber-700">
                      {result.invitationsFailed} invitation
                      {result.invitationsFailed === 1 ? '' : 's'} failed to send.
                      Use Resend verification on the Users page.
                    </p>
                  )}
                </>
              )}
              {result.errors.length > 0 && (
                <div className="rounded-md bg-red-50 px-3 py-2 text-red-700">
                  <p className="font-medium">Errors during import</p>
                  <ul className="mt-1 list-disc pl-5">
                    {result.errors.map((error) => (
                      <li key={`${error.line}-${error.email}`}>
                        Line {error.line} ({error.email}): {error.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {errorMessage && (
            <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
              {errorMessage}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          {step === 'preview' && (
            <button
              type="button"
              onClick={handleReset}
              disabled={isBusy}
              className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Choose another file
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {step === 'result' ? 'Done' : 'Cancel'}
          </button>
          {step === 'preview' && (
            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={isBusy || !preview || preview.valid === 0}
              className="rounded-md px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: '#f97316' }}
            >
              {importUsers.isPending
                ? 'Importing…'
                : `Import ${preview?.valid ?? 0} user${preview?.valid === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
