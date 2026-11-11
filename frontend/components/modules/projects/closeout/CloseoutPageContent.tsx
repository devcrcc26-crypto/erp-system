// UI polish pass - styles only, no logic changes

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Collapse,
  DatePicker,
  Divider,
  Form,
  Input,
  InputNumber,
  Progress,
  Select,
  Tabs,
} from 'antd';
import type { CheckboxChangeEvent } from 'antd/es/checkbox';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import KPICard from '@/components/ui/KPICard/KPICard';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import WorkflowStepper from '@/components/ui/WorkflowStepper/WorkflowStepper';
import { CLOSEOUT_WORKFLOW } from '@/lib/api/workflow';
import type {
  CloseoutStatus,
  Warranty,
} from '@/lib/api/project-management.types';
import {
  useAddWarranty,
  useCloseout,
  useInitializeCloseout,
  useRemoveWarranty,
  useUpdateCloseout,
  useUpdateCloseoutChecklistItem,
} from '@/lib/query/closeout';
import { ApiRequestError } from '@/lib/api/errors';
import { useUserNameLookup } from '@/hooks/useUserNameLookup';
import { useAppMessage } from '@/hooks/use-app-message';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  closeoutStatusVariant,
  formatCloseoutStatus,
  isOverdue,
} from '@/lib/utils/pm-status-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { layout } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
import ProjectModuleGate from '@/components/modules/projects/ProjectModuleGate';

interface CloseoutFormValues {
  practicalCompletionDate?: Dayjs;
  defectsLiabilityEndDate?: Dayjs;
  finalCompletionDate?: Dayjs;
  contractValue?: number;
  variationsTotal?: number;
  claimsTotal?: number;
  finalSettlement?: number;
}

interface WarrantyFormValues {
  itemDescription: string;
  supplier?: string;
  startDate?: Dayjs;
  expiryDate?: Dayjs;
}

function AddCollapse({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <Collapse
      ghost
      className="!mt-2"
      items={[
        {
          key: 'add',
          label: (
            <span className="text-[13px] font-medium" style={{ color: tokens.colorTeal600 }}>
              {label}
            </span>
          ),
          children: <div className="pt-1">{children}</div>,
        },
      ]}
    />
  );
}

export default function CloseoutPageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const [activeTab, setActiveTab] = useState('overview');
  const [form] = Form.useForm<CloseoutFormValues>();
  const [warrantyForm] = Form.useForm<WarrantyFormValues>();
  const initAttemptedRef = useRef(false);
  const resolveUserName = useUserNameLookup();
  const messageApi = useAppMessage();

  const closeoutQuery = useCloseout(projectId);
  const { refetch: refetchCloseout } = closeoutQuery;
  const initializeCloseout = useInitializeCloseout();
  const updateCloseout = useUpdateCloseout();
  const updateChecklist = useUpdateCloseoutChecklistItem();
  const addWarranty = useAddWarranty();
  const removeWarranty = useRemoveWarranty();

  const closeout = closeoutQuery.data;
  const isEditable = closeout?.status !== 'ARCHIVE';

  const queryError =
    closeoutQuery.error instanceof ApiRequestError
      ? closeoutQuery.error
      : null;

  const projectNotFound =
    closeoutQuery.isError &&
    queryError?.status === 404 &&
    queryError.message === 'Project not found';

  const closeoutNotFound =
    closeoutQuery.isError &&
    queryError?.status === 404 &&
    queryError.message === 'Closeout not found';

  const apiUnavailable =
    closeoutQuery.isError &&
    queryError !== null &&
    (queryError.status === 404 || queryError.status === 0) &&
    !projectNotFound &&
    !closeoutNotFound;

  useEffect(() => {
    initAttemptedRef.current = false;
  }, [projectId]);

  useEffect(() => {
    if (
      !closeoutNotFound ||
      initAttemptedRef.current ||
      initializeCloseout.isPending
    ) {
      return;
    }

    initAttemptedRef.current = true;

    void initializeCloseout
      .mutateAsync(projectId)
      .then(() => refetchCloseout())
      .catch((error: unknown) => {
        if (
          error instanceof ApiRequestError &&
          (error.status === 409 ||
            error.message === 'Closeout already exists for this project')
        ) {
          void refetchCloseout();
          return;
        }

        if (
          error instanceof ApiRequestError &&
          error.message === 'Project not found'
        ) {
          return;
        }

        initAttemptedRef.current = false;
      });
  }, [
    closeoutNotFound,
    initializeCloseout,
    initializeCloseout.isPending,
    projectId,
    refetchCloseout,
  ]);

  useEffect(() => {
    if (closeout) {
      form.setFieldsValue({
        practicalCompletionDate: closeout.practicalCompletionDate
          ? dayjs(closeout.practicalCompletionDate)
          : undefined,
        defectsLiabilityEndDate: closeout.defectsLiabilityEndDate
          ? dayjs(closeout.defectsLiabilityEndDate)
          : undefined,
        finalCompletionDate: closeout.finalCompletionDate
          ? dayjs(closeout.finalCompletionDate)
          : undefined,
        contractValue: closeout.contractValue
          ? Number(closeout.contractValue)
          : undefined,
        variationsTotal: closeout.variationsTotal
          ? Number(closeout.variationsTotal)
          : undefined,
        claimsTotal: closeout.claimsTotal
          ? Number(closeout.claimsTotal)
          : undefined,
        finalSettlement: closeout.finalSettlement
          ? Number(closeout.finalSettlement)
          : undefined,
      });
    }
  }, [closeout, form]);

  const checklistProgress = useMemo(() => {
    if (!closeout?.checklistItems.length) return 0;
    const complete = closeout.checklistItems.filter((i) => i.isComplete).length;
    return Math.round((complete / closeout.checklistItems.length) * 100);
  }, [closeout?.checklistItems]);

  const checklistByCategory = useMemo(() => {
    if (!closeout) return [];
    const groups = new Map<string, typeof closeout.checklistItems>();
    for (const item of closeout.checklistItems) {
      const list = groups.get(item.category) ?? [];
      list.push(item);
      groups.set(item.category, list);
    }
    return [...groups.entries()];
  }, [closeout]);

  async function handleStatusChange(status: CloseoutStatus): Promise<void> {
    try {
      await updateCloseout.mutateAsync({ projectId, body: { status } });
      messageApi.success('Closeout status updated');
      void refetchCloseout();
    } catch (error) {
      notifyApiError(error, 'Failed to update status', messageApi);
    }
  }

  async function handleSaveSummary(values: CloseoutFormValues): Promise<void> {
    try {
      await updateCloseout.mutateAsync({
        projectId,
        body: {
          practicalCompletionDate:
            values.practicalCompletionDate?.format('YYYY-MM-DD'),
          defectsLiabilityEndDate:
            values.defectsLiabilityEndDate?.format('YYYY-MM-DD'),
          finalCompletionDate:
            values.finalCompletionDate?.format('YYYY-MM-DD'),
          contractValue: values.contractValue,
          variationsTotal: values.variationsTotal,
          claimsTotal: values.claimsTotal,
          finalSettlement: values.finalSettlement,
        },
      });
      messageApi.success('Closeout updated');
      void refetchCloseout();
    } catch (error) {
      notifyApiError(error, 'Failed to update closeout', messageApi);
    }
  }

  const warrantyColumns: ColumnsType<Warranty> = [
    {
      title: 'Item',
      dataIndex: 'itemDescription',
      key: 'itemDescription',
      ellipsis: true,
    },
    {
      title: 'Supplier',
      dataIndex: 'supplier',
      key: 'supplier',
      render: (v: string | null) => v ?? '-',
    },
    {
      title: 'Start',
      dataIndex: 'startDate',
      key: 'startDate',
      render: (v: string | null) => formatProjectDate(v),
    },
    {
      title: 'Expiry',
      dataIndex: 'expiryDate',
      key: 'expiryDate',
      render: (v: string | null) => {
        const expired = isOverdue(v);
        return (
          <span
            className={expired ? 'font-medium' : undefined}
            style={expired ? { color: tokens.colorRed600 } : undefined}
          >
            {formatProjectDate(v)}
          </span>
        );
      },
    },
    ...(isEditable
      ? [
          {
            title: '',
            key: 'actions',
            width: 48,
            render: (_: unknown, record: Warranty) => (
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                onClick={() =>
                  void removeWarranty
                    .mutateAsync({ projectId, warrantyId: record.id })
                    .then(() => {
                      messageApi.success('Warranty removed');
                      void refetchCloseout();
                    })
                    .catch((e: unknown) =>
                      notifyApiError(e, 'Failed to remove warranty', messageApi),
                    )
                }
              />
            ),
          },
        ]
      : []),
  ];

  if (closeoutQuery.isLoading || initializeCloseout.isPending) {
    return <PageLoadingSkeleton />;
  }

  return (
    <ProjectModuleGate projectId={projectId} module="closeout">
    <div className={layout.pageStack}>
      {projectNotFound && (
        <Alert
          type="warning"
          showIcon
          title="Project not found"
          description="This project no longer exists. Open it from the Projects list."
        />
      )}

      {apiUnavailable && (
        <Alert
          type="info"
          showIcon
          title="Closeout API is initializing. Please refresh in a moment."
        />
      )}

      {closeout && (
        <>
          <div className={`${layout.cardSurface} p-4 sm:p-5`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p
                  className="text-[13px] font-medium"
                  style={{ color: tokens.colorTextPrimary }}
                >
                  Project closeout
                </p>
                <p
                  className="mt-1 text-[12px]"
                  style={{ color: tokens.colorTextSecondary }}
                >
                  Handover checklist, warranties, and final account tracking
                </p>
              </div>
              <div className="w-full max-w-xs">
                <StatusBadge
                  label={formatCloseoutStatus(closeout.status)}
                  variant={closeoutStatusVariant(closeout.status)}
                  
                />
                
                <Select
                  className="mt-4 w-full"
                  value={closeout.status}
                  onChange={(v: CloseoutStatus) => void handleStatusChange(v)}
                  options={CLOSEOUT_WORKFLOW.map((s) => ({
                    value: s.key,
                    label: s.label,
                  }))}
                />
              </div>
            </div>
            <div className="mt-4">
              <WorkflowStepper
                steps={CLOSEOUT_WORKFLOW}
                currentStatus={closeout.status}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <KPICard
              label="Checklist complete"
              value={`${checklistProgress}%`}
              extra={`${closeout.checklistItems.filter((i) => i.isComplete).length} of ${closeout.checklistItems.length} items`}
            />
            <KPICard
              label="Warranties"
              value={String(closeout.warranties.length)}
              extra="Registered items"
            />
            <KPICard
              label="Final settlement"
              value={
                closeout.finalSettlement
                  ? Number(closeout.finalSettlement).toLocaleString()
                  : '-'
              }
              extra="Contract closeout value"
            />
          </div>

          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            destroyOnHidden
            items={[
              {
                key: 'overview',
                label: 'Overview',
                children: (
                  <FormLayout
                    title="Closeout summary"
                    description="Key dates and financial closeout figures."
                  >
                    <Form<CloseoutFormValues>
                      form={form}
                      layout="vertical"
                      className="erp-drawer-form max-w-3xl"
                      disabled={!isEditable}
                      onFinish={(values: CloseoutFormValues) =>
                        void handleSaveSummary(values)
                      }
                    >
                      <div className="grid gap-4 sm:grid-cols-3">
                        <Form.Item
                          name="practicalCompletionDate"
                          label="Practical completion"
                        >
                          <DatePicker className="w-full" />
                        </Form.Item>
                        <Form.Item
                          name="defectsLiabilityEndDate"
                          label="Defects liability end"
                        >
                          <DatePicker className="w-full" />
                        </Form.Item>
                        <Form.Item
                          name="finalCompletionDate"
                          label="Final completion"
                        >
                          <DatePicker className="w-full" />
                        </Form.Item>
                      </div>
                      <Divider className="!my-2" />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Form.Item name="contractValue" label="Contract value">
                          <InputNumber className="!w-full" min={0} />
                        </Form.Item>
                        <Form.Item name="variationsTotal" label="Variations total">
                          <InputNumber className="!w-full" min={0} />
                        </Form.Item>
                        <Form.Item name="claimsTotal" label="Claims total">
                          <InputNumber className="!w-full" min={0} />
                        </Form.Item>
                        <Form.Item name="finalSettlement" label="Final settlement">
                          <InputNumber className="!w-full" min={0} />
                        </Form.Item>
                      </div>
                      {isEditable && (
                        <div className="flex justify-end">
                          <Button
                            type="primary"
                            htmlType="submit"
                            loading={updateCloseout.isPending}
                          >
                            Save summary
                          </Button>
                        </div>
                      )}
                    </Form>
                  </FormLayout>
                ),
              },
              {
                key: 'checklist',
                label: (
                  <span className="inline-flex items-center gap-2">
                    Checklist
                    <Badge
                      count={`${checklistProgress}%`}
                      size="small"
                      color="#F47B20"
                    />
                  </span>
                ),
                children: (
                  <FormLayout
                    title="Handover checklist"
                    description="Track documentation, financial, site, and handover requirements."
                  >
                    <Progress
                      percent={checklistProgress}
                      strokeColor="#F47B20"
                      className="!mb-6"
                    />
                    <div className="space-y-6">
                      {checklistByCategory.map(([category, items]) => (
                        <div key={category}>
                          <h3
                            className="mb-3 text-[13px] font-medium uppercase tracking-wide"
                            style={{ color: tokens.colorTextSecondary }}
                          >
                            {category}
                          </h3>
                          <div className="space-y-2">
                            {items.map((item) => (
                              <label
                                key={item.id}
                                className={`flex items-start gap-3 p-3 ${layout.cardSurface}`}
                              >
                                <Checkbox
                                  checked={item.isComplete}
                                  disabled={!isEditable}
                                  onChange={(event: CheckboxChangeEvent) => {
                                    void updateChecklist
                                      .mutateAsync({
                                        projectId,
                                        itemId: item.id,
                                        body: {
                                          isComplete: event.target.checked,
                                        },
                                      })
                                      .then(() => void refetchCloseout());
                                  }}
                                />
                                <span
                                  className="min-w-0 flex-1 text-[12px]"
                                  style={{ color: tokens.colorTextPrimary }}
                                >
                                  {item.description}
                                  {item.isComplete && item.verifiedBy && (
                                    <span
                                      className="mt-1 block text-[12px]"
                                      style={{ color: tokens.colorTextSecondary }}
                                    >
                                      Verified by{' '}
                                      {resolveUserName(item.verifiedBy)}
                                      {item.completedAt
                                        ? ` · ${formatProjectDate(item.completedAt)}`
                                        : ''}
                                    </span>
                                  )}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </FormLayout>
                ),
              },
              {
                key: 'warranties',
                label: (
                  <span className="inline-flex items-center gap-2">
                    Warranties
                    {closeout.warranties.length > 0 && (
                      <Badge
                        count={closeout.warranties.length}
                        size="small"
                        color="#F47B20"
                      />
                    )}
                  </span>
                ),
                children: (
                  <FormLayout
                    title="Warranties & guarantees"
                    description="Equipment, systems, and subcontractor warranty records."
                  >
                    <DataTable
                      size="small"
                      rowKey="id"
                      pagination={false}
                      dataSource={closeout.warranties}
                      columns={warrantyColumns}
                      locale={{ emptyText: 'No warranties registered' }}
                    />
                    {isEditable && (
                      <AddCollapse label="Add warranty">
                        <Form<WarrantyFormValues>
                          form={warrantyForm}
                          layout="vertical"
                          className="erp-drawer-form"
                          onFinish={(values: WarrantyFormValues) =>
                            void addWarranty
                              .mutateAsync({
                                projectId,
                                body: {
                                  itemDescription: values.itemDescription.trim(),
                                  supplier: values.supplier?.trim() || undefined,
                                  startDate:
                                    values.startDate?.format('YYYY-MM-DD'),
                                  expiryDate:
                                    values.expiryDate?.format('YYYY-MM-DD'),
                                },
                              })
                              .then(() => {
                                messageApi.success('Warranty added');
                                warrantyForm.resetFields();
                                void refetchCloseout();
                              })
                              .catch((e: unknown) =>
                                notifyApiError(e, 'Failed to add warranty', messageApi),
                              )
                          }
                        >
                          <Form.Item
                            name="itemDescription"
                            label="Item / system"
                            rules={[{ required: true }]}
                          >
                            <Input placeholder="e.g. HVAC package unit" />
                          </Form.Item>
                          <Form.Item name="supplier" label="Supplier">
                            <Input />
                          </Form.Item>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Form.Item name="startDate" label="Start date">
                              <DatePicker className="w-full" />
                            </Form.Item>
                            <Form.Item name="expiryDate" label="Expiry date">
                              <DatePicker className="w-full" />
                            </Form.Item>
                          </div>
                          <Button
                            type="primary"
                            htmlType="submit"
                            icon={<PlusOutlined />}
                            loading={addWarranty.isPending}
                          >
                            Add warranty
                          </Button>
                        </Form>
                      </AddCollapse>
                    )}
                  </FormLayout>
                ),
              },
            ]}
          />
        </>
      )}
    </div>
    </ProjectModuleGate>
  );
}
