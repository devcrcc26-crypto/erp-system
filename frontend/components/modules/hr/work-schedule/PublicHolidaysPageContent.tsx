'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Switch,
  Dropdown,
  Grid,
} from 'antd';
import {
  CalendarOutlined,
  CopyOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import DataTable from '@/components/ui/DataTable/DataTable';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  CreatePublicHolidayPayload,
  HolidayNationality,
  PublicHoliday,
} from '@/lib/api/work-schedule.types';
import {
  useBulkHolidayStatus,
  useCreatePublicHoliday,
  useDeactivatePublicHoliday,
  useDuplicateHolidayYear,
  usePublicHolidayList,
  useUpdatePublicHoliday,
} from '@/lib/query/work-schedule';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

interface HolidayFormValues {
  name: string;
  nameZh?: string;
  date: Dayjs;
  appliesToNationality: HolidayNationality;
  isRecurring: boolean;
  notifyDaysBefore: number;
  isActive: boolean;
  notes?: string;
}

/**
 * HR public holiday calendar — used by leave, overtime, and attendance day counts.
 */
export default function PublicHolidaysPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isNarrow = screens.sm === false;
  const canViewHr = useCanViewHr();
  const [form] = Form.useForm<HolidayFormValues>();

  const [year, setYear] = useState<number | undefined>(undefined);
  const [nationality, setNationality] = useState<
    HolidayNationality | undefined
  >(undefined);
  const [activeFilter, setActiveFilter] = useState<boolean | undefined>(
    undefined,
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<PublicHoliday | null>(null);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [fromYear, setFromYear] = useState(dayjs().year());
  const [toYear, setToYear] = useState(dayjs().year() + 1);

  const listQuery = usePublicHolidayList(
    { year, nationality, isActive: activeFilter },
    canViewHr,
  );
  const createMutation = useCreatePublicHoliday();
  const updateMutation = useUpdatePublicHoliday();
  const deactivateMutation = useDeactivatePublicHoliday();
  const bulkMutation = useBulkHolidayStatus();
  const duplicateMutation = useDuplicateHolidayYear();

  const rows = listQuery.data ?? [];

  const grouped = useMemo(() => {
    const map = new Map<number, PublicHoliday[]>();
    for (const row of rows) {
      const y = Number(row.date.slice(0, 4));
      const list = map.get(y) ?? [];
      list.push(row);
      map.set(y, list);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [rows]);

  function openCreate(): void {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      appliesToNationality: 'ALL',
      isRecurring: false,
      notifyDaysBefore: 2,
      isActive: true,
    });
    setDrawerOpen(true);
  }

  function openEdit(row: PublicHoliday): void {
    setEditing(row);
    form.setFieldsValue({
      name: row.name,
      nameZh: row.nameZh ?? undefined,
      date: dayjs(row.date),
      appliesToNationality: row.appliesToNationality,
      isRecurring: row.isRecurring,
      notifyDaysBefore: row.notifyDaysBefore,
      isActive: row.isActive,
      notes: row.notes ?? undefined,
    });
    setDrawerOpen(true);
  }

  async function handleSave(): Promise<void> {
    const values = await form.validateFields();
    const payload: CreatePublicHolidayPayload = {
      name: values.name.trim(),
      nameZh: values.nameZh?.trim() || undefined,
      date: values.date.format('YYYY-MM-DD'),
      appliesToNationality: values.appliesToNationality,
      isRecurring: values.isRecurring,
      notifyDaysBefore: values.notifyDaysBefore,
      isActive: values.isActive,
      notes: values.notes?.trim() || undefined,
    };
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, payload });
        messageApi.success(t('hr.publicHoliday.updated'));
      } else {
        await createMutation.mutateAsync(payload);
        messageApi.success(t('hr.publicHoliday.created'));
      }
      setDrawerOpen(false);
    } catch (error: unknown) {
      notifyApiError(error, t('hr.publicHoliday.saveFailed'), messageApi);
    }
  }

  async function handleDeactivate(id: string): Promise<void> {
    try {
      await deactivateMutation.mutateAsync(id);
      messageApi.success(t('hr.publicHoliday.deactivated'));
    } catch (error: unknown) {
      notifyApiError(error, t('hr.publicHoliday.saveFailed'), messageApi);
    }
  }

  async function handleReactivate(row: PublicHoliday): Promise<void> {
    try {
      await updateMutation.mutateAsync({
        id: row.id,
        payload: { isActive: true },
      });
      messageApi.success(t('hr.publicHoliday.reactivated'));
    } catch (error: unknown) {
      notifyApiError(error, t('hr.publicHoliday.saveFailed'), messageApi);
    }
  }

  async function handleBulk(isActive: boolean): Promise<void> {
    if (selectedIds.length === 0) {
      return;
    }
    try {
      await bulkMutation.mutateAsync({ ids: selectedIds, isActive });
      messageApi.success(
        isActive
          ? t('hr.publicHoliday.bulkActivated')
          : t('hr.publicHoliday.bulkDeactivated'),
      );
      setSelectedIds([]);
    } catch (error: unknown) {
      notifyApiError(error, t('hr.publicHoliday.saveFailed'), messageApi);
    }
  }

  async function handleDuplicate(): Promise<void> {
    try {
      const result = await duplicateMutation.mutateAsync({ fromYear, toYear });
      messageApi.success(
        t('hr.publicHoliday.duplicated', {
          copied: result.copied,
          skipped: result.skipped,
        }),
      );
      setDuplicateOpen(false);
    } catch (error: unknown) {
      notifyApiError(error, t('hr.publicHoliday.duplicateFailed'), messageApi);
    }
  }

  function appliesLabel(value: HolidayNationality): string {
    if (value === 'ETHIOPIAN') {
      return t('hr.publicHoliday.ethiopianOnly');
    }
    if (value === 'CHINESE') {
      return t('hr.publicHoliday.chineseOnly');
    }
    return t('hr.publicHoliday.allEmployees');
  }

  function daysUntilBadge(row: PublicHoliday): React.ReactNode {
    if (row.isPast) {
      return (
        <StatusBadge label={t('hr.publicHoliday.passed')} variant="default" />
      );
    }
    if (row.daysUntil === 0) {
      return <StatusBadge label={t('hr.publicHoliday.today')} variant="orange" />;
    }
    return (
      <StatusBadge
        label={t('hr.publicHoliday.inDays', { days: row.daysUntil })}
        variant="info"
      />
    );
  }

  const columns: ColumnsType<PublicHoliday> = [
    {
      title: t('hr.publicHoliday.name'),
      dataIndex: 'name',
      key: 'name',
      render: (value: string, row) => (
        <span className={row.isActive ? '' : 'text-[#9ca3af]'}>{value}</span>
      ),
    },
    {
      title: t('hr.publicHoliday.nameZh'),
      dataIndex: 'nameZh',
      key: 'nameZh',
      render: (value: string | null, row) => (
        <span className={row.isActive ? '' : 'text-[#9ca3af]'}>
          {value || '—'}
        </span>
      ),
    },
    {
      title: t('hr.publicHoliday.date'),
      dataIndex: 'date',
      key: 'date',
      render: (value: string) => formatProjectDate(value),
    },
    {
      title: t('hr.publicHoliday.appliesTo'),
      dataIndex: 'appliesToNationality',
      key: 'appliesToNationality',
      render: (value: HolidayNationality) => appliesLabel(value),
    },
    {
      title: t('hr.publicHoliday.recurring'),
      dataIndex: 'isRecurring',
      key: 'isRecurring',
      render: (value: boolean) =>
        value ? t('common.yes') : t('common.no'),
    },
    {
      title: t('hr.publicHoliday.active'),
      dataIndex: 'isActive',
      key: 'isActive',
      render: (value: boolean) => (
        <StatusBadge
          label={value ? t('common.active') : t('common.inactive')}
          variant={value ? 'success' : 'default'}
        />
      ),
    },
    {
      title: t('hr.publicHoliday.notifyDaysBefore'),
      dataIndex: 'notifyDaysBefore',
      key: 'notifyDaysBefore',
    },
    {
      title: t('hr.publicHoliday.when'),
      key: 'when',
      render: (_value, row) => daysUntilBadge(row),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 72,
      render: (_value, row) => (
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              {
                key: 'edit',
                label: t('common.update'),
                onClick: () => openEdit(row),
              },
              row.isActive
                ? {
                    key: 'deactivate',
                    label: t('hr.publicHoliday.deactivate'),
                    danger: true,
                    onClick: () => void handleDeactivate(row.id),
                  }
                : {
                    key: 'reactivate',
                    label: t('hr.publicHoliday.reactivate'),
                    onClick: () => void handleReactivate(row),
                  },
            ],
          }}
        >
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ];

  if (!canViewHr) {
    return (
        <ErpNotice tone="warning" title={t('pages.hr.accessDenied')} />
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page">
      <Modal
        title={t('hr.publicHoliday.duplicateYear')}
        open={duplicateOpen}
        onCancel={() => setDuplicateOpen(false)}
        onOk={() => void handleDuplicate()}
        confirmLoading={duplicateMutation.isPending}
        okText={t('hr.publicHoliday.duplicate')}
      >
        <p className="erp-users-cell-sub mb-3">
          {t('hr.publicHoliday.duplicateYearHint')}
        </p>
        <div className="flex flex-col gap-3">
          <InputNumber
            className="w-full"
            value={fromYear}
            onChange={(value) => setFromYear(Number(value ?? fromYear))}
            addonBefore={t('hr.publicHoliday.fromYear')}
          />
          <InputNumber
            className="w-full"
            value={toYear}
            onChange={(value) => setToYear(Number(value ?? toYear))}
            addonBefore={t('hr.publicHoliday.toYear')}
          />
        </div>
      </Modal>

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar">
          <div className="flex min-w-0 items-center gap-2">
            <span className="erp-pro-card-title">
              {t('pages.hr.publicHolidays.listTitle')}
            </span>
            <span className="erp-users-count-pill">{rows.length}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              icon={<ReloadOutlined />}
              onClick={() => void listQuery.refetch()}
            />
            <Button
              icon={<CopyOutlined />}
              onClick={() => setDuplicateOpen(true)}
            >
              {isNarrow ? undefined : t('hr.publicHoliday.duplicateYear')}
            </Button>
            {selectedIds.length > 0 ? (
              <>
                <Button
                  icon={<CheckCircleOutlined />}
                  onClick={() => void handleBulk(true)}
                  loading={bulkMutation.isPending}
                >
                  {t('hr.publicHoliday.reactivate')}
                </Button>
                <Button
                  icon={<StopOutlined />}
                  danger
                  onClick={() => void handleBulk(false)}
                  loading={bulkMutation.isPending}
                >
                  {t('hr.publicHoliday.deactivate')}
                </Button>
              </>
            ) : null}
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              {t('hr.publicHoliday.new')}
            </Button>
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Select
            allowClear
            placeholder={t('hr.publicHoliday.filterYear')}
            className="min-w-[140px]"
            value={year}
            onChange={(value: number | undefined) => {
              setYear(value);
            }}
            options={Array.from({ length: 8 }, (_, index) => {
              const y = dayjs().year() - 2 + index;
              return { value: y, label: String(y) };
            })}
          />
          <Select
            allowClear
            placeholder={t('hr.publicHoliday.appliesTo')}
            className="min-w-[180px]"
            value={nationality}
            onChange={(value: HolidayNationality | undefined) => {
              setNationality(value);
            }}
            options={[
              { value: 'ALL', label: t('hr.publicHoliday.allEmployees') },
              {
                value: 'ETHIOPIAN',
                label: t('hr.publicHoliday.ethiopianOnly'),
              },
              { value: 'CHINESE', label: t('hr.publicHoliday.chineseOnly') },
            ]}
          />
          <Select
            allowClear
            placeholder={t('common.status')}
            className="min-w-[140px]"
            value={
              activeFilter === undefined
                ? undefined
                : activeFilter
                  ? 'active'
                  : 'inactive'
            }
            onChange={(value: string | undefined) => {
              setActiveFilter(
                value === 'active' ? true : value === 'inactive' ? false : undefined,
              );
            }}
            options={[
              { value: 'active', label: t('common.active') },
              { value: 'inactive', label: t('common.inactive') },
            ]}
          />
        </div>

        {grouped.length === 0 ? (
          <TableEmptyState
            icon={<CalendarOutlined />}
            title={t('hr.publicHoliday.empty')}
            description={t('hr.publicHoliday.emptyHint')}
          />
        ) : (
          grouped.map(([groupYear, holidays]) => (
            <div key={groupYear} className="mb-6">
              <h3 className="erp-employee-section-title px-4 py-2">
                {groupYear}
              </h3>
              <DataTable<PublicHoliday>
                rowKey="id"
                columns={columns}
                dataSource={holidays}
                loading={listQuery.isLoading}
                pagination={false}
                rowSelection={{
                  selectedRowKeys: selectedIds,
                  onChange: (keys) => setSelectedIds(keys.map(String)),
                }}
                rowClassName={(row) => (row.isActive ? '' : 'opacity-60')}
              />
            </div>
          ))
        )}
      </div>

      <Drawer
        title={
          editing ? t('hr.publicHoliday.edit') : t('hr.publicHoliday.new')
        }
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={isNarrow ? '100%' : 480}
        destroyOnClose
        extra={
          <Button
            type="primary"
            onClick={() => void handleSave()}
            loading={createMutation.isPending || updateMutation.isPending}
          >
            {t('common.save')}
          </Button>
        }
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item
            name="name"
            label={t('hr.publicHoliday.name')}
            rules={[{ required: true, message: t('hr.publicHoliday.nameRequired') }]}
          >
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="nameZh" label={t('hr.publicHoliday.nameZh')}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item
            name="date"
            label={t('hr.publicHoliday.date')}
            rules={[{ required: true, message: t('hr.publicHoliday.dateRequired') }]}
          >
            <DatePicker className="w-full" />
          </Form.Item>
          <Form.Item
            name="appliesToNationality"
            label={t('hr.publicHoliday.appliesTo')}
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { value: 'ALL', label: t('hr.publicHoliday.allEmployees') },
                {
                  value: 'ETHIOPIAN',
                  label: t('hr.publicHoliday.ethiopianOnly'),
                },
                { value: 'CHINESE', label: t('hr.publicHoliday.chineseOnly') },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="isRecurring"
            label={t('hr.publicHoliday.recurring')}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="notifyDaysBefore"
            label={t('hr.publicHoliday.notifyDaysBefore')}
          >
            <InputNumber min={0} max={90} className="w-full" />
          </Form.Item>
          <Form.Item
            name="isActive"
            label={t('hr.publicHoliday.active')}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item name="notes" label={t('hr.form.reason')}>
            <Input.TextArea rows={3} maxLength={4000} />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
