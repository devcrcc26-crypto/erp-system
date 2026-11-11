'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import './hr-import-v2.css';

import { Alert, Button, Drawer, Spin, Upload } from 'antd';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Info,
  ListChecks,
  Upload as UploadIcon,
} from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import type { ImportRowStatus } from '@/lib/api/types';
import {
  DRAWER_WIDTH_SUBMITTAL,
  detailDrawerStyles,
  responsiveDetailDrawerClassName,
} from '@/lib/theme/layout';

/**
 * Shared pieces of the Excel import drawer, matching the Employees import
 * (UserImportModal): right-side drawer, icon header with a step subtitle,
 * step tabs, template card, drop zone, filterable count tiles, framed preview
 * table, result summary and a footer with the actions.
 */

export type ImportStep = 'upload' | 'preview' | 'result';

/** Row filter for the preview table; `all` shows every row. */
export type ImportRowFilter = 'all' | 'ok' | 'warning' | 'error' | 'duplicate';

type TranslateFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

const CARD_SHADOW =
  'shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.06)]';

export function importStatusLabel(
  status: ImportRowStatus,
  t: TranslateFn,
): string {
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

export function importStatusVariant(status: ImportRowStatus): StatusBadgeVariant {
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

/** True when a row belongs under the given filter tile. */
export function matchesImportFilter(
  status: ImportRowStatus,
  filter: ImportRowFilter,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'duplicate') {
    return status === 'duplicate' || status === 'duplicate_in_file';
  }
  return status === filter;
}

/** Row tint used by the preview table (`erp-import-row--*` in hr-import-v2.css). */
export function importRowClassName(status: ImportRowStatus): string {
  if (status === 'error') return 'erp-import-row--error';
  if (
    status === 'warning' ||
    status === 'duplicate' ||
    status === 'duplicate_in_file'
  ) {
    return 'erp-import-row--warning';
  }
  return '';
}

function StepTabs({
  step,
  t,
}: {
  step: ImportStep;
  t: TranslateFn;
}): React.ReactNode {
  const steps: ImportStep[] = ['upload', 'preview', 'result'];
  const labels: Record<ImportStep, string> = {
    upload: t('hr.import.stepUpload'),
    preview: t('hr.import.stepReview'),
    result: t('hr.import.stepDone'),
  };
  const activeIndex = steps.indexOf(step);

  return (
    <ol className="m-0 flex list-none items-center gap-2 p-0" aria-label="Import steps">
      {steps.map((key, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;
        return (
          <li
            key={key}
            className="flex min-w-0 flex-1 items-center gap-2 last:flex-none"
            aria-current={active ? 'step' : undefined}
          >
            <span
              className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                done
                  ? 'bg-emerald-600 text-white'
                  : active
                    ? 'bg-emerald-50 text-emerald-800 ring-2 ring-emerald-600'
                    : 'bg-slate-100 text-slate-500'
              }`}
              aria-hidden
            >
              {done ? <CheckCircle2 size={15} strokeWidth={2.25} /> : index + 1}
            </span>
            <span
              className={`truncate text-sm ${
                active
                  ? 'font-semibold text-slate-900'
                  : done
                    ? 'font-medium text-slate-700'
                    : 'text-slate-500'
              }`}
            >
              {labels[key]}
            </span>
            {index < steps.length - 1 ? (
              <span
                className={`mx-1 h-px min-w-6 flex-1 ${done ? 'bg-emerald-600' : 'bg-slate-200'}`}
                aria-hidden
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Drawer chrome: header (icon, title, step subtitle), step tabs, footer. */
export function ImportDrawer({
  title,
  step,
  fileName,
  rowCount,
  busy,
  footer,
  onClose,
  t,
  children,
}: {
  title: string;
  step: ImportStep;
  fileName?: string;
  rowCount?: number;
  busy: boolean;
  footer: React.ReactNode;
  onClose: () => void;
  t: TranslateFn;
  children: React.ReactNode;
}): React.ReactNode {
  const headerIcon =
    step === 'result' ? (
      <CheckCircle2 size={19} strokeWidth={2} />
    ) : step === 'preview' ? (
      <ListChecks size={19} strokeWidth={2} />
    ) : (
      <FileSpreadsheet size={19} strokeWidth={2} />
    );
  const subtitle =
    step === 'result'
      ? t('hr.import.headerDone')
      : step === 'preview'
        ? t('hr.import.headerReview', {
            file: fileName ?? '',
            count: rowCount ?? 0,
          })
        : t('hr.import.headerUpload');

  return (
    <Drawer
      open
      placement="right"
      size={DRAWER_WIDTH_SUBMITTAL}
      className={`${responsiveDetailDrawerClassName} erp-user-import-drawer erp-hr-travel-modal erp-hr-import-v2`}
      styles={{
        ...detailDrawerStyles,
        header: {
          ...(detailDrawerStyles as { header?: React.CSSProperties }).header,
          height: 'auto',
          minHeight: 68,
          padding: '12px 20px',
        },
      }}
      onClose={onClose}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {footer}
        </div>
      }
      destroyOnHidden
      mask={{ closable: !busy }}
      closable={!busy}
      title={
        <div className="flex min-w-0 items-center gap-3 py-1">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-800"
            aria-hidden
          >
            {headerIcon}
          </span>
          <div className="min-w-0">
            <div className="truncate text-base leading-snug font-semibold text-slate-900">
              {title}
            </div>
            <p className="m-0 mt-0.5 truncate text-[13px] leading-snug font-normal text-slate-600">
              {subtitle}
            </p>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <StepTabs step={step} t={t} />
        <div className="flex min-w-0 flex-col gap-4">{children}</div>
      </div>
    </Drawer>
  );
}

/** Upload step: template card, drop zone and an explanatory note. */
export function ImportUploadStep({
  t,
  busy,
  checking,
  downloading,
  onDownloadTemplate,
  onFile,
  requiredColumns,
  note,
}: {
  t: TranslateFn;
  busy: boolean;
  checking: boolean;
  downloading: boolean;
  onDownloadTemplate: () => void;
  onFile: (file: File) => void;
  /** Already-translated "required columns" line under the drop hint. */
  requiredColumns: string;
  /** Optional line under the drop zone (e.g. the module description). */
  note?: string;
}): React.ReactNode {
  return (
    <div className="flex flex-col gap-4">
      <div className={`flex flex-wrap items-center gap-4 rounded-2xl bg-white p-4 ${CARD_SHADOW} sm:p-5`}>
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-800"
          aria-hidden
        >
          <FileSpreadsheet size={20} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-sm font-semibold text-slate-900">
            {t('hr.import.templateTitle')}
          </p>
          <p className="m-0 mt-0.5 text-[13px] leading-snug text-slate-500">
            {t('hr.import.templateHint')}
          </p>
        </div>
        <Button
          icon={<Download size={15} />}
          onClick={onDownloadTemplate}
          loading={downloading}
          className="!rounded-[10px]"
        >
          {t('hr.import.downloadTemplate')}
        </Button>
      </div>

      <Upload.Dragger
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        showUploadList={false}
        beforeUpload={(file: File) => {
          onFile(file);
          return false;
        }}
        disabled={busy}
        className="[&_.ant-upload-btn]:!p-0 [&_.ant-upload-drag]:!rounded-2xl [&_.ant-upload-drag]:!border-2 [&_.ant-upload-drag]:!border-dashed [&_.ant-upload-drag]:!border-slate-300 [&_.ant-upload-drag]:!bg-slate-50 [&_.ant-upload-drag]:!transition-colors [&_.ant-upload-drag:hover]:!border-emerald-500 [&_.ant-upload-drag:hover]:!bg-emerald-50/50"
      >
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <span
            className={`flex size-14 items-center justify-center rounded-2xl bg-white text-emerald-700 ${CARD_SHADOW}`}
            aria-hidden
          >
            {checking ? <Spin /> : <UploadIcon size={24} strokeWidth={1.9} />}
          </span>
          <p className="m-0 text-base font-semibold text-slate-900">
            {checking ? t('hr.import.checking') : t('hr.import.dropHint')}
          </p>
          <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
            {t('hr.import.fileTypes')}
          </span>
          <p className="m-0 max-w-xl text-[13px] leading-relaxed text-slate-500">
            {requiredColumns}
          </p>
        </div>
      </Upload.Dragger>

      {note ? (
        <p className="m-0 flex items-start gap-2 px-1 text-[13px] leading-relaxed text-slate-600">
          <Info size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-slate-500" aria-hidden />
          <span>{note}</span>
        </p>
      ) : null}
    </div>
  );
}

/** File chip plus the filterable count tiles above the preview table. */
export function ImportPreviewSummary({
  t,
  fileName,
  filter,
  onFilter,
  counts,
}: {
  t: TranslateFn;
  fileName?: string;
  filter: ImportRowFilter;
  onFilter: (filter: ImportRowFilter) => void;
  counts: { all: number; ok: number; warning?: number; error: number; duplicate: number };
}): React.ReactNode {
  const tiles: Array<[ImportRowFilter, string, number, string]> = [
    ['all', t('hr.import.filterAll'), counts.all, 'text-slate-900'],
    ['ok', t('hr.import.ready'), counts.ok, 'text-emerald-700'],
    ...(counts.warning
      ? ([['warning', t('hr.import.warning'), counts.warning, 'text-amber-700']] as Array<
          [ImportRowFilter, string, number, string]
        >)
      : []),
    ['error', t('hr.import.invalid'), counts.error, 'text-red-700'],
    ['duplicate', t('hr.import.duplicate'), counts.duplicate, 'text-amber-700'],
  ];

  return (
    <div className="flex flex-col gap-3">
      {fileName ? (
        <div className="inline-flex max-w-full items-center gap-2 self-start rounded-full bg-slate-100 px-3 py-1 text-[13px] font-medium text-slate-700">
          <FileSpreadsheet size={14} strokeWidth={2} className="shrink-0 text-emerald-700" aria-hidden />
          <span className="truncate">{fileName}</span>
        </div>
      ) : null}

      <div
        className={`grid grid-cols-2 gap-2.5 ${tiles.length === 5 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}
        role="tablist"
      >
        {tiles.map(([key, label, count, tone]) => {
          const selected = filter === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`flex cursor-pointer flex-col items-start gap-0.5 rounded-xl border-0 px-3.5 py-2.5 text-left transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
                selected
                  ? 'bg-[#f0faf6] shadow-[inset_0_0_0_2px_#1d9e75]'
                  : `bg-white ${CARD_SHADOW} hover:bg-slate-50`
              }`}
              onClick={() => onFilter(key)}
            >
              <span className="text-xs font-medium text-slate-600">{label}</span>
              <strong
                className={`text-xl leading-tight font-semibold tabular-nums ${count > 0 ? tone : 'text-slate-400'}`}
              >
                {count}
              </strong>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Card frame for the preview table (quiet header, no measure-row band). */
export function ImportTableFrame({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div
      className={`overflow-hidden rounded-2xl bg-white ${CARD_SHADOW} [&_.ant-table-thead>tr>th]:!bg-[#f7f8fa] [&_.ant-table-thead>tr>th]:!text-xs [&_.ant-table-thead>tr>th]:!font-semibold [&_.ant-table-thead>tr>th]:!tracking-[0.04em] [&_.ant-table-thead>tr>th]:!text-gray-600 [&_.ant-table-thead>tr>th]:!uppercase [&_.ant-table-tbody>tr.ant-table-measure-row>td]:!border-0 [&_.ant-table-tbody>tr.ant-table-measure-row>td]:!p-0`}
    >
      {children}
    </div>
  );
}

/** Done step: check mark, created / skipped tiles and any row errors. */
export function ImportResultStep({
  t,
  createdLabel,
  created,
  skippedLabel,
  skipped,
  errors,
}: {
  t: TranslateFn;
  createdLabel: string;
  created: number;
  skippedLabel: string;
  skipped: number;
  errors: Array<{ line: number; label?: string | null; message: string }>;
}): React.ReactNode {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <span
          className="flex size-14 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-700"
          aria-hidden
        >
          <CheckCircle2 size={28} strokeWidth={2} />
        </span>
        <p className="m-0 text-lg font-semibold text-slate-900">
          {t('hr.import.doneTitle')}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-0.5 rounded-xl bg-[#f0faf6] px-4 py-3">
          <span className="text-2xl font-semibold text-slate-900 tabular-nums">
            {created}
          </span>
          <span className="text-[13px] text-slate-600">{createdLabel}</span>
        </div>
        <div className={`flex flex-col gap-0.5 rounded-xl bg-white px-4 py-3 ${CARD_SHADOW}`}>
          <span className="text-2xl font-semibold text-slate-900 tabular-nums">
            {skipped}
          </span>
          <span className="text-[13px] text-slate-600">{skippedLabel}</span>
        </div>
      </div>

      {errors.length > 0 ? (
        <Alert
          type="error"
          showIcon
          title={t('hr.import.errorsTitle')}
          description={
            <ul className="mt-1 list-disc pl-5">
              {errors.map((error) => (
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
  );
}

export function ImportErrorAlert({
  message,
}: {
  message: string | null;
}): React.ReactNode {
  return message ? (
    <Alert type="error" showIcon title={message} className="!rounded-xl" />
  ) : null;
}

/** Status cell shared by both preview tables. */
export function ImportStatusCell({
  status,
  t,
}: {
  status: ImportRowStatus;
  t: TranslateFn;
}): React.ReactNode {
  return (
    <StatusBadge
      label={importStatusLabel(status, t)}
      variant={importStatusVariant(status)}
    />
  );
}
