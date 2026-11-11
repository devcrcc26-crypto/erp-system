'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  Radio,
  Select,
  Space,
  Upload,
} from 'antd';
import { PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { Mail } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import { type Dayjs } from 'dayjs';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import ListStatusTabs, {
  type ListStatusTabKey,
} from '@/components/ui/ListStatusTabs/ListStatusTabs';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  Correspondence,
  CorrespondenceDirection,
  CorrespondenceStatus,
  CorrespondenceType,
} from '@/lib/api/project-management.types';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useEpcCapabilities,
  usePermissionsLoading,
  usePmCapabilities,
} from '@/hooks/use-pm-capabilities';
import {
  useCorrespondence,
  useCreateCorrespondence,
} from '@/lib/query/correspondence';
import { useUploadDocumentToFolder } from '@/lib/query/documents';
import { useAllProjects, useProjectTeam } from '@/lib/query/projects';
import { useFullUsersDirectory } from '@/lib/query/users';
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';
import {
  correspondenceDirectionVariant,
  correspondenceStatusVariant,
  formatCorrespondenceDirection,
  formatCorrespondenceStatus,
} from '@/lib/utils/pm-status-display';
import {
  CORRESPONDENCE_ACTIVE_STATUSES,
  CORRESPONDENCE_CLOSED_STATUSES,
  buildTabStatusFilterOptions,
  resolveTabStatusFilter,
} from '@/lib/utils/list-status-tabs';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAuthStore } from '@/stores/auth.store';
import CorrespondenceDetailDrawer from '@/components/modules/projects/correspondence/CorrespondenceDetailDrawer';
import ProjectModuleGate from '@/components/modules/projects/ProjectModuleGate';
import ProjectTeamUserSelect from '@/components/ui/ProjectTeamUserSelect/ProjectTeamUserSelect';

const TYPE_OPTIONS: { value: CorrespondenceType; label: string }[] = [
  { value: 'LETTER', label: 'Letter' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'NOTICE', label: 'Notice' },
  { value: 'INSTRUCTION', label: 'Instruction' },
  { value: 'MEMO', label: 'Memo' },
];

const DIRECTION_OPTIONS: { value: CorrespondenceDirection; label: string }[] = [
  { value: 'OUTGOING', label: 'Outgoing' },
  { value: 'INCOMING', label: 'Incoming' },
];

const DEFAULT_COMPANY = 'CCECC';

interface CorrespondenceFormValues {
  direction: CorrespondenceDirection;
  correspondenceType: CorrespondenceType;
  subject: string;
  correspondenceDate: Dayjs;
  senderUserId?: string;
  recipientUserId?: string;
  senderName: string;
  senderCompany?: string;
  recipientName: string;
  recipientCompany?: string;
  parentId?: string;
  notes?: string;
}

function directionDefaults(
  direction: CorrespondenceDirection,
  currentUserId: string | undefined,
  currentUserName: string,
): Pick<
  CorrespondenceFormValues,
  | 'senderUserId'
  | 'recipientUserId'
  | 'senderName'
  | 'senderCompany'
  | 'recipientName'
  | 'recipientCompany'
> {
  if (direction === 'OUTGOING') {
    return {
      senderUserId: currentUserId,
      recipientUserId: undefined,
      senderName: currentUserName,
      senderCompany: DEFAULT_COMPANY,
      recipientName: '',
      recipientCompany: '',
    };
  }
  return {
    senderUserId: undefined,
    recipientUserId: currentUserId,
    senderName: '',
    senderCompany: '',
    recipientName: currentUserName,
    recipientCompany: DEFAULT_COMPANY,
  };
}

export function CorrespondenceFormDrawer({
  open,
  projectId: projectIdProp,
  showProjectSelector = false,
  initialParentId,
  initialDirection,
  lockedDirection = false,
  onClose,
  onSaved,
}: {
  open: boolean;
  projectId?: string;
  showProjectSelector?: boolean;
  initialParentId?: string;
  initialDirection?: CorrespondenceDirection;
  lockedDirection?: boolean;
  onClose: () => void;
  onSaved: (created: Correspondence) => void;
}): React.ReactNode {
  const [form] = Form.useForm<CorrespondenceFormValues>();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    projectIdProp ?? null,
  );
  const effectiveProjectId = selectedProjectId ?? projectIdProp ?? '';
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const currentUser = useAuthStore((state) => state.user);
  const currentUserName = currentUser ? formatUserName(currentUser) : '';
  const currentUserId = currentUser?.id;

  const createItem = useCreateCorrespondence();
  const uploadDocument = useUploadDocumentToFolder();
  const messageApi = useAppMessage();

  const defaultDirection = initialDirection ?? 'OUTGOING';
  const watchedDirection = Form.useWatch('direction', form) as
    | CorrespondenceDirection
    | undefined;
  const isOutgoing = (watchedDirection ?? defaultDirection) === 'OUTGOING';

  const teamQuery = useProjectTeam(
    effectiveProjectId,
    open && Boolean(effectiveProjectId),
  );
  const usersDirectoryQuery = useFullUsersDirectory({
    enabled: open && Boolean(effectiveProjectId),
  });
  const teamNameByUserId = useMemo(() => {
    const fromTeam = new Map(
      (teamQuery.data ?? [])
        .filter((member) => member.userName)
        .map((member) => [member.userId, member.userName as string]),
    );
    for (const user of usersDirectoryQuery.data ?? []) {
      if (!fromTeam.has(user.id)) {
        fromTeam.set(user.id, formatUserName(user));
      }
    }
    return fromTeam;
  }, [teamQuery.data, usersDirectoryQuery.data]);

  function resolveTeamMemberName(userId: string | undefined): string {
    if (!userId) {
      return '';
    }
    if (userId === currentUserId && currentUserName) {
      return currentUserName;
    }
    return teamNameByUserId.get(userId) ?? '';
  }

  const projectsQuery = useAllProjects({}, open && showProjectSelector);
  const projectOptions = useMemo(
    () =>
      (projectsQuery.data?.data ?? []).map((p) => ({
        value: p.id,
        label: `${p.projectCode} - ${p.name}`,
      })),
    [projectsQuery.data?.data],
  );

  const parentOptionsQuery = useCorrespondence(
    effectiveProjectId,
    { page: 1, limit: 100 },
    open && Boolean(effectiveProjectId),
  );
  const parentOptions = useMemo(
    () =>
      (parentOptionsQuery.data?.data ?? []).map((c) => ({
        value: c.id,
        label: `${c.referenceNumber} - ${c.subject}`,
      })),
    [parentOptionsQuery.data?.data],
  );

  useEffect(() => {
    if (open && projectIdProp) {
      setSelectedProjectId(projectIdProp);
    }
  }, [open, projectIdProp]);

  useEffect(() => {
    if (!open) {
      form.resetFields();
      setQueuedFiles([]);
      setUploading(false);
      if (showProjectSelector && !projectIdProp) {
        setSelectedProjectId(null);
      }
    }
  }, [open, form, showProjectSelector, projectIdProp]);

  async function uploadQueuedFiles(folderId: string): Promise<void> {
    setUploading(true);
    await Promise.all(
      queuedFiles.map((file) => uploadDocument.mutateAsync({ folderId, file })),
    );
  }

  async function handleSubmit(values: CorrespondenceFormValues): Promise<void> {
    if (!effectiveProjectId) {
      messageApi.error('Select a project first');
      return;
    }
    try {
      const result = await createItem.mutateAsync({
        projectId: effectiveProjectId,
        body: {
          correspondenceType: values.correspondenceType,
          direction: values.direction,
          subject: values.subject.trim(),
          senderName: values.senderName.trim(),
          recipientName: values.recipientName.trim(),
          senderCompany: values.senderCompany?.trim() || undefined,
          recipientCompany: values.recipientCompany?.trim() || undefined,
          senderUserId:
            values.direction === 'OUTGOING'
              ? values.senderUserId
              : undefined,
          recipientUserId:
            values.direction === 'INCOMING'
              ? values.recipientUserId
              : undefined,
          notes: values.notes?.trim() || undefined,
          correspondenceDate: values.correspondenceDate.format('YYYY-MM-DD'),
          parentId: values.parentId || undefined,
        },
      });

      if (queuedFiles.length > 0 && result.attachmentFolderId) {
        try {
          await uploadQueuedFiles(result.attachmentFolderId);
        } catch (uploadError) {
          notifyApiError(
            uploadError,
            'Correspondence created but file upload failed. Upload from the detail drawer.',
            messageApi,
          );
          form.resetFields();
          setQueuedFiles([]);
          onSaved(result);
          onClose();
          return;
        }
      }

      messageApi.success('Correspondence created');
      form.resetFields();
      setQueuedFiles([]);
      onSaved(result);
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to create correspondence', messageApi);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Drawer
      {...wideDetailDrawerProps}
      open={open}
      title={lockedDirection ? 'Record response' : 'New correspondence'}
      onClose={onClose}
      destroyOnHidden
    >
      {open ? (
        <Form<CorrespondenceFormValues>
          form={form}
          layout="vertical"
          className="erp-drawer-form"
          initialValues={{
            direction: defaultDirection,
            correspondenceType: 'LETTER',
            parentId: initialParentId,
            ...directionDefaults(
              defaultDirection,
              currentUserId,
              currentUserName,
            ),
          }}
          onValuesChange={(changed: Partial<CorrespondenceFormValues>) => {
            if (changed.direction !== undefined) {
              form.setFieldsValue(
                directionDefaults(
                  changed.direction,
                  currentUserId,
                  currentUserName,
                ),
              );
            }
            if (changed.senderUserId !== undefined) {
              form.setFieldValue(
                'senderName',
                resolveTeamMemberName(changed.senderUserId),
              );
            }
            if (changed.recipientUserId !== undefined) {
              form.setFieldValue(
                'recipientName',
                resolveTeamMemberName(changed.recipientUserId),
              );
            }
          }}
          onFinish={(values: CorrespondenceFormValues) =>
            void handleSubmit(values)
          }
        >
          {showProjectSelector && (
            <Form.Item label="Project" required>
              <Select
                showSearch
                placeholder="Select project"
                options={projectOptions}
                loading={projectsQuery.isLoading}
                optionFilterProp="label"
                value={selectedProjectId ?? undefined}
                onChange={(value: string) => {
                  setSelectedProjectId(value);
                  form.setFieldValue('parentId', undefined);
                }}
              />
            </Form.Item>
          )}

          <Form.Item
            label="Direction"
            name="direction"
            rules={[{ required: true }]}
          >
            <Radio.Group disabled={lockedDirection}>
              <Radio value="OUTGOING">Outgoing (we are sending)</Radio>
              <Radio value="INCOMING">Incoming (we received)</Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            label="Type"
            name="correspondenceType"
            rules={[{ required: true }]}
          >
            <Select options={TYPE_OPTIONS} />
          </Form.Item>

          <Form.Item
            label="Subject"
            name="subject"
            rules={[{ required: true, message: 'Subject is required' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            label="Date"
            name="correspondenceDate"
            rules={[{ required: true }]}
          >
            <DatePicker className="w-full" />
          </Form.Item>

          <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
            {isOutgoing ? (
              <Form.Item
                label="From (name)"
                name="senderUserId"
                rules={[
                  { required: true, message: 'Select who this is from' },
                ]}
              >
                {effectiveProjectId ? (
                  <ProjectTeamUserSelect
                    projectId={effectiveProjectId}
                    placeholder="Select project team member"
                  />
                ) : (
                  <Select disabled placeholder="Select a project first" />
                )}
              </Form.Item>
            ) : (
              <Form.Item
                label="From (name)"
                name="senderName"
                rules={[
                  { required: true, message: 'Sender name is required' },
                ]}
              >
                <Input placeholder="External sender name" />
              </Form.Item>
            )}
            <Form.Item label="From (company)" name="senderCompany">
              <Input />
            </Form.Item>
          </div>
          <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
            {isOutgoing ? (
              <Form.Item
                label="To (name)"
                name="recipientName"
                rules={[
                  { required: true, message: 'Recipient name is required' },
                ]}
              >
                <Input placeholder="External recipient name" />
              </Form.Item>
            ) : (
              <Form.Item
                label="To (name)"
                name="recipientUserId"
                rules={[
                  { required: true, message: 'Select who this is to' },
                ]}
              >
                {effectiveProjectId ? (
                  <ProjectTeamUserSelect
                    projectId={effectiveProjectId}
                    placeholder="Select project team member"
                  />
                ) : (
                  <Select disabled placeholder="Select a project first" />
                )}
              </Form.Item>
            )}
            <Form.Item label="To (company)" name="recipientCompany">
              <Input />
            </Form.Item>
          </div>
          {isOutgoing ? (
            <Form.Item name="senderName" hidden>
              <Input />
            </Form.Item>
          ) : (
            <Form.Item name="recipientName" hidden>
              <Input />
            </Form.Item>
          )}

          <Form.Item label="In response to (optional)" name="parentId">
            <Select
              allowClear
              showSearch
              disabled={lockedDirection}
              placeholder="Link to an earlier correspondence"
              loading={parentOptionsQuery.isLoading}
              optionFilterProp="label"
              options={parentOptions}
            />
          </Form.Item>

          <Form.Item label="Notes (optional)" name="notes">
            <Input.TextArea rows={3} />
          </Form.Item>

          <Form.Item label="Attachments">
            <Upload
              multiple
              beforeUpload={(file) => {
                setQueuedFiles((prev) => [...prev, file]);
                return false;
              }}
              onRemove={(file) => {
                setQueuedFiles((prev) =>
                  prev.filter(
                    (f) => f.name !== file.name || f.size !== file.size,
                  ),
                );
              }}
              fileList={queuedFiles.map((f, i) => ({
                uid: `${f.name}-${i}`,
                name: f.name,
                status: 'done' as const,
              }))}
            >
              <Button icon={<UploadOutlined />}>Add files</Button>
            </Upload>
          </Form.Item>

          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={createItem.isPending || uploading}
              disabled={showProjectSelector && !effectiveProjectId}
            >
              Create correspondence
            </Button>
          </div>
        </Form>
      ) : null}
    </Drawer>
  );
}

export default function CorrespondencePageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const { params, resetPage, bindMeta } = useTablePagination();
  const [activeTab, setActiveTab] = useState<ListStatusTabKey>('active');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CorrespondenceStatus | undefined>();
  const [directionFilter, setDirectionFilter] = useState<CorrespondenceDirection | undefined>();
  const [typeFilter, setTypeFilter] = useState<CorrespondenceType | undefined>();
  const [formState, setFormState] = useState<{
    parentId?: string;
    direction?: CorrespondenceDirection;
    locked?: boolean;
  } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const permLoading = usePermissionsLoading();
  const pm = usePmCapabilities();
  const epc = useEpcCapabilities();
  const canCreate = epc.navFullAccess || pm.correspondence.canCreate;

  const filterParams = {
    search: search.trim() || undefined,
    direction: directionFilter,
    correspondenceType: typeFilter,
  };

  const activeQuery = useCorrespondence(
    projectId,
    {
      ...(activeTab === 'active' ? params : { page: 1 as const, limit: 1 as const }),
      ...filterParams,
      status: resolveTabStatusFilter(
        CORRESPONDENCE_ACTIVE_STATUSES,
        activeTab === 'active' ? statusFilter : undefined,
      ),
    },
    !permLoading,
  );
  const closedQuery = useCorrespondence(
    projectId,
    {
      ...(activeTab === 'closed' ? params : { page: 1 as const, limit: 1 as const }),
      ...filterParams,
      status: resolveTabStatusFilter(
        CORRESPONDENCE_CLOSED_STATUSES,
        activeTab === 'closed' ? statusFilter : undefined,
      ),
    },
    !permLoading,
  );

  const query = activeTab === 'active' ? activeQuery : closedQuery;

  const refetchLists = (): void => {
    void activeQuery.refetch();
    void closedQuery.refetch();
  };

  const columns: ColumnsType<Correspondence> = useMemo(
    () => [
      {
        title: 'Ref #',
        dataIndex: 'referenceNumber',
        key: 'referenceNumber',
        render: (value: string, record) => (
          <Button
            type="link"
            className={`!px-0 ${layout.traceabilityLinkClass}`}
            style={{ color: tokens.colorTeal600 }}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedId(record.id);
            }}
          >
            {value}
          </Button>
        ),
      },
      {
        title: 'Direction',
        dataIndex: 'direction',
        key: 'direction',
        render: (direction: CorrespondenceDirection) => (
          <StatusBadge
            label={formatCorrespondenceDirection(direction)}
            variant={correspondenceDirectionVariant(direction)}
          />
        ),
      },
      {
        title: 'Type',
        dataIndex: 'correspondenceType',
        key: 'correspondenceType',
        render: (value: string) => value.replace(/_/g, ' '),
      },
      {
        title: 'Subject',
        dataIndex: 'subject',
        key: 'subject',
        ellipsis: true,
      },
      {
        title: 'From',
        key: 'from',
        render: (_: unknown, record: Correspondence) =>
          record.senderCompany
            ? `${record.senderName} (${record.senderCompany})`
            : record.senderName,
      },
      {
        title: 'To',
        key: 'to',
        render: (_: unknown, record: Correspondence) =>
          record.recipientCompany
            ? `${record.recipientName} (${record.recipientCompany})`
            : record.recipientName,
      },
      {
        title: 'Date',
        dataIndex: 'correspondenceDate',
        key: 'correspondenceDate',
        render: (value: string) => formatProjectDate(value),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status: CorrespondenceStatus) => (
          <StatusBadge
            label={formatCorrespondenceStatus(status)}
            variant={correspondenceStatusVariant(status)}
          />
        ),
      },
    ],
    [],
  );

  if (permLoading || (query.isLoading && !query.data)) {
    return <PageLoadingSkeleton />;
  }

  const rows = query.data?.data ?? [];
  const meta = query.data?.meta;
  const activeCount = activeQuery.data?.meta?.total ?? 0;
  const closedCount = closedQuery.data?.meta?.total ?? 0;

  return (
    <ProjectModuleGate projectId={projectId} module="correspondence">
    <>
      <FormLayout
        title="Correspondence"
        description="Formal letters, notices, instructions, and project communication."
        extra={
          canCreate ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setFormState({})}
            >
              New correspondence
            </Button>
          ) : undefined
        }
      >
        {query.isError && (
          <Alert
            type="error"
            showIcon
            className="!mb-4"
            title="Unable to load correspondence"
            description={
              query.error instanceof ApiRequestError
                ? query.error.message
                : 'Please try again.'
            }
          />
        )}

        <ListStatusTabs
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key);
            setStatusFilter(undefined);
            resetPage();
          }}
          activeLabel="Active"
          closedLabel="Closed"
          activeCount={activeCount}
          closedCount={closedCount}
        />

        <Space wrap className="!mb-4">
          <ListSearchInput
            placeholder="Search correspondence"
            className={layout.filterControl}
            committedValue={search}
            onCommit={(value) => {
              resetPage();
              setSearch(value);
            }}
          />
          <Select
            allowClear
            placeholder="Status"
            className={layout.filterControlSm}
            value={statusFilter}
            onChange={(value: CorrespondenceStatus | undefined) => {
              resetPage();
              setStatusFilter(value);
            }}
            options={
              activeTab === 'active'
                ? buildTabStatusFilterOptions(
                    CORRESPONDENCE_ACTIVE_STATUSES,
                    formatCorrespondenceStatus,
                  )
                : buildTabStatusFilterOptions(
                    CORRESPONDENCE_CLOSED_STATUSES,
                    formatCorrespondenceStatus,
                  )
            }
          />
          <Select
            allowClear
            placeholder="Direction"
            className={layout.filterControlXs}
            value={directionFilter}
            onChange={(value: CorrespondenceDirection | undefined) => {
              resetPage();
              setDirectionFilter(value);
            }}
            options={DIRECTION_OPTIONS}
          />
          <Select
            allowClear
            placeholder="Type"
            className={layout.filterControlXs}
            value={typeFilter}
            onChange={(value: CorrespondenceType | undefined) => {
              resetPage();
              setTypeFilter(value);
            }}
            options={TYPE_OPTIONS}
          />
        </Space>

        <TableUpdatingIndicator
          active={query.isFetching && Boolean(query.data)}
        />

        <DataTable<Correspondence>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          pagination={bindMeta(meta)}
          onRow={(record) => ({
            onClick: () => setSelectedId(record.id),
            style: { cursor: 'pointer' },
          })}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<Mail />}
                title="No correspondence"
                description="Log formal project letters, notices, and instructions"
                action={
                  canCreate
                    ? {
                        label: 'New correspondence',
                        onClick: () => setFormState({}),
                      }
                    : undefined
                }
              />
            ),
          }}
        />
      </FormLayout>

      <CorrespondenceFormDrawer
        open={formState !== null}
        projectId={projectId}
        initialParentId={formState?.parentId}
        initialDirection={formState?.direction}
        lockedDirection={formState?.locked}
        onClose={() => setFormState(null)}
        onSaved={(created) => {
          refetchLists();
          setFormState(null);
          setSelectedId(created.id);
        }}
      />

      <CorrespondenceDetailDrawer
        projectId={projectId}
        correspondenceId={selectedId}
        onClose={() => setSelectedId(null)}
        onUpdated={() => refetchLists()}
        onNavigateTo={(id) => setSelectedId(id)}
        onOpenCreateResponse={(opts) =>
          setFormState({
            parentId: opts.parentId,
            direction: opts.direction,
            locked: true,
          })
        }
      />
    </>
    </ProjectModuleGate>
  );
}
