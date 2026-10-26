'use client';

import { useMemo, useState } from 'react';
import { Button } from 'antd';
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

/** A parsed row merged with whatever the server said about the same line. */
interface PreviewRow {
  line: number;
  label: string;
  cells: Record<string, string>;
  status: ImportRowStatus;
  message?: string;
}

/**
 * Config-driven Excel import drawer shared by the HR modules (Employees
 * import layout).
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
  const [rowFilter, setRowFilter] = useState<ImportRowFilter>('all');

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

  const filteredRows = useMemo(
    () => rows.filter((row) => matchesImportFilter(row.status, rowFilter)),
    [rows, rowFilter],
  );

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
    setRowFilter('all');
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
    setRowFilter('all');
  }

  const isBusy = isParsing || isImporting;

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
            loading={isImporting}
            disabled={counts.valid === 0}
          >
            {t('hr.exportImport.importRows', { count: counts.valid })}
          </Button>
        ) : null}
      </>
    );

  return (
    <ImportDrawer
      title={title}
      step={step}
      fileName={selectedFile?.name}
      rowCount={rows.length}
      busy={isBusy}
      footer={footer}
      onClose={onClose}
      t={t}
    >
      {step === 'upload' ? (
        <ImportUploadStep
          t={t}
          busy={isBusy}
          checking={isParsing}
          downloading={isDownloadingTemplate}
          onDownloadTemplate={() => void handleDownloadTemplate()}
          onFile={(file) => void handleFileChange(file)}
          requiredColumns={t('hr.exportImport.requiredColumns', {
            columns: schema.columns
              .filter((column) => column.required)
              .map((column) => column.label)
              .join(', '),
          })}
          note={`${description} ${t('hr.import.draftsNote')}`}
        />
      ) : null}

      {step === 'preview' ? (
        <div className="flex flex-col gap-4">
          <ImportPreviewSummary
            t={t}
            fileName={selectedFile?.name}
            filter={rowFilter}
            onFilter={setRowFilter}
            counts={{
              all: rows.length,
              ok: counts.valid,
              error: counts.invalid,
              duplicate: counts.duplicate,
            }}
          />

          <ImportTableFrame>
            <DataTable<PreviewRow>
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
                  key: 'line',
                  width: 64,
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
                  width: 130,
                  render: (_: unknown, row: PreviewRow) => (
                    <ImportStatusCell status={row.status} t={t} />
                  ),
                },
                {
                  title: t('hr.import.message'),
                  dataIndex: 'message',
                  key: 'message',
                  ellipsis: true,
                  render: (value: string | undefined, row: PreviewRow) => (
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
          createdLabel={t('hr.exportImport.createdDrafts', {
            count: result.created,
          })}
          skipped={result.skipped}
          skippedLabel={t('hr.import.skippedPlural', { count: result.skipped })}
          errors={result.errors}
        />
      ) : null}

      <ImportErrorAlert message={errorMessage} />
    </ImportDrawer>
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
