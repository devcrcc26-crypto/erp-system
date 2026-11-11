'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Button, Checkbox, Drawer, Input, Table, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { effectiveScan } from '@/lib/generated/field-movement-issue-compatibility';
import {
  intersectionCompatibleReasons,
  reasonTypesFromCompatibleReasons,
  type FieldMovementIssueType,
} from '@/lib/generated/field-movement-issue-compatibility';
import {
  canSelectRow,
  selectAllTargetIds,
} from '@/lib/field-movement/explain-days-selection';
import { explainDayRowIsValid, validateExplainDayRow } from '@/lib/field-movement/explain-days-validation';
import {
  clearHiddenFieldValues,
  countStorageEntries,
  type FieldMovementFieldKey,
  type FieldMovementFieldValues,
  type FieldMovementReasonType,
  type FieldMovementSelection,
  toStorageEntries,
} from '@/lib/generated/field-movement-field-rules';
import FieldMovementEntryFields, {
  HourMinuteSelects,
} from '@/components/modules/attendance/FieldMovementEntryFields';
import {
  combineLateReasons,
  dayFieldValues,
  daySelection,
  emptyFieldValues,
  getValidBulkForgotDirections,
  type DayEntry,
} from '@/components/modules/attendance/field-movement-form-model';
import {
  ExplanationStatusBadge,
  formatLongDate,
  IssueTypeBadge,
  ScanTimes,
} from '@/components/modules/attendance/field-movement-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage, useAppModal } from '@/hooks/use-app-message';
import type { CreateFieldMovementEntryDto } from '@/lib/api/attendance.types';
import {
  useRemoveFieldMovementDraftDay,
  useUpsertFieldMovementDraftEntries,
} from '@/lib/query/attendance';
import { notifyApiError } from '@/lib/utils/notify-api-error';
export interface ExplainDaysPanelProps {
  dayEntries: DayEntry[];
  setDayEntries: React.Dispatch<React.SetStateAction<DayEntry[]>>;
  month: number;
  year: number;
  periodLabel: string;
  needsLateReason: boolean;
  draftLogId: string | null;
  onDraftLogIdChange: (id: string) => void;
  /** Fired after a successful draft save so Review can show late reason immediately. */
  onLateReasonSaved?: (lateReason: string) => void;
  onReload: () => Promise<void>;
  onBehalf?: boolean;
  onBehalfOfEmployeeId?: string;
  overallNotes?: string;
}

type ExplainTarget = {
  day: DayEntry;
  values: FieldMovementFieldValues;
  lateReason: string;
  errors: Record<string, string>;
};

function displayScan(day: DayEntry): { in: string | null; out: string | null } {
  return {
    in: effectiveScan(day.correctedClockInLocal, day.clockInLocal),
    out: effectiveScan(day.correctedClockOutLocal, day.clockOutLocal),
  };
}

function defaultsForSelection(
  day: DayEntry,
  selection: FieldMovementSelection,
  base: FieldMovementFieldValues,
): FieldMovementFieldValues {
  const next = { ...base };
  if (selection.reasonType === 'FORGOT') {
    if (
      (selection.forgotDirection === 'OUT' ||
        selection.forgotDirection === 'BOTH') &&
      !next.clockOutTime?.trim()
    ) {
      next.clockOutTime = day.scheduledEndTime;
    }
    if (
      (selection.forgotDirection === 'IN' ||
        selection.forgotDirection === 'BOTH') &&
      !next.clockInTime?.trim()
    ) {
      next.clockInTime = day.scheduledStartTime;
    }
  }
  if (selection.reasonType === 'EARLY_LEAVE' && !next.timeOut?.trim()) {
    const scans = displayScan(day);
    // Only default when the recorded out is still before scheduled end.
    if (scans.out && scans.out < day.scheduledEndTime) {
      next.timeOut = scans.out;
    }
  }
  return next;
}

/**
 * Shared drawer values win unless the row override has a non-empty value.
 * Empty per-row placeholders must not wipe fields the user filled in the shared form.
 */
function mergeExplainValues(
  shared: FieldMovementFieldValues,
  rowOverride: FieldMovementFieldValues | undefined,
): FieldMovementFieldValues {
  if (!rowOverride) {
    return { ...shared };
  }
  const merged: FieldMovementFieldValues = { ...shared };
  for (const key of Object.keys(rowOverride) as Array<
    keyof FieldMovementFieldValues
  >) {
    const override = rowOverride[key];
    if (typeof override === 'string' && override.trim().length > 0) {
      merged[key] = override;
    }
  }
  return merged;
}

export default function ExplainDaysPanel({
  dayEntries,
  setDayEntries,
  month,
  year,
  periodLabel,
  needsLateReason,
  draftLogId,
  onDraftLogIdChange,
  onLateReasonSaved,
  onReload,
  onBehalf = false,
  onBehalfOfEmployeeId,
  overallNotes = '',
}: ExplainDaysPanelProps): ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const modalApi = useAppModal();
  const fmPrefix = 'pages.approvals.fieldMovement';
  const explainPrefix = `${fmPrefix}.explainDays`;

  const upsertMutation = useUpsertFieldMovementDraftEntries();
  const removeMutation = useRemoveFieldMovementDraftDay();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  /** After explaining one issue group, next select-all prefers remaining unexplained of that issue. */
  const [selectAllPreferredIssue, setSelectAllPreferredIssue] =
    useState<FieldMovementIssueType | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'bulk' | 'single'>('bulk');
  const [drawerTargets, setDrawerTargets] = useState<DayEntry[]>([]);
  const [drawerSelection, setDrawerSelection] = useState<FieldMovementSelection>(
    { reasonType: null, forgotDirection: null },
  );
  const [drawerSharedValues, setDrawerSharedValues] =
    useState<FieldMovementFieldValues>(emptyFieldValues());
  const [drawerSharedLateReason, setDrawerSharedLateReason] = useState('');
  const [perRowValues, setPerRowValues] = useState<
    Record<string, FieldMovementFieldValues>
  >({});
  const [perRowLateReason, setPerRowLateReason] = useState<
    Record<string, string>
  >({});

  const tableRows = useMemo(
    () =>
      dayEntries.map((day) => ({
        key: day.id,
        day,
      })),
    [dayEntries],
  );

  const selectableRows = useMemo(
    () =>
      dayEntries.filter(
        (day) =>
          day.selectable &&
          day.explanationStatus !== 'SUBMITTED' &&
          day.explanationStatus !== 'APPROVED' &&
          day.explanationStatus !== 'RETURNED',
      ),
    [dayEntries],
  );

  const selectAllIds = useMemo(
    () =>
      selectAllTargetIds(
        selectableRows.map((day) => ({
          id: day.id,
          issueType: day.issueType,
          explanationStatus: day.explanationStatus,
          selectable: day.selectable,
        })),
        selectedIds,
        selectAllPreferredIssue,
      ),
    [selectableRows, selectedIds, selectAllPreferredIssue],
  );

  const allCompatibleSelected =
    selectAllIds.length > 0 &&
    selectAllIds.every((id) => selectedIds.has(id));
  const someCompatibleSelected =
    selectAllIds.some((id) => selectedIds.has(id)) && !allCompatibleSelected;

  const selectedCount = selectedIds.size;

  const drawerIssueTypes = useMemo((): FieldMovementIssueType[] => {
    return drawerTargets
      .map((day) => day.issueType)
      .filter((value): value is FieldMovementIssueType => value !== null);
  }, [drawerTargets]);

  /** Issue-compatibility matrix is the source of truth (not attendance flag lists). */
  const drawerCompatibleReasonTypes = useMemo(() => {
    return reasonTypesFromCompatibleReasons(
      intersectionCompatibleReasons(drawerIssueTypes),
    );
  }, [drawerIssueTypes]);

  const drawerForgotDirections = useMemo(() => {
    const compatible = intersectionCompatibleReasons(drawerIssueTypes);
    const directions: Array<'IN' | 'OUT' | 'BOTH'> = [];
    if (compatible.includes('FORGOT_CLOCK_IN')) {
      directions.push('IN');
    }
    if (compatible.includes('FORGOT_CLOCK_OUT')) {
      directions.push('OUT');
    }
    if (compatible.includes('FORGOT_BOTH')) {
      directions.push('BOTH');
    }
    // Fall back to scan-based union when only FORGOT (type) is allowed via BOTH.
    if (directions.length === 0 && compatible.some((r) => r.startsWith('FORGOT'))) {
      return getValidBulkForgotDirections(drawerTargets);
    }
    return directions;
  }, [drawerIssueTypes, drawerTargets]);

  const optionalSuffix = t(`${fmPrefix}.optionalSuffix`);
  const fieldLabels = useMemo(
    (): Record<FieldMovementFieldKey, string> => ({
      date: t(`${fmPrefix}.fields.date`),
      timeOut: t(`${fmPrefix}.fields.timeOut`),
      returnTime: t(`${fmPrefix}.fields.returnTime`),
      clockInTime: t(`${fmPrefix}.fields.clockInTime`),
      clockOutTime: t(`${fmPrefix}.fields.clockOutTime`),
      forgotDirection: t(`${fmPrefix}.fields.forgotDirection`),
      location: t(`${fmPrefix}.fields.location`),
      reasonNote: t(`${fmPrefix}.fields.reasonNote`),
      attachment: t(`${fmPrefix}.fields.attachment`),
    }),
    [t],
  );
  const reasonTypeLabels = useMemo(
    (): Record<FieldMovementReasonType, string> => ({
      FIELD_VISIT: t(`${fmPrefix}.reasonTypes.FIELD_VISIT`),
      EARLY_LEAVE: t(`${fmPrefix}.reasonTypes.EARLY_LEAVE`),
      FORGOT: t(`${fmPrefix}.reasonTypes.FORGOT`),
    }),
    [t],
  );
  const forgotDirectionLabels = useMemo(
    () => ({
      IN: t(`${fmPrefix}.forgotDirections.IN`),
      OUT: t(`${fmPrefix}.forgotDirections.OUT`),
      BOTH: t(`${fmPrefix}.forgotDirections.BOTH`),
    }),
    [t],
  );

  const tableSelectRows = useMemo(
    () =>
      dayEntries.map((day) => ({
        id: day.id,
        issueType: day.issueType,
        explanationStatus: day.explanationStatus,
        selectable: day.selectable,
      })),
    [dayEntries],
  );

  function toggleSelect(id: string, checked: boolean): void {
    const day = dayEntries.find((row) => row.id === id);
    if (!day) {
      return;
    }
    const row = {
      id: day.id,
      issueType: day.issueType,
      explanationStatus: day.explanationStatus,
      selectable: day.selectable,
    };
    if (checked && !canSelectRow(row, selectedIds, tableSelectRows)) {
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  function handleSelectAll(checked: boolean): void {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(selectAllIds));
    const anchorDay = dayEntries.find((day) => selectAllIds.includes(day.id));
    if (anchorDay?.issueType) {
      setSelectAllPreferredIssue(anchorDay.issueType);
    }
  }

  function confirmDraftOverwrite(days: DayEntry[], onOk: () => void): void {
    const draftDays = days.filter((day) => day.explanationStatus === 'DRAFT');
    if (draftDays.length === 0) {
      onOk();
      return;
    }
    modalApi.confirm({
      title: t(`${explainPrefix}.overwriteDraftTitle`),
      content: (
        <div>
          <p>{t(`${explainPrefix}.overwriteDraftBody`)}</p>
          <ul>
            {draftDays.map((day) => (
              <li key={day.id}>{formatLongDate(day.date)}</li>
            ))}
          </ul>
        </div>
      ),
      okText: t(`${explainPrefix}.overwriteConfirm`),
      cancelText: t(`${explainPrefix}.cancel`),
      onOk,
    });
  }

  function openDrawer(targets: DayEntry[], mode: 'bulk' | 'single'): void {
    const run = (): void => {
      setDrawerTargets(targets);
      setDrawerMode(mode);
      const first = targets[0];
      const initialSelection = first?.reasonType
        ? daySelection(first)
        : { reasonType: null, forgotDirection: null };
      const initialValues = first ? dayFieldValues(first) : emptyFieldValues();
      setDrawerSelection(initialSelection);
      setDrawerSharedValues(initialValues);
      setDrawerSharedLateReason(first?.lateReason ?? '');
      // Only seed per-row overrides when a day already has draft field values;
      // otherwise empty overrides would block the shared form from validating.
      const overrides: Record<string, FieldMovementFieldValues> = {};
      const lateMap: Record<string, string> = {};
      for (const day of targets) {
        const draftValues = dayFieldValues(day);
        const hasDraftFields = Object.values(draftValues).some(
          (value) => typeof value === 'string' && value.trim().length > 0,
        );
        if (hasDraftFields && targets.length > 1) {
          overrides[day.id] = draftValues;
        }
        if (day.lateReason.trim().length > 0) {
          lateMap[day.id] = day.lateReason;
        }
      }
      setPerRowValues(overrides);
      setPerRowLateReason(lateMap);
      setDrawerOpen(true);
    };
    confirmDraftOverwrite(targets, run);
  }

  function openExplainSelected(): void {
    const targets = dayEntries.filter((day) => selectedIds.has(day.id));
    if (targets.length === 0) {
      messageApi.warning(t(`${explainPrefix}.selectAtLeastOne`));
      return;
    }
    openDrawer(targets, 'bulk');
  }

  function buildExplainTargets(): ExplainTarget[] {
    return drawerTargets.map((day) => {
      const mergedValues = clearHiddenFieldValues(
        drawerSelection,
        mergeExplainValues(drawerSharedValues, perRowValues[day.id]),
      );
      const values = defaultsForSelection(day, drawerSelection, mergedValues);
      const lateReason = needsLateReason
        ? (perRowLateReason[day.id] ?? drawerSharedLateReason).trim()
        : '';
      const errors = validateExplainDayRow(
        drawerSelection,
        values,
        {
          date: day.date,
          isHalfDay: day.isHalfDay,
          scheduledEndTime: day.scheduledEndTime,
          scheduledStartTime: day.scheduledStartTime,
          clockInLocal: day.clockInLocal,
          clockOutLocal: day.clockOutLocal,
          correctedClockInLocal: day.correctedClockInLocal,
          correctedClockOutLocal: day.correctedClockOutLocal,
        },
        { requireLateReason: needsLateReason, lateReason },
      );
      return { day, values, lateReason, errors };
    });
  }

  const drawerValidationErrors = useMemo(() => {
    if (!drawerOpen || !drawerSelection.reasonType) {
      return [] as string[];
    }
    if (
      drawerSelection.reasonType === 'FORGOT' &&
      !drawerSelection.forgotDirection
    ) {
      return [t(`${explainPrefix}.chooseForgotDirection`)];
    }
    const messages: string[] = [];
    for (const row of buildExplainTargets()) {
      const keys = Object.keys(row.errors);
      if (keys.length === 0) {
        continue;
      }
      const firstKey = keys[0]!;
      const label =
        firstKey in fieldLabels
          ? fieldLabels[firstKey as FieldMovementFieldKey]
          : firstKey === 'lateReason'
            ? t('pages.hr.siteAssignments.form.lateReason')
            : firstKey === 'forgotDirection'
              ? t(`${fmPrefix}.fields.forgotDirection`)
              : firstKey;
      const detail = row.errors[firstKey] ?? firstKey;
      messages.push(
        `${formatLongDate(row.day.date)}: ${label} - ${detail}`,
      );
    }
    return messages;
    // buildExplainTargets reads latest drawer state each render
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional live validation
  }, [
    drawerOpen,
    drawerSelection,
    drawerSharedValues,
    perRowValues,
    perRowLateReason,
    drawerSharedLateReason,
    drawerTargets,
    needsLateReason,
    t,
    explainPrefix,
    fmPrefix,
    fieldLabels,
  ]);

  async function handleSaveDrawer(): Promise<void> {
    if (!drawerSelection.reasonType) {
      messageApi.warning(t(`${explainPrefix}.chooseReason`));
      return;
    }
    const targets = buildExplainTargets();
    const invalid = targets.find(
      (row) => Object.keys(row.errors).length > 0,
    );
    if (invalid) {
      messageApi.warning(t(`${explainPrefix}.fixValidation`));
      return;
    }

    const entries: CreateFieldMovementEntryDto[] = [];
    for (const row of targets) {
      const payloads = toStorageEntries(drawerSelection, row.values);
      for (const payload of payloads) {
        entries.push({
          dailyLogId: row.day.id,
          reason: payload.reason,
          destination: payload.destination,
          departureTime: payload.departureTime,
          returnTime: payload.returnTime,
          notes: payload.notes,
        });
      }
    }

    const lateReason = needsLateReason
      ? combineLateReasons(
          targets.map((row) => ({
            ...row.day,
            lateReason: row.lateReason,
          })),
        )
      : undefined;

    try {
      const result = await upsertMutation.mutateAsync({
        month,
        year,
        entries,
        notes: overallNotes.trim() || undefined,
        lateReason,
        ...(onBehalf && onBehalfOfEmployeeId
          ? { onBehalfOfEmployeeId: onBehalfOfEmployeeId }
          : {}),
      });
      onDraftLogIdChange(result.draftLogId);
      const savedLate = lateReason?.trim() ?? '';
      if (savedLate) {
        onLateReasonSaved?.(savedLate);
      }
      // Keep late reason (and draft fields) in local row state for the review step,
      // even before / without a flagged-days reload.
      setDayEntries((prev) =>
        prev.map((day) => {
          const saved = targets.find((row) => row.day.id === day.id);
          if (!saved) {
            return needsLateReason && savedLate
              ? { ...day, lateReason: day.lateReason || savedLate }
              : day;
          }
          return {
            ...day,
            reasonType: drawerSelection.reasonType,
            forgotDirection: drawerSelection.forgotDirection ?? null,
            location: saved.values.location ?? '',
            timeOut: saved.values.timeOut ?? '',
            returnTime: saved.values.returnTime ?? '',
            clockInTime: saved.values.clockInTime ?? '',
            clockOutTime: saved.values.clockOutTime ?? '',
            reasonNote: saved.values.reasonNote ?? '',
            lateReason: needsLateReason ? savedLate : day.lateReason,
            explanationStatus: 'DRAFT',
            errors: {},
          };
        }),
      );
      messageApi.success(t(`${explainPrefix}.savedDraft`));
      setDrawerOpen(false);
      setSelectedIds(new Set());
      await onReload();
    } catch (error) {
      notifyApiError(error, t(`${explainPrefix}.saveFailed`), messageApi);
    }
  }

  async function handleRemoveDraft(day: DayEntry): Promise<void> {
    modalApi.confirm({
      title: t(`${explainPrefix}.removeDraftTitle`),
      content: formatLongDate(day.date),
      okText: t(`${explainPrefix}.removeConfirm`),
      okButtonProps: { danger: true },
      cancelText: t(`${explainPrefix}.cancel`),
      onOk: async () => {
        try {
          await removeMutation.mutateAsync({
            month,
            year,
            dailyLogId: day.id,
            ...(onBehalf && onBehalfOfEmployeeId
              ? { onBehalfOfEmployeeId: onBehalfOfEmployeeId }
              : {}),
          });
          messageApi.success(t(`${explainPrefix}.removedDraft`));
          await onReload();
        } catch (error) {
          notifyApiError(error, t(`${explainPrefix}.removeFailed`), messageApi);
        }
      },
    });
  }

  const columns: ColumnsType<{ key: string; day: DayEntry }> = [
    {
      title: (
        <Checkbox
          indeterminate={someCompatibleSelected}
          checked={allCompatibleSelected}
          disabled={selectAllIds.length === 0}
          onChange={(event) => handleSelectAll(event.target.checked)}
        >
          <span className="fm-sr-only">{t(`${explainPrefix}.selectAll`)}</span>
        </Checkbox>
      ),
      width: 48,
      render: (_, record) => {
        const row = {
          id: record.day.id,
          issueType: record.day.issueType,
          explanationStatus: record.day.explanationStatus,
          selectable: record.day.selectable,
        };
        const canSelect = canSelectRow(row, selectedIds, tableSelectRows);
        const checkbox = (
          <Checkbox
            checked={selectedIds.has(record.day.id)}
            disabled={!canSelect}
            onChange={(event) =>
              toggleSelect(record.day.id, event.target.checked)
            }
          />
        );
        if (canSelect || !record.day.selectable) {
          return checkbox;
        }
        const issueLabel =
          record.day.issueType != null
            ? t(`${explainPrefix}.issueTypes.${record.day.issueType}`)
            : '';
        return (
          <Tooltip
            title={t(`${explainPrefix}.incompatibleSelection`, {
              issue: issueLabel,
            })}
          >
            {checkbox}
          </Tooltip>
        );
      },
    },
    {
      title: t(`${explainPrefix}.columns.date`),
      render: (_, record) => formatLongDate(record.day.date),
    },
    {
      title: t(`${explainPrefix}.columns.scans`),
      render: (_, record) => {
        const scans = displayScan(record.day);
        return <ScanTimes clockIn={scans.in} clockOut={scans.out} />;
      },
    },
    {
      title: t(`${explainPrefix}.columns.issue`),
      render: (_, record) =>
        record.day.issueType ? (
          <IssueTypeBadge issueType={record.day.issueType} />
        ) : (
          '-'
        ),
    },
    {
      title: t(`${explainPrefix}.columns.status`),
      render: (_, record) => (
        <ExplanationStatusBadge status={record.day.explanationStatus} />
      ),
    },
    {
      title: t(`${explainPrefix}.columns.actions`),
      render: (_, record) => {
        const day = record.day;
        if (
          day.explanationStatus === 'SUBMITTED' ||
          day.explanationStatus === 'APPROVED' ||
          day.explanationStatus === 'RETURNED'
        ) {
          return null;
        }
        if (day.explanationStatus === 'DRAFT') {
          return (
            <div className="fm-table-actions">
              <Button
                type="link"
                size="small"
                onClick={() => openDrawer([day], 'single')}
              >
                {t(`${explainPrefix}.edit`)}
              </Button>
              <Button
                type="link"
                size="small"
                danger
                loading={removeMutation.isPending}
                onClick={() => void handleRemoveDraft(day)}
              >
                {t(`${explainPrefix}.remove`)}
              </Button>
            </div>
          );
        }
        return (
          <Button
            type="link"
            size="small"
            onClick={() => openDrawer([day], 'single')}
          >
            {t(`${explainPrefix}.explain`)}
          </Button>
        );
      },
    },
  ];

  const drawerTargetsValid = buildExplainTargets().every((row) =>
    explainDayRowIsValid(
      drawerSelection,
      row.values,
      {
        date: row.day.date,
        isHalfDay: row.day.isHalfDay,
        scheduledEndTime: row.day.scheduledEndTime,
        scheduledStartTime: row.day.scheduledStartTime,
        clockInLocal: row.day.clockInLocal,
        clockOutLocal: row.day.clockOutLocal,
        correctedClockInLocal: row.day.correctedClockInLocal,
        correctedClockOutLocal: row.day.correctedClockOutLocal,
      },
      {
        requireLateReason: needsLateReason,
        lateReason: row.lateReason,
      },
    ),
  );

  const storageEntryCount =
    drawerSelection.reasonType !== null
      ? countStorageEntries(drawerSelection) * drawerTargets.length
      : 0;

  return (
    <div className="fm-stack">
      <section className="fm-card" aria-labelledby="fm-explain-days-title">
        <div className="fm-card__header">
          <div>
            <h2 id="fm-explain-days-title" className="fm-card__title">
              {t(`${explainPrefix}.title`, { period: periodLabel })}
            </h2>
            <p className="fm-card__subtitle">{t(`${explainPrefix}.subtitle`)}</p>
          </div>
        </div>
        <div className="fm-card__body">
          <div className="fm-bulk__toolbar mb-3">
            <span className="fm-bulk__selection">
              {t(`${explainPrefix}.selectionCount`, {
                selected: selectedCount,
                total: selectableRows.length,
              })}
            </span>
            <div className="fm-bulk__actions">
              <Button
                type="primary"
                disabled={selectedCount === 0}
                onClick={openExplainSelected}
              >
                {t(`${explainPrefix}.explainSelected`, { count: selectedCount })}
              </Button>
            </div>
          </div>

          <Table
            className="fm-explain-table"
            columns={columns}
            dataSource={tableRows}
            pagination={false}
            size="middle"
            scroll={{ x: 'max-content' }}
          />
        </div>
      </section>

      <Drawer
        title={
          drawerMode === 'bulk'
            ? t(`${explainPrefix}.drawerBulkTitle`, {
                count: drawerTargets.length,
              })
            : t(`${explainPrefix}.drawerSingleTitle`)
        }
        size={560}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnClose
        footer={
          <div className="fm-stack">
            {drawerValidationErrors.length > 0 ? (
              <p className="fm-field__error m-0" role="status">
                {drawerValidationErrors[0]}
                {drawerValidationErrors.length > 1
                  ? ` (+${drawerValidationErrors.length - 1})`
                  : ''}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setDrawerOpen(false)}>
                {t(`${explainPrefix}.cancel`)}
              </Button>
              <Button
                type="primary"
                loading={upsertMutation.isPending}
                disabled={
                  !drawerSelection.reasonType ||
                  (drawerSelection.reasonType === 'FORGOT' &&
                    !drawerSelection.forgotDirection) ||
                  !drawerTargetsValid
                }
                onClick={() => void handleSaveDrawer()}
              >
                {t(`${explainPrefix}.saveDraft`)}
              </Button>
            </div>
          </div>
        }
      >
        <FieldMovementEntryFields
          idPrefix="fm-explain-drawer"
          hideDate
          availableReasonTypes={drawerCompatibleReasonTypes}
          availableForgotDirections={drawerForgotDirections}
          selection={drawerSelection}
          values={drawerSharedValues}
          labels={fieldLabels}
          reasonTypeLabels={reasonTypeLabels}
          forgotDirectionLabels={forgotDirectionLabels}
          optionalSuffix={optionalSuffix}
          reasonTypeLegend={t(`${fmPrefix}.reasonTypeLegend`)}
          forgotDirectionLegend={t(`${fmPrefix}.forgotDirectionLegend`)}
          onSelectionChange={(next) => {
            let selection = next;
            if (
              next.reasonType === 'FORGOT' &&
              !next.forgotDirection &&
              drawerForgotDirections.length === 1
            ) {
              selection = {
                ...next,
                forgotDirection: drawerForgotDirections[0]!,
              };
            }
            setDrawerSelection(selection);
            setDrawerSharedValues((prev) => {
              const cleared = clearHiddenFieldValues(selection, prev);
              const anchor = drawerTargets[0];
              return anchor
                ? defaultsForSelection(anchor, selection, cleared)
                : cleared;
            });
            setPerRowValues((prev) => {
              const cleared: Record<string, FieldMovementFieldValues> = {};
              for (const [dayId, rowValues] of Object.entries(prev)) {
                cleared[dayId] = clearHiddenFieldValues(selection, rowValues);
              }
              return cleared;
            });
          }}
          onValuesChange={setDrawerSharedValues}
        />

        {drawerSelection.reasonType ? (
          <p className="fm-field__hint" role="status">
            {t(`${fmPrefix}.entriesWillBeCreated`, {
              count: storageEntryCount,
            })}
          </p>
        ) : null}

        {needsLateReason ? (
          <div className="mt-4">
            <label className="fm-field__label" htmlFor="fm-explain-late-reason">
              {t('pages.hr.siteAssignments.form.lateReason')}
            </label>
            <Input.TextArea
              id="fm-explain-late-reason"
              rows={3}
              maxLength={2000}
              value={drawerSharedLateReason}
              onChange={(event) => setDrawerSharedLateReason(event.target.value)}
              placeholder={t(
                'pages.hr.siteAssignments.form.lateReasonPlaceholder',
              )}
            />
          </div>
        ) : null}

        {drawerTargets.length > 1 ? (
          <div className="mt-4">
            <h3 className="fm-field__label">
              {t(`${explainPrefix}.perRowOverrides`)}
            </h3>
            <ul className="fm-stack m-0 p-0 list-none">
              {drawerTargets.map((day) => {
                const rowValues = mergeExplainValues(
                  drawerSharedValues,
                  perRowValues[day.id],
                );
                const rowErrors = validateExplainDayRow(
                  drawerSelection,
                  defaultsForSelection(day, drawerSelection, rowValues),
                  {
                    date: day.date,
                    isHalfDay: day.isHalfDay,
                    scheduledEndTime: day.scheduledEndTime,
                    scheduledStartTime: day.scheduledStartTime,
                    clockInLocal: day.clockInLocal,
                    clockOutLocal: day.clockOutLocal,
                    correctedClockInLocal: day.correctedClockInLocal,
                    correctedClockOutLocal: day.correctedClockOutLocal,
                  },
                  {
                    requireLateReason: needsLateReason,
                    lateReason: perRowLateReason[day.id] ?? drawerSharedLateReason,
                  },
                );
                return (
                  <li key={day.id} className="fm-card fm-card--nested mb-2 p-3">
                    <p className="font-medium">{formatLongDate(day.date)}</p>
                    {drawerSelection.reasonType === 'FORGOT' ? (
                      <div className="fm-grid-2 mt-2">
                        {(drawerSelection.forgotDirection === 'IN' ||
                          drawerSelection.forgotDirection === 'BOTH') && (
                          <div>
                            <label
                              className="fm-field__label"
                              htmlFor={`row-${day.id}-in`}
                            >
                              {fieldLabels.clockInTime}
                            </label>
                            <HourMinuteSelects
                              id={`row-${day.id}-in`}
                              aria-invalid={Boolean(rowErrors.clockInTime)}
                              value={rowValues.clockInTime ?? ''}
                              onChange={(next) =>
                                setPerRowValues((prev) => ({
                                  ...prev,
                                  [day.id]: {
                                    ...rowValues,
                                    clockInTime: next,
                                  },
                                }))
                              }
                            />
                          </div>
                        )}
                        {(drawerSelection.forgotDirection === 'OUT' ||
                          drawerSelection.forgotDirection === 'BOTH') && (
                          <div>
                            <label
                              className="fm-field__label"
                              htmlFor={`row-${day.id}-out`}
                            >
                              {fieldLabels.clockOutTime}
                            </label>
                            <HourMinuteSelects
                              id={`row-${day.id}-out`}
                              aria-invalid={Boolean(rowErrors.clockOutTime)}
                              value={rowValues.clockOutTime ?? ''}
                              onChange={(next) =>
                                setPerRowValues((prev) => ({
                                  ...prev,
                                  [day.id]: {
                                    ...rowValues,
                                    clockOutTime: next,
                                  },
                                }))
                              }
                            />
                          </div>
                        )}
                      </div>
                    ) : null}
                    {drawerSelection.reasonType === 'EARLY_LEAVE' ||
                    drawerSelection.reasonType === 'FIELD_VISIT' ? (
                      <div className="mt-2">
                        <label
                          className="fm-field__label"
                          htmlFor={`row-${day.id}-timeout`}
                        >
                          {fieldLabels.timeOut}
                        </label>
                        <HourMinuteSelects
                          id={`row-${day.id}-timeout`}
                          aria-invalid={Boolean(rowErrors.timeOut)}
                          value={rowValues.timeOut ?? ''}
                          onChange={(next) =>
                            setPerRowValues((prev) => ({
                              ...prev,
                              [day.id]: {
                                ...rowValues,
                                timeOut: next,
                              },
                            }))
                          }
                        />
                      </div>
                    ) : null}
                    {needsLateReason ? (
                      <div className="mt-2">
                        <label
                          className="fm-field__label"
                          htmlFor={`row-${day.id}-late`}
                        >
                          {t('pages.hr.siteAssignments.form.lateReason')}
                        </label>
                        <Input.TextArea
                          id={`row-${day.id}-late`}
                          rows={2}
                          value={perRowLateReason[day.id] ?? drawerSharedLateReason}
                          onChange={(event) =>
                            setPerRowLateReason((prev) => ({
                              ...prev,
                              [day.id]: event.target.value,
                            }))
                          }
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
