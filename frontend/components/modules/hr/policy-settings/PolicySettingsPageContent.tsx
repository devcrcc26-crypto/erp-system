'use client';

import './policy-settings-v2.css';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Skeleton,
  Space,
  Switch,
  Table,
} from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import {
  previewPolicyChange,
  type PolicyGroup,
  type PolicyItem,
  type TaxBracket,
} from '@/lib/api/policy-settings';
import { usePolicySettings, useSavePolicy } from '@/lib/query/policy-settings';
import { LIST_PAGE_V2 } from '@/components/ui/list-page-v2';

const PAGE_V2 = `erp-pro-list-page erp-users-page erp-policy-settings-v2 ${LIST_PAGE_V2}`;

const GROUPS: PolicyGroup[] = ['ATTENDANCE', 'PAYROLL', 'OVERTIME', 'REQUESTS', 'SEPARATION', 'INACTIVE'];
const INITIATOR_REQUEST_TYPES = [
  'SITE_ASSIGNMENT',
  'WORK_FROM_HOME',
  'FLIGHT_APPLICATION',
  'BUSINESS_TRIP',
] as const;
const REQUEST_INITIATORS = ['SELF', 'SUPERVISOR', 'DELEGATE'] as const;
const INACTIVE_TYPES = ['SUSPENDED', 'LONG_LEAVE', 'OTHER'] as const;
const MULTIPLIER_KEYS = ['regular', 'night', 'weekend', 'holiday'] as const;
const P = 'pages.hr.policySettings';

type T = (key: string, vars?: Record<string, string | number>) => string;

function formatValue(item: Pick<PolicyItem, 'key' | 'kind'>, value: unknown, t: T): string {
  if (value === null || value === undefined) {
    return t(`${P}.noLimit`);
  }
  switch (item.kind) {
    case 'boolean':
      return value ? t(`${P}.on`) : t(`${P}.off`);
    case 'mode':
    case 'enum':
      return t(`${P}.options.${String(value)}`);
    case 'nullableInteger':
      return `${String(value)} ${t(`${P}.workingDays`)}`;
    case 'taxBrackets': {
      const bands = value as TaxBracket[];
      return t(`${P}.bandsSummary`, {
        count: bands.length,
        top: Math.max(...bands.map((b) => b.rate)),
      });
    }
    case 'multipliers': {
      const m = value as Record<string, number>;
      return MULTIPLIER_KEYS.map((k) => `${t(`${P}.multiplier.${k}`)} ${m[k]}×`).join(' · ');
    }
    case 'initiators': {
      const v = value as Record<string, string[]>;
      return INITIATOR_REQUEST_TYPES.map(
        (type) =>
          `${t(`${P}.requestTypes.${type}`)}: ${(v[type] ?? [])
            .map((i) => t(`${P}.initiators.${i}`))
            .join(', ')}`,
      ).join(' · ');
    }
    case 'integer':
      return item.key.endsWith('Minutes') ? `${String(value)} ${t(`${P}.minutes`)}` : String(value);
    case 'number':
      return item.key.endsWith('Pct') ? `${String(value)} %` : String(value);
    default:
      if (item.key === 'inactivePaid' || item.key === 'inactiveCanLogin') {
        const rec = value as Record<string, boolean>;
        return INACTIVE_TYPES.map(
          (k) => `${t(`${P}.inactiveTypes.${k}`)}: ${rec[k] ? t(`${P}.on`) : t(`${P}.off`)}`,
        ).join(' · ');
      }
      if (typeof value === 'object' && value && 'enabled' in value) {
        const v = value as { enabled: boolean; days?: number };
        return v.enabled
          ? `${t(`${P}.on`)}${v.days !== undefined ? ` · ${v.days} ${t(`${P}.days`)}` : ''}`
          : t(`${P}.off`);
      }
      return JSON.stringify(value);
  }
}

function monthLabel(ymd: string): string {
  return dayjs(ymd).format('MMM YYYY');
}

/** Editor for one policy value; `onChange(null-error)` reports JSON parse errors via `onError`. */
function ValueEditor({
  item,
  value,
  onChange,
  onError,
}: {
  item: PolicyItem;
  value: unknown;
  onChange: (next: unknown) => void;
  onError: (message: string | null) => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const [jsonText, setJsonText] = useState(() =>
    item.key === 'severancePay'
      ? JSON.stringify((value as { parameters?: unknown })?.parameters ?? {}, null, 2)
      : '',
  );

  switch (item.kind) {
    case 'integer':
    case 'number':
      return (
        <InputNumber
          className="w-full"
          aria-label={t(`${P}.newValue`)}
          value={value as number}
          precision={item.kind === 'integer' ? 0 : undefined}
          onChange={(v) => onChange(v ?? 0)}
        />
      );
    case 'boolean':
      return (
        <Switch
          aria-label={t(`${P}.newValue`)}
          checked={Boolean(value)}
          onChange={onChange}
          checkedChildren={t(`${P}.on`)}
          unCheckedChildren={t(`${P}.off`)}
        />
      );
    case 'mode':
    case 'enum':
      return (
        <Select
          className="w-full"
          aria-label={t(`${P}.newValue`)}
          value={value as string}
          onChange={onChange}
          options={(item.options ?? []).map((o) => ({ value: o, label: t(`${P}.options.${o}`) }))}
        />
      );
    case 'nullableInteger':
      return (
        <div className="flex flex-wrap items-center gap-3">
          <Switch
            aria-label={t(`${P}.limitTo`)}
            checked={value !== null}
            onChange={(on) => onChange(on ? 3 : null)}
          />
          {value === null ? (
            <span>{t(`${P}.noLimit`)}</span>
          ) : (
            <>
              <span>{t(`${P}.limitTo`)}</span>
              <InputNumber
                min={1}
                precision={0}
                value={value as number}
                onChange={(v) => onChange(v ?? 1)}
                aria-label={t(`${P}.workingDays`)}
              />
              <span>{t(`${P}.workingDays`)}</span>
            </>
          )}
        </div>
      );
    case 'multipliers': {
      const m = value as Record<string, number>;
      return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {MULTIPLIER_KEYS.map((k) => (
            <label key={k} className="flex flex-col gap-1 text-sm">
              {t(`${P}.multiplier.${k}`)}
              <Space.Compact className="w-full">
                <InputNumber
                  className="w-full"
                  min={1}
                  step={0.25}
                  value={m[k]}
                  onChange={(v) => onChange({ ...m, [k]: v ?? 1 })}
                />
                <Input
                  disabled
                  value="×"
                  aria-hidden
                  style={{ width: 36, textAlign: 'center', pointerEvents: 'none' }}
                />
              </Space.Compact>
            </label>
          ))}
        </div>
      );
    }
    case 'initiators': {
      const v = value as Record<string, string[]>;
      return (
        <div className="flex flex-col gap-3">
          {INITIATOR_REQUEST_TYPES.map((type) => (
            <fieldset key={type} className="m-0 border-0 p-0">
              <legend className="mb-1 text-sm font-medium">
                {t(`${P}.requestTypes.${type}`)}
              </legend>
              <Checkbox.Group
                value={v[type] ?? []}
                onChange={(next) => {
                  const list = REQUEST_INITIATORS.filter((i) =>
                    (next as string[]).includes(i),
                  );
                  onChange({ ...v, [type]: list });
                  onError(
                    INITIATOR_REQUEST_TYPES.some(
                      (k) => (k === type ? list : (v[k] ?? [])).length === 0,
                    )
                      ? t(`${P}.initiatorsRequired`)
                      : null,
                  );
                }}
                options={REQUEST_INITIATORS.map((i) => ({
                  value: i,
                  label: t(`${P}.initiators.${i}`),
                }))}
              />
            </fieldset>
          ))}
          <span className="text-xs text-[var(--erp-text-secondary,#4B5563)]">
            {t(`${P}.initiatorsFullAccessNote`)}
          </span>
        </div>
      );
    }
    case 'taxBrackets': {
      const bands = value as TaxBracket[];
      const update = (index: number, patch: Partial<TaxBracket>) =>
        onChange(bands.map((b, i) => (i === index ? { ...b, ...patch } : b)));
      return (
        <div className="flex flex-col gap-2">
          {bands.map((band, index) => {
            const last = index === bands.length - 1;
            return (
              <div key={index} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                <label className="flex flex-col gap-1 text-xs">
                  {t(`${P}.bandUpTo`)}
                  {last ? (
                    <Input disabled value={t(`${P}.bandAndAbove`)} />
                  ) : (
                    <InputNumber
                      min={0}
                      value={band.upTo ?? undefined}
                      onChange={(v) => update(index, { upTo: v ?? 0 })}
                    />
                  )}
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  {t(`${P}.bandRate`)}
                  <InputNumber min={0} max={100} value={band.rate} onChange={(v) => update(index, { rate: v ?? 0 })} />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  {t(`${P}.bandDeduction`)}
                  <InputNumber min={0} value={band.deduction} onChange={(v) => update(index, { deduction: v ?? 0 })} />
                </label>
                <Button
                  danger
                  type="text"
                  disabled={bands.length <= 1}
                  aria-label={t(`${P}.removeBand`)}
                  onClick={() => {
                    const next = bands.filter((_, i) => i !== index);
                    next[next.length - 1] = { ...next[next.length - 1], upTo: null };
                    onChange(next);
                  }}
                >
                  ✕
                </Button>
              </div>
            );
          })}
          <Button
            onClick={() => {
              const prevTop = bands.length > 1 ? (bands[bands.length - 2].upTo ?? 0) : 0;
              const next = bands.map((b, i) =>
                i === bands.length - 1 ? { ...b, upTo: prevTop + 1000 } : b,
              );
              next.push({ upTo: null, rate: bands[bands.length - 1].rate, deduction: 0 });
              onChange(next);
            }}
          >
            {t(`${P}.addBand`)}
          </Button>
        </div>
      );
    }
    default: {
      if (item.key === 'inactivePaid' || item.key === 'inactiveCanLogin') {
        const rec = value as Record<string, boolean>;
        return (
          <div className="flex flex-col gap-2">
            {INACTIVE_TYPES.map((k) => (
              <label key={k} className="flex items-center justify-between gap-3">
                {t(`${P}.inactiveTypes.${k}`)}
                <Switch checked={rec[k]} onChange={(on) => onChange({ ...rec, [k]: on })} />
              </label>
            ))}
          </div>
        );
      }
      const v = value as { enabled: boolean; days?: number; parameters?: unknown };
      return (
        <div className="flex flex-col gap-3">
          <label className="flex items-center justify-between gap-3">
            {t(`${P}.enabled`)}
            <Switch checked={v.enabled} onChange={(on) => onChange({ ...v, enabled: on })} />
          </label>
          {item.key === 'noticePay' ? (
            <label className="flex flex-col gap-1 text-sm">
              {t(`${P}.days`)}
              <InputNumber min={0} precision={0} value={v.days} onChange={(d) => onChange({ ...v, days: d ?? 0 })} />
            </label>
          ) : null}
          {item.key === 'severancePay' ? (
            <label className="flex flex-col gap-1 text-sm">
              {t(`${P}.parameters`)}
              <Input.TextArea
                rows={4}
                value={jsonText}
                onChange={(e) => {
                  setJsonText(e.target.value);
                  try {
                    const parsed: unknown = JSON.parse(e.target.value || '{}');
                    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                      throw new Error('not an object');
                    }
                    onError(null);
                    onChange({ ...v, parameters: parsed });
                  } catch {
                    onError(t(`${P}.jsonInvalid`));
                  }
                }}
              />
            </label>
          ) : null}
        </div>
      );
    }
  }
}

function EditPolicyModal({
  item,
  onClose,
}: {
  item: PolicyItem;
  onClose: () => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const save = useSavePolicy();
  const [value, setValue] = useState<unknown>(() => structuredClone(item.currentValue));
  const [month, setMonth] = useState<Dayjs>(() =>
    item.immediate ? dayjs().startOf('month') : dayjs().add(1, 'month').startOf('month'),
  );
  const [reason, setReason] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const effectiveFrom = month.startOf('month').format('YYYY-MM-DD');
  const preview = useQuery({
    queryKey: ['policy-settings', 'preview', item.key, effectiveFrom],
    queryFn: () => previewPolicyChange(item.key, effectiveFrom),
    // Immediate keys never affect payroll runs.
    enabled: !item.immediate,
  });
  const affected = preview.data?.affectedRuns ?? [];
  const name = t(`${P}.keys.${item.key}.title`);
  const canSave =
    reason.trim().length >= 3 && !jsonError && (affected.length === 0 || confirmed);

  async function submit(): Promise<void> {
    try {
      await save.mutateAsync({
        key: item.key,
        payload: {
          value,
          effectiveFrom,
          reason: reason.trim(),
          confirmAffectedRuns: affected.length > 0 ? confirmed : undefined,
        },
      });
      messageApi.success(t(`${P}.saved`));
      onClose();
    } catch (error) {
      messageApi.error(error instanceof ApiRequestError ? error.message : t(`${P}.saveError`));
    }
  }

  return (
    <Modal
      open
      centered
      width={520}
      title={t(`${P}.editTitle`, { name })}
      okText={t(`${P}.save`)}
      okButtonProps={{ disabled: !canSave }}
      confirmLoading={save.isPending}
      onOk={() => void submit()}
      onCancel={onClose}
      destroyOnHidden
      rootClassName="erp-policy-modal"
      className="erp-policy-modal"
    >
      <p className="erp-policy-modal-hint">
        {t(`${P}.keys.${item.key}.description`)}
      </p>
      <Form layout="vertical" requiredMark={false}>
        <Form.Item
          label={t(`${P}.newValue`)}
          validateStatus={jsonError ? 'error' : undefined}
          help={jsonError ?? undefined}
        >
          <ValueEditor
            item={item}
            value={value}
            onChange={setValue}
            onError={setJsonError}
          />
        </Form.Item>
        {item.immediate ? (
          <Form.Item label={t(`${P}.effectiveFrom`)}>
            <span className="text-sm">{t(`${P}.immediateHint`)}</span>
          </Form.Item>
        ) : (
          <Form.Item
            label={t(`${P}.effectiveFrom`)}
            extra={t(`${P}.effectiveFromHint`)}
          >
            <DatePicker
              picker="month"
              allowClear={false}
              className="w-full"
              value={month}
              onChange={(v) => {
                if (v) {
                  setMonth(v);
                  setConfirmed(false);
                }
              }}
            />
          </Form.Item>
        )}
        <Form.Item label={t(`${P}.reason`)}>
          <Input.TextArea
            rows={3}
            maxLength={1000}
            showCount
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t(`${P}.reasonRequired`)}
          />
        </Form.Item>
      </Form>
      {affected.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          className="erp-policy-modal-alert"
          title={t(`${P}.affectedRunsTitle`, { count: affected.length })}
          description={
            <div className="flex flex-col gap-2">
              <ul className="m-0 pl-4">
                {affected.map((run) => (
                  <li key={run.id}>
                    {run.effect === 'STALE'
                      ? t(`${P}.affectedRunStale`, {
                          run: run.runNumber,
                          status: run.status,
                        })
                      : t(`${P}.affectedRunReview`, {
                          run: run.runNumber,
                          status: run.status,
                        })}
                  </li>
                ))}
              </ul>
              <Checkbox
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              >
                {t(`${P}.confirmAffected`)}
              </Checkbox>
            </div>
          }
        />
      ) : null}
    </Modal>
  );
}

function HistoryModal({
  item,
  onClose,
}: {
  item: PolicyItem;
  onClose: () => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  return (
    <Modal
      open
      centered
      width={860}
      title={t(`${P}.historyTitle`, {
        name: t(`${P}.keys.${item.key}.title`),
      })}
      footer={null}
      onCancel={onClose}
      destroyOnHidden
      rootClassName="erp-policy-modal"
      className="erp-policy-modal"
    >
      {item.history.length === 0 ? (
        <p className="erp-policy-history-empty">{t(`${P}.historyEmpty`)}</p>
      ) : (
        <Table
          className="erp-policy-history-table erp-pro-table"
          size="middle"
          rowKey="id"
          pagination={false}
          dataSource={item.history}
          scroll={{ x: 740 }}
          columns={[
            {
              title: t(`${P}.historyFrom`),
              dataIndex: 'effectiveFrom',
              width: 110,
              render: (v: string) => monthLabel(v),
            },
            {
              title: t(`${P}.historyChange`),
              key: 'change',
              render: (_, row) => (
                <span className="erp-policy-history-change">
                  {formatValue(item, row.previousValue, t)} →{' '}
                  {formatValue(item, row.value, t)}
                </span>
              ),
            },
            {
              title: t(`${P}.historyBy`),
              key: 'by',
              width: 140,
              render: (_, row) =>
                row.createdBy?.name ?? t(`${P}.unknownUser`),
            },
            {
              title: t(`${P}.historyWhen`),
              dataIndex: 'createdAt',
              width: 150,
              render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
            },
            {
              title: t(`${P}.historyReason`),
              dataIndex: 'reason',
              render: (reason: string) => (
                <span className="erp-policy-history-reason">{reason}</span>
              ),
            },
          ]}
        />
      )}
    </Modal>
  );
}

function PolicyCard({
  item,
  canEdit,
  canEditAdminOnly,
  onEdit,
  onHistory,
}: {
  item: PolicyItem;
  canEdit: boolean;
  canEditAdminOnly: boolean;
  onEdit: () => void;
  onHistory: () => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const editable = canEdit && !item.locked && (!item.adminOnly || canEditAdminOnly);
  const headingId = `policy-${item.key}`;
  return (
    <section className="erp-policy-card p-5" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={headingId} className="erp-policy-card-title">
              {t(`${P}.keys.${item.key}.title`)}
            </h3>
            <span
              className={`erp-policy-tag ${
                item.currentSource === 'SETTING'
                  ? 'erp-policy-tag--set'
                  : 'erp-policy-tag--default'
              }`}
            >
              {item.currentSource === 'SETTING'
                ? t(`${P}.setByHr`)
                : t(`${P}.default`)}
            </span>
            {item.adminOnly ? (
              <span className="erp-policy-tag erp-policy-tag--admin">
                {t(`${P}.adminOnly`)}
              </span>
            ) : null}
            {item.informational ? (
              <span className="erp-policy-tag erp-policy-tag--info">
                {t(`${P}.informational`)}
              </span>
            ) : null}
            {item.locked ? (
              <span className="erp-policy-tag erp-policy-tag--locked">
                {t(`${P}.locked`)}
              </span>
            ) : null}
          </div>
          <p className="erp-policy-card-desc mt-2">
            {t(`${P}.keys.${item.key}.description`)}
          </p>
          <p className="erp-policy-card-example mt-1.5">
            <span className="font-semibold text-slate-700">
              {t(`${P}.example`)}:
            </span>{' '}
            {t(`${P}.keys.${item.key}.example`)}
          </p>
        </div>
        <div className="flex min-w-[180px] flex-col items-end gap-2.5 text-right">
          <span className="erp-policy-value-label">{t(`${P}.currentValue`)}</span>
          <strong className="erp-policy-value">
            {formatValue(item, item.currentValue, t)}
          </strong>
          {item.scheduled.map((s) => (
            <span
              key={s.effectiveFrom}
              className="erp-policy-tag erp-policy-tag--scheduled"
            >
              {t(`${P}.scheduledFrom`, {
                value: formatValue(item, s.value, t),
                month: monthLabel(s.effectiveFrom),
              })}
            </span>
          ))}
          <div className="erp-policy-actions flex flex-wrap justify-end gap-2">
            <Button size="small" onClick={onHistory}>
              {t(`${P}.history`, { count: item.history.length })}
            </Button>
            {editable ? (
              <Button size="small" type="primary" onClick={onEdit}>
                {t(`${P}.change`)}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

/** HR → Policy Settings: effective-dated rules for attendance, payroll and overtime. */
export default function PolicySettingsPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const canViewHr = useCanViewHr();
  const query = usePolicySettings(canViewHr);
  const [activeGroup, setActiveGroup] = useState<PolicyGroup>('ATTENDANCE');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const data = query.data;
  const byKey = useMemo(
    () => new Map((data?.items ?? []).map((i) => [i.key, i])),
    [data],
  );
  const groupCounts = useMemo(() => {
    const counts = Object.fromEntries(GROUPS.map((g) => [g, 0])) as Record<
      PolicyGroup,
      number
    >;
    for (const item of data?.items ?? []) {
      counts[item.group] += 1;
    }
    return counts;
  }, [data]);

  if (!canViewHr) {
    return (
      <div className={PAGE_V2}>
        <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
      </div>
    );
  }
  if (query.isLoading || !data) {
    return (
      <div className={PAGE_V2}>
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  const editing = editingKey ? byKey.get(editingKey) : undefined;
  const historyItem = historyKey ? byKey.get(historyKey) : undefined;
  const groupItems = data.items.filter((item) => item.group === activeGroup);

  return (
    <div className={PAGE_V2}>
      {!data.canEdit ? (
        <Alert type="info" showIcon title={t(`${P}.readOnlyNotice`)} />
      ) : null}

      <div className="erp-policy-tabbar-card">
        <div
          className="erp-policy-tabbar"
          role="tablist"
          aria-label={t(`${P}.title`)}
        >
          {GROUPS.map((group) => (
            <button
              key={group}
              type="button"
              role="tab"
              id={`policy-tab-${group}`}
              aria-selected={activeGroup === group}
              aria-controls={`policy-panel-${group}`}
              onClick={() => setActiveGroup(group)}
            >
              {t(`${P}.groups.${group}`)}
              <span className="erp-policy-tab-count">
                {groupCounts[group]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div
        role="tabpanel"
        id={`policy-panel-${activeGroup}`}
        aria-labelledby={`policy-tab-${activeGroup}`}
        className="flex flex-col gap-4"
      >
        {groupItems.map((item) => (
          <PolicyCard
            key={item.key}
            item={item}
            canEdit={data.canEdit}
            canEditAdminOnly={data.canEditAdminOnly}
            onEdit={() => setEditingKey(item.key)}
            onHistory={() => setHistoryKey(item.key)}
          />
        ))}
      </div>

      {editing ? (
        <EditPolicyModal item={editing} onClose={() => setEditingKey(null)} />
      ) : null}
      {historyItem ? (
        <HistoryModal item={historyItem} onClose={() => setHistoryKey(null)} />
      ) : null}
    </div>
  );
}
