'use client';

import './org-v2.css';

import { useState } from 'react';
import {
  Alert,
  Button,
  Dropdown,
  Form,
  Grid,
  Input,
  InputNumber,
  Modal,
  Spin,
  Switch,
  type MenuProps,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  MoreOutlined,
  PlusOutlined,
  RiseOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import {
  useCanManageDepartments,
  useCanViewDepartmentsNav,
} from '@/hooks/use-org-nav-access';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import {
  useCreateSeniorityLevel,
  useDeleteSeniorityLevel,
  useSeniorityLevels,
  useUpdateSeniorityLevel,
  type SeniorityLevel,
} from '@/lib/query/org';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const PAGE_CHROME =
  'erp-pro-list-page erp-users-page erp-org-positions-page erp-org-v2';

interface LevelFormValues {
  name: string;
  nameZh?: string;
  sortOrder?: number;
  isActive: boolean;
}

/**
 * Seniority levels (Junior / Middle / Senior …) that HR assigns on the
 * employee form. Same access as Positions (departments.view / manage).
 */
export default function SeniorityLevelsPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const screens = Grid.useBreakpoint();
  const isNarrow = screens.sm === false;
  const permLoading = usePermissionsLoading();
  const canView = useCanViewDepartmentsNav();
  const canManage = useCanManageDepartments();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<LevelFormValues>();
  const [editing, setEditing] = useState<SeniorityLevel | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<SeniorityLevel | null>(null);

  useSetHeaderExtra(null);

  const levelsQuery = useSeniorityLevels({}, canView);
  const createLevel = useCreateSeniorityLevel();
  const updateLevel = useUpdateSeniorityLevel();
  const deleteLevel = useDeleteSeniorityLevel();
  const rows = levelsQuery.data ?? [];
  const saving = createLevel.isPending || updateLevel.isPending;

  function openModal(level: SeniorityLevel | null): void {
    setEditing(level);
    form.setFieldsValue(
      level
        ? {
            name: level.name,
            nameZh: level.nameZh ?? '',
            sortOrder: level.sortOrder,
            isActive: level.isActive,
          }
        : {
            name: '',
            nameZh: '',
            sortOrder: rows.length ? Math.max(...rows.map((r) => r.sortOrder)) + 1 : 1,
            isActive: true,
          },
    );
    setModalOpen(true);
  }

  async function handleSave(): Promise<void> {
    const values = await form.validateFields();
    const body = {
      name: values.name.trim(),
      nameZh: values.nameZh?.trim() ?? '',
      sortOrder: values.sortOrder ?? 0,
      isActive: values.isActive,
    };
    try {
      if (editing) {
        await updateLevel.mutateAsync({ id: editing.id, body });
        messageApi.success(t('pages.seniorityLevels.updated'));
      } else {
        await createLevel.mutateAsync(body);
        messageApi.success(t('pages.seniorityLevels.created'));
      }
      setModalOpen(false);
      setEditing(null);
    } catch (error: unknown) {
      notifyApiError(
        error,
        editing
          ? t('pages.seniorityLevels.updateFailed')
          : t('pages.seniorityLevels.createFailed'),
        messageApi,
      );
    }
  }

  function buildActionMenu(record: SeniorityLevel): MenuProps['items'] {
    const items: MenuProps['items'] = [
      {
        key: 'edit',
        icon: canManage ? <EditOutlined /> : <EyeOutlined />,
        label: canManage ? t('common.update') : t('common.view'),
        onClick: () => openModal(record),
      },
    ];
    if (canManage) {
      items.push({
        key: 'delete',
        icon: <DeleteOutlined />,
        label: t('common.delete'),
        danger: true,
        onClick: () => setDeleting(record),
      });
    }
    return items;
  }

  const columns: ColumnsType<SeniorityLevel> = [
    {
      title: t('pages.seniorityLevels.table.order'),
      dataIndex: 'sortOrder',
      key: 'sortOrder',
      width: 80,
      render: (value: number) => <span className="erp-users-cell-sub">{value}</span>,
    },
    {
      title: t('pages.seniorityLevels.table.name'),
      dataIndex: 'name',
      key: 'name',
      render: (value: string, row) => (
        <div className="min-w-0">
          <p className="erp-users-cell-strong m-0">{value}</p>
          {row.nameZh ? (
            <p className="erp-users-cell-sub m-0 truncate">{row.nameZh}</p>
          ) : null}
        </div>
      ),
    },
    {
      title: t('pages.seniorityLevels.table.people'),
      key: 'people',
      width: isNarrow ? 80 : 110,
      align: 'right',
      render: (_value, row) => {
        const count = row._count?.users ?? 0;
        return (
          <span className={count > 0 ? 'erp-users-cell-strong' : 'erp-users-cell-sub'}>
            {count.toLocaleString()}
          </span>
        );
      },
    },
    {
      title: t('common.status'),
      key: 'isActive',
      width: 110,
      render: (_value, row) => (
        <StatusBadge
          label={row.isActive ? t('common.active') : t('common.inactive')}
          variant={row.isActive ? 'success' : 'default'}
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 56,
      render: (_value, row) => (
        <div
          className="erp-table-row-actions flex items-center justify-end"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Dropdown
            menu={{ items: buildActionMenu(row) }}
            trigger={['click']}
            rootClassName="erp-row-actions-menu"
          >
            <Button
              size="small"
              type="text"
              icon={<MoreOutlined />}
              aria-label={t('common.actions')}
            />
          </Dropdown>
        </div>
      ),
    },
  ];

  if (permLoading || (levelsQuery.isLoading && rows.length === 0 && canView)) {
    return (
      <div className={PAGE_CHROME}>
        <div className="erp-org-loading">
          <Spin />
        </div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className={PAGE_CHROME}>
        <Alert type="warning" showIcon title={t('pages.seniorityLevels.accessDenied')} />
      </div>
    );
  }

  if (levelsQuery.isError) {
    return (
      <div className={PAGE_CHROME}>
        <Alert type="error" showIcon title={t('pages.seniorityLevels.loadFailed')} />
      </div>
    );
  }

  return (
    <div className={PAGE_CHROME}>
      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
            <h3 className="erp-pro-card-toolbar-title">
              {t('pages.seniorityLevels.title')}
            </h3>
            <span className="erp-users-count-pill">{rows.length.toLocaleString()}</span>
          </div>
          <div className="erp-users-toolbar-actions flex flex-wrap items-center gap-2">
            <Link
              href="/positions"
              className="inline-flex items-center gap-1.5 rounded text-[13px] font-medium !text-slate-600 no-underline hover:!text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              <ArrowLeft size={14} strokeWidth={2} aria-hidden />
              {t('nav.positions')}
            </Link>
            {canManage ? (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => openModal(null)}
                aria-label={t('pages.seniorityLevels.add')}
              >
                {isNarrow ? undefined : t('pages.seniorityLevels.add')}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="erp-pro-table-card-body">
          <DataTable<SeniorityLevel>
            rowKey="id"
            className="erp-pro-table erp-users-table"
            size={isNarrow ? 'small' : 'middle'}
            columns={columns}
            dataSource={rows}
            loading={levelsQuery.isFetching && rows.length === 0}
            pagination={false}
            onRow={(record) => ({
              onClick: () => openModal(record),
              className: 'cursor-pointer',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<RiseOutlined />}
                  title={t('pages.seniorityLevels.empty')}
                  description={t('pages.seniorityLevels.description')}
                  action={
                    canManage
                      ? { label: t('pages.seniorityLevels.add'), onClick: () => openModal(null) }
                      : undefined
                  }
                />
              ),
            }}
          />
        </div>
      </div>

      <Modal
        open={modalOpen}
        title={
          editing
            ? canManage
              ? t('pages.seniorityLevels.edit')
              : t('pages.seniorityLevels.view')
            : t('pages.seniorityLevels.add')
        }
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        onOk={() => void handleSave()}
        onCancel={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        confirmLoading={saving}
        okButtonProps={{ disabled: !canManage }}
        forceRender
      >
        <Form form={form} layout="vertical" disabled={!canManage}>
          <Form.Item
            label={t('pages.seniorityLevels.form.name')}
            name="name"
            rules={[
              { required: true, whitespace: true, message: t('pages.seniorityLevels.form.nameRequired') },
              { max: 100 },
            ]}
          >
            <Input placeholder={t('pages.seniorityLevels.form.namePlaceholder')} />
          </Form.Item>
          <Form.Item
            label={t('pages.seniorityLevels.form.nameZh')}
            name="nameZh"
            rules={[{ max: 100 }]}
          >
            <Input placeholder={t('pages.seniorityLevels.form.nameZhPlaceholder')} />
          </Form.Item>
          <Form.Item
            label={t('pages.seniorityLevels.form.sortOrder')}
            name="sortOrder"
            extra={t('pages.seniorityLevels.form.sortOrderHelp')}
          >
            <InputNumber min={0} max={999} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label={t('common.active')}
            name="isActive"
            valuePropName="checked"
            extra={t('pages.seniorityLevels.form.activeHelp')}
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title={t('pages.seniorityLevels.deleteTitle')}
        description={
          deleting
            ? t('pages.seniorityLevels.deleteDescription', { name: deleting.name })
            : undefined
        }
        confirmLabel={t('common.delete')}
        danger
        confirmLoading={deleteLevel.isPending}
        onConfirm={() => {
          if (!deleting) {
            return;
          }
          void deleteLevel
            .mutateAsync(deleting.id)
            .then(() => {
              messageApi.success(t('pages.seniorityLevels.deleted'));
              setDeleting(null);
            })
            .catch((error: unknown) => {
              notifyApiError(error, t('pages.seniorityLevels.deleteFailed'), messageApi);
            });
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
