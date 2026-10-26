'use client';

import { useMemo, useRef, useState } from 'react';
import { Button } from 'antd';
import type { UseMutationResult } from '@tanstack/react-query';
import {
  ImportDrawer,
  ImportErrorAlert,
  ImportPreviewSummary,
  ImportResultStep,
  ImportStatusCell,
  ImportTableFrame,
  ImportUploadStep,
  importRowClassName,
  matchesImportFilter,
  type ImportRowFilter,
  type ImportStep,
} from '@/components/modules/hr/import-export/ImportDrawerParts';
import DataTable from '@/components/ui/DataTable/DataTable';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  HrImportCommitResult,
  HrImportPreviewResult,
} from '@/lib/api/types';

type ImportMutation<TResult> = Pick<
  UseMutationResult<TResult, Error, File>,
  'mutateAsync' | 'isPending'
>;

function pluralKey(
  count: number,
  singularKey: string,
  pluralKeyName: string,
): string {
  return count === 1 ? singularKey : pluralKeyName;
}

export type HrImportEntityKey =
  | 'contracts'
  | 'leaveRequests'
  | 'overtimeSheets'
  | 'overtimeEntries'
  | 'expenseClaims'
  | 'expenseClaimItems'
  | 'flightApplications'
  | 'flightPassengers'
  | 'businessTrips'
  | 'businessTripPassengers'
  | 'perDiemRequests'
  | 'purchaseRequests'
  | 'purchaseRequestItems'
  | 'materialRequisitions'
  | 'materialRequisitionItems'
  | 'consumablesRequisitions'
  | 'consumablesRequisitionItems';

/**
 * Shared Excel import drawer for HR modules (upload → preview → commit),
 * in the Employees import layout.
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
  const [rowFilter, setRowFilter] = useState<ImportRowFilter>('all');

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
    setRowFilter('all');

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
    setRowFilter('all');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  const isBusy = previewMutation.isPending || commitMutation.isPending;
  const warningCount =
    preview?.warnings ??
    preview?.rows.filter((row) => row.status === 'warning').length ??
    0;
  const validCount = preview?.valid ?? 0;

  const filteredRows = useMemo(
    () =>
      (preview?.rows ?? []).filter((row) =>
        matchesImportFilter(row.status, rowFilter),
      ),
    [preview, rowFilter],
  );

  const footer =
    step === 'result' ? (
      <Button type="primary" onClick={onClose}>
        {t('common.done')}
      </Button>
    ) : (
      <>
        {step === 'preview' ? (
          <Button onClick={handleReset} disabled={isBusy}>
            {t('hr.import.chooseAnotherFile')}
          </Button>
        ) : null}
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        {step === 'preview' ? (
          <Button
            type="primary"
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
        ) : null}
      </>
    );

  return (
    <ImportDrawer
      title={t(`${entityPrefix}.title`)}
      step={step}
      fileName={selectedFile?.name}
      rowCount={preview?.rows.length}
      busy={isBusy}
      footer={footer}
      onClose={onClose}
      t={t}
    >
      {step === 'upload' ? (
        <ImportUploadStep
          t={t}
          busy={isBusy}
          checking={previewMutation.isPending}
          downloading={isDownloadingTemplate}
          onDownloadTemplate={() => void handleDownloadTemplate()}
          onFile={(file) => void handleFileChange(file)}
          requiredColumns={t(`${entityPrefix}.requiredColumns`)}
          note={t(`${entityPrefix}.description`)}
        />
      ) : null}

      {step === 'preview' && preview ? (
        <div className="flex flex-col gap-4">
          <ImportPreviewSummary
            t={t}
            fileName={selectedFile?.name}
            filter={rowFilter}
            onFilter={setRowFilter}
            counts={{
              all: preview.rows.length,
              ok: preview.valid,
              warning: warningCount,
              error: preview.invalid,
              duplicate: preview.duplicate,
            }}
          />

          <ImportTableFrame>
            <DataTable
              rowKey="line"
              className="erp-pro-table erp-users-table"
              size="small"
              dataSource={filteredRows}
              scroll={{ x: true, y: 'calc(100vh - 420px)' }}
              pagination={false}
              locale={{ emptyText: t('hr.import.noRowsFilter') }}
              rowClassName={(row) => importRowClassName(row.status)}
              columns={[
                {
                  title: t('hr.import.line'),
                  dataIndex: 'line',
                  width: 64,
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
                  width: 130,
                  render: (_, row) => (
                    <ImportStatusCell status={row.status} t={t} />
                  ),
                },
                {
                  title: t('hr.import.message'),
                  dataIndex: 'message',
                  ellipsis: true,
                  render: (value: string | undefined, row) => (
                    <span
                      className={
                        row.status === 'error'
                          ? 'text-[13px] font-medium text-red-700'
                          : 'erp-users-cell-sub'
                      }
                    >
                      {value || '-'}
                    </span>
                  ),
                },
              ]}
            />
          </ImportTableFrame>
        </div>
      ) : null}

      {step === 'result' && result ? (
        <ImportResultStep
          t={t}
          created={result.created}
          createdLabel={t(
            pluralKey(
              result.created,
              `${entityPrefix}.created`,
              `${entityPrefix}.createdPlural`,
            ),
            { count: result.created },
          )}
          skipped={result.skipped}
          skippedLabel={t(
            pluralKey(
              result.skipped,
              'hr.import.skipped',
              'hr.import.skippedPlural',
            ),
            { count: result.skipped },
          )}
          errors={result.errors}
        />
      ) : null}

      <ImportErrorAlert message={errorMessage} />
    </ImportDrawer>
  );
}
