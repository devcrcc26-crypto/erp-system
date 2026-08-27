'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Form, Input, Radio, Skeleton } from 'antd';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  AssetStatus,
  CompanyAssetAssignmentListItem,
} from '@/lib/api/company-asset.types';
import {
  useCompanyAsset,
  useCompanyAssetAssignments,
  useIssueCompanyAssetAssignment,
  useReturnCompanyAssetAssignment,
  useDeleteCompanyAsset,
  useUpdateCompanyAssetStatus,
} from '@/lib/query/company-asset';
import {
  ASSET_MANUAL_STATUS_OPTIONS,
  assetStatusVariant,
  canChangeAssetStatusManually,
  formatAssetStatus,
} from '@/lib/utils/company-asset-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { tokens } from '@/lib/theme/tokens';

interface IssueAssetFormValues {
  employeeId?: string;
  notes?: string;
}

interface ReturnAssetFormValues {
  returnedTo?: string;
  returnedNotes?: string;
}

export default function CompanyAssetDetailPageContent({
  assetId,
}: {
  assetId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const detailQuery = useCompanyAsset(assetId);
  const statusMutation = useUpdateCompanyAssetStatus(assetId);
  const deleteMutation = useDeleteCompanyAsset();

  const assignmentsQuery = useCompanyAssetAssignments(assetId, {
    page: 1,
    limit: 20,
    includeReturned: true,
  });

  const issueMutation = useIssueCompanyAssetAssignment(assetId);
  const activeAssignmentId =
    assignmentsQuery.data?.data?.find((assignment) => !assignment.returnedAt)
      ?.id ?? '';
  const returnMutation = useReturnCompanyAssetAssignment(
    assetId,
    activeAssignmentId,
  );

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<AssetStatus | undefined>();

  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [issueForm] = Form.useForm<IssueAssetFormValues>();
  const issueEmployeeId = Form.useWatch('employeeId', issueForm);

  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnForm] = Form.useForm<ReturnAssetFormValues>();

  const asset = detailQuery.data;
  const assignmentHistory = assignmentsQuery.data?.data ?? [];
  const activeAssignment = assignmentHistory.find(
    (assignment) => !assignment.returnedAt,
  );
  const pastAssignments = assignmentHistory.filter((assignment) =>
    Boolean(assignment.returnedAt),
  );
  const canChangeStatus = asset
    ? canChangeAssetStatusManually(asset.status)
    : false;
  const manualStatusOptions = useMemo(
    () =>
      ASSET_MANUAL_STATUS_OPTIONS.map((option) => ({
        value: option.value,
        label: formatAssetStatus(option.value, t),
      })),
    [t],
  );

  function formatUserName(user?: {
    firstName: string;
    lastName: string;
  } | null): string {
    if (!user) {
      return '—';
    }

    return `${user.firstName} ${user.lastName}`;
  }

  function renderAssignmentFields(
    assignment: CompanyAssetAssignmentListItem,
    options?: { includeReturnFields?: boolean },
  ): React.ReactNode {
    const includeReturnFields =
      options?.includeReturnFields ?? Boolean(assignment.returnedAt);

    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetaItem label={t('hr.assetLabels.assignedTo')}>
          <div>
            <p className="m-0 font-medium">{formatUserName(assignment.employee)}</p>
            {assignment.employee.email ? (
              <p
                className="m-0 mt-0.5 text-xs"
                style={{ color: tokens.colorTextTertiary }}
              >
                {assignment.employee.email}
              </p>
            ) : null}
          </div>
        </MetaItem>
        <MetaItem label={t('hr.assetLabels.assignedAt')}>
          {formatProjectDate(assignment.assignedAt)}
        </MetaItem>
        <MetaItem label={t('hr.assetLabels.issuedBy')}>
          {formatUserName(assignment.issuedBy)}
        </MetaItem>
        {assignment.notes ? (
          <MetaItem label={t('hr.assetLabels.notes')}>
            <p className="m-0 whitespace-pre-wrap leading-relaxed">
              {assignment.notes}
            </p>
          </MetaItem>
        ) : null}
        {includeReturnFields ? (
          <>
            <MetaItem label={t('hr.assetLabels.returnedAt')}>
              {formatProjectDate(assignment.returnedAt ?? null)}
            </MetaItem>
            <MetaItem label={t('hr.assetLabels.returnedBy')}>
              {formatUserName(assignment.returnedBy)}
            </MetaItem>
            <MetaItem label={t('hr.assetLabels.returnedTo')}>
              {assignment.returnedTo?.trim() || '—'}
            </MetaItem>
            {assignment.returnedNotes ? (
              <MetaItem label={t('hr.assetLabels.returnedNotes')}>
                <p className="m-0 whitespace-pre-wrap leading-relaxed">
                  {assignment.returnedNotes}
                </p>
              </MetaItem>
            ) : null}
          </>
        ) : null}
      </div>
    );
  }

  function closeIssueModal(): void {
    issueForm.resetFields();
    setIssueModalOpen(false);
  }

  async function handleIssueSubmit(): Promise<void> {
    let values: IssueAssetFormValues;
    try {
      values = await issueForm.validateFields();
    } catch {
      return;
    }

    if (!values.employeeId) {
      return;
    }

    try {
      await issueMutation.mutateAsync({
        employeeId: values.employeeId,
        notes: values.notes?.trim() || undefined,
      });
      messageApi.success(t('hr.assetMessages.assignmentIssued'));
      await assignmentsQuery.refetch();
      await detailQuery.refetch();
      closeIssueModal();
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.assetMessages.failedToIssueAssignment'),
        messageApi,
      );
    }
  }

  function closeReturnModal(): void {
    returnForm.resetFields();
    setReturnModalOpen(false);
  }

  async function handleReturnSubmit(): Promise<void> {
    if (!activeAssignment) return;

    let values: ReturnAssetFormValues;
    try {
      values = await returnForm.validateFields();
    } catch {
      return;
    }

    try {
      await returnMutation.mutateAsync({
        returnedTo: values.returnedTo?.trim() || undefined,
        returnedNotes: values.returnedNotes?.trim() || undefined,
      });
      messageApi.success(t('hr.assetMessages.assignmentReturned'));
      await assignmentsQuery.refetch();
      await detailQuery.refetch();
      closeReturnModal();
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.assetMessages.failedToReturnAssignment'),
        messageApi,
      );
    }
  }

  async function handleStatusChange(): Promise<void> {
    if (!pendingStatus || pendingStatus === 'IN_USE') {
      return;
    }
    if (pendingStatus === asset?.status) {
      setStatusModalOpen(false);
      return;
    }
    try {
      await statusMutation.mutateAsync({ status: pendingStatus });
      messageApi.success(t('hr.assetMessages.statusUpdated'));
      setStatusModalOpen(false);
      setPendingStatus(undefined);
      await detailQuery.refetch();
    } catch (error: unknown) {
      notifyApiError(error, t('hr.assetMessages.failedToUpdateStatus'), messageApi);
    }
  }

  async function handleDelete(): Promise<void> {
    try {
      await deleteMutation.mutateAsync(assetId);
      messageApi.success(t('hr.assetMessages.deleted'));
      router.push('/hr/company-asset');
    } catch (error: unknown) {
      notifyApiError(error, t('hr.assetMessages.failedToDelete'), messageApi);
    }
  }

  if (detailQuery.isLoading) {
    return (
      <div className="erp-pro-list-page flex flex-col gap-3">
        <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !asset) {
    return (
      <div className="erp-pro-list-page flex flex-col gap-3">
        <Alert
          type="error"
          showIcon
          title={
            detailQuery.error instanceof ApiRequestError
              ? detailQuery.error.message
              : t('hr.assetMessages.notFound')
          }
          action={
            <Button
              onClick={() => router.push('/hr/company-asset')}
              style={{ borderRadius: 0 }}
            >
              {t('hr.assetButtons.back')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={() => router.push('/hr/company-asset')}
          style={{ borderRadius: 0 }}
        >
          {t('hr.assetButtons.back')}
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canChangeStatus ? (
            <Button
              onClick={() => {
                setPendingStatus(asset.status);
                setStatusModalOpen(true);
              }}
              style={{ borderRadius: 0 }}
            >
              {t('hr.assetButtons.changeStatus')}
            </Button>
          ) : null}
          <Button
            onClick={() => router.push(`/hr/company-asset/${assetId}/edit`)}
            style={{ borderRadius: 0 }}
          >
            {t('hr.assetButtons.editAsset')}
          </Button>
          <Button
            danger
            onClick={() => setConfirmDelete(true)}
            style={{ borderRadius: 0 }}
          >
            {t('hr.assetButtons.deleteAsset')}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div
          className="overflow-hidden rounded-none"
          style={{
            background: tokens.colorCardBg,
            border: `1px solid ${tokens.colorBorder}`,
          }}
        >
          <div className="px-3 py-4 sm:px-5">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: tokens.colorTextTertiary }}
              >
                {asset.serialNumber}
              </span>
              <span style={{ color: tokens.colorBorder }}>·</span>
              <StatusBadge
                label={formatAssetStatus(asset.status, t)}
                variant={assetStatusVariant(asset.status)}
              />
            </div>
            <h2
              className="m-0 text-lg font-semibold leading-snug"
              style={{ color: tokens.colorTextPrimary }}
            >
              {asset.brand} {asset.model}
            </h2>
            <p
              className="m-0 mt-1 text-sm"
              style={{ color: tokens.colorTextSecondary }}
            >
              {asset.type} · {asset.year} · {asset.color}
              {activeAssignment
                ? ` · ${t('hr.assetLabels.assignedTo')}: ${formatUserName(activeAssignment.employee)}`
                : null}
            </p>
          </div>
        </div>

        <SummaryStrip
          items={[
            { label: t('hr.assetLabels.brand'), value: asset.brand },
            { label: t('hr.assetLabels.model'), value: asset.model },
            { label: t('hr.assetLabels.year'), value: String(asset.year) },
            {
              label: t('hr.assetLabels.assignedTo'),
              value: activeAssignment
                ? formatUserName(activeAssignment.employee)
                : '—',
            },
          ]}
        />

        <SectionCard
          title={t('hr.assetSection.currentAssignment')}
          bodyClassName="px-3 py-4 sm:px-5"
          action={
            activeAssignment ? (
              <Button
                type="primary"
                onClick={() => setReturnModalOpen(true)}
                style={{ borderRadius: 0 }}
              >
                {t('hr.assetButtons.returnAsset')}
              </Button>
            ) : asset.status === 'AVAILABLE' ? (
              <Button
                type="primary"
                onClick={() => setIssueModalOpen(true)}
                style={{ borderRadius: 0 }}
              >
                {t('hr.assetButtons.issueAsset')}
              </Button>
            ) : undefined
          }
        >
          {activeAssignment ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  label={t('hr.assetStatus.IN_USE')}
                  variant={assetStatusVariant('IN_USE')}
                />
              </div>
              {renderAssignmentFields(activeAssignment, {
                includeReturnFields: false,
              })}
            </div>
          ) : (
            <Alert
              type="info"
              showIcon
              title={t('hr.assetMessages.noActiveAssignment')}
              description={
                asset.status === 'AVAILABLE'
                  ? t('hr.assetMessages.issueWhenAvailable')
                  : t('hr.assetMessages.cannotIssueWhileUnavailable')
              }
            />
          )}
        </SectionCard>

        <SectionCard
          title={t('hr.assetSection.assetDetails')}
          bodyClassName="px-3 py-4 sm:px-5"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <MetaItem label={t('hr.assetLabels.serialNumber')}>
              {asset.serialNumber}
            </MetaItem>
            <MetaItem label={t('hr.assetLabels.status')}>
              <StatusBadge
                label={formatAssetStatus(asset.status, t)}
                variant={assetStatusVariant(asset.status)}
              />
            </MetaItem>
            <MetaItem label={t('hr.assetLabels.type')}>
              {asset.type}
            </MetaItem>
            <MetaItem label={t('hr.assetLabels.brand')}>
              {asset.brand}
            </MetaItem>
            <MetaItem label={t('hr.assetLabels.model')}>
              {asset.model}
            </MetaItem>
            <MetaItem label={t('hr.assetLabels.year')}>
              {asset.year}
            </MetaItem>
            <MetaItem label={t('hr.assetLabels.color')}>
              {asset.color}
            </MetaItem>
            <MetaItem label={t('hr.assetLabels.createdAt')}>
              {formatProjectDate(asset.createdAt)}
            </MetaItem>
            <MetaItem label={t('hr.assetLabels.updatedAt')}>
              {formatProjectDate(asset.updatedAt)}
            </MetaItem>
            {asset.description ? (
              <MetaItem label={t('hr.assetLabels.description')}>
                <p className="m-0 whitespace-pre-wrap leading-relaxed">
                  {asset.description}
                </p>
              </MetaItem>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard
          title={t('hr.assetSection.assignmentHistory')}
          bodyClassName="px-3 py-4 sm:px-5"
        >
          {pastAssignments.length > 0 ? (
            <div className="flex flex-col gap-3">
              {pastAssignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="rounded-none border px-3 py-4 sm:px-4"
                  style={{ borderColor: tokens.colorBorder }}
                >
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span
                      className="text-sm font-semibold"
                      style={{ color: tokens.colorTextPrimary }}
                    >
                      {formatUserName(assignment.employee)}
                    </span>
                    <StatusBadge
                      label={t('hr.assetStatus.AVAILABLE')}
                      variant={assetStatusVariant('AVAILABLE')}
                    />
                  </div>
                  {renderAssignmentFields(assignment, {
                    includeReturnFields: true,
                  })}
                </div>
              ))}
            </div>
          ) : (
            <p
              className="m-0 text-sm"
              style={{ color: tokens.colorTextSecondary }}
            >
              {t('hr.assetEmpty.noAssignmentHistory')}
            </p>
          )}
        </SectionCard>
      </div>

      <ConfirmDialog
        open={statusModalOpen}
        title={t('hr.assetDialog.statusTitle')}
        description={
          asset
            ? `${t('hr.assetDialog.statusDesc')} (${asset.serialNumber} · ${asset.brand} ${asset.model})`
            : t('hr.assetDialog.statusDesc')
        }
        confirmLabel={t('hr.assetButtons.save')}
        cancelLabel={t('hr.assetButtons.cancel')}
        confirmLoading={statusMutation.isPending}
        confirmDisabled={
          !pendingStatus ||
          pendingStatus === 'IN_USE' ||
          pendingStatus === asset.status
        }
        onConfirm={() => void handleStatusChange()}
        onCancel={() => {
          setStatusModalOpen(false);
          setPendingStatus(undefined);
        }}
      >
        <div className="mt-3 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: tokens.colorTextTertiary }}
            >
              {t('hr.assetLabels.status')}
            </span>
            <StatusBadge
              label={formatAssetStatus(asset.status, t)}
              variant={assetStatusVariant(asset.status)}
            />
          </div>

          <Form layout="vertical" requiredMark={false}>
            <Form.Item
              label={t('hr.assetDialog.statusSelectLabel')}
              className="mb-0"
            >
              <Radio.Group
                value={pendingStatus}
                onChange={(event) =>
                  setPendingStatus(event.target.value as AssetStatus)
                }
                disabled={statusMutation.isPending}
                className="flex w-full flex-col gap-2"
              >
                {manualStatusOptions.map((option) => (
                  <Radio
                    key={option.value}
                    value={option.value}
                    className="m-0 rounded-none border px-3 py-2.5"
                    style={{
                      borderColor:
                        pendingStatus === option.value
                          ? tokens.colorPrimary
                          : tokens.colorBorder,
                      background:
                        pendingStatus === option.value
                          ? tokens.colorPrimaryLight
                          : tokens.colorCardBg,
                    }}
                  >
                    <span className="inline-flex items-center gap-2">
                      <StatusBadge
                        label={option.label}
                        variant={assetStatusVariant(option.value)}
                      />
                    </span>
                  </Radio>
                ))}
              </Radio.Group>
            </Form.Item>
          </Form>

          <Alert
            type="info"
            showIcon
            title={t('hr.assetDialog.statusInUseHint')}
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDelete}
        title={t('hr.assetDialog.deleteTitle')}
        description={t('hr.assetDialog.deleteDesc')}
        confirmLabel={t('hr.assetButtons.deleteAsset')}
        danger
        confirmLoading={deleteMutation.isPending}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDelete(false)}
      />

      <ConfirmDialog
        open={issueModalOpen}
        title={t('hr.assetDialog.issueTitle')}
        description={
          asset
            ? `${t('hr.assetDialog.issueDesc')} (${asset.serialNumber} · ${asset.brand} ${asset.model})`
            : t('hr.assetDialog.issueDesc')
        }
        confirmLabel={t('hr.assetButtons.issueAsset')}
        cancelLabel={t('hr.assetButtons.cancel')}
        confirmLoading={issueMutation.isPending}
        confirmDisabled={!issueEmployeeId}
        onConfirm={() => void handleIssueSubmit()}
        onCancel={closeIssueModal}
      >
        <Form
          form={issueForm}
          layout="vertical"
          requiredMark={false}
          className="mt-3"
          disabled={issueMutation.isPending}
        >
          <Form.Item
            name="employeeId"
            label={t('hr.assetLabels.employee')}
            rules={[
              {
                required: true,
                message: t('hr.assetValidation.employeeRequired'),
              },
            ]}
          >
            <UserSelect
              allowClear={false}
              placeholder={t('hr.assetPlaceholder.selectEmployee')}
              className="w-full"
            />
          </Form.Item>
          <Form.Item name="notes" label={t('hr.assetLabels.notes')}>
            <Input.TextArea
              rows={3}
              maxLength={2000}
              showCount
              placeholder={t('hr.assetPlaceholder.issueNotes')}
              style={{ borderRadius: 0 }}
            />
          </Form.Item>
        </Form>
      </ConfirmDialog>

      <ConfirmDialog
        open={returnModalOpen}
        title={t('hr.assetDialog.returnTitle')}
        description={
          asset
            ? `${t('hr.assetDialog.returnDesc')} (${asset.serialNumber} · ${asset.brand} ${asset.model})`
            : t('hr.assetDialog.returnDesc')
        }
        confirmLabel={t('hr.assetButtons.returnAsset')}
        cancelLabel={t('hr.assetButtons.cancel')}
        confirmLoading={returnMutation.isPending}
        confirmDisabled={!activeAssignment}
        onConfirm={() => void handleReturnSubmit()}
        onCancel={closeReturnModal}
      >
        <div className="mt-3 flex flex-col gap-4">
          {activeAssignment ? (
            <div
              className="rounded-none border px-3 py-3"
              style={{
                borderColor: tokens.colorBorder,
                background: tokens.colorSurfaceSecondary,
              }}
            >
              <p
                className="mb-1 text-xs font-medium uppercase tracking-wide"
                style={{ color: tokens.colorTextTertiary }}
              >
                {t('hr.assetLabels.assignedTo')}
              </p>
              <p
                className="m-0 text-sm font-semibold"
                style={{ color: tokens.colorTextPrimary }}
              >
                {formatUserName(activeAssignment.employee)}
              </p>
              {activeAssignment.employee.email ? (
                <p
                  className="m-0 mt-0.5 text-xs"
                  style={{ color: tokens.colorTextTertiary }}
                >
                  {activeAssignment.employee.email}
                </p>
              ) : null}
              <p
                className="m-0 mt-2 text-xs"
                style={{ color: tokens.colorTextSecondary }}
              >
                {t('hr.assetLabels.assignedAt')}:{' '}
                {formatProjectDate(activeAssignment.assignedAt)}
              </p>
            </div>
          ) : null}

          <Form
            form={returnForm}
            layout="vertical"
            requiredMark={false}
            disabled={returnMutation.isPending}
          >
            <Form.Item
              name="returnedTo"
              label={t('hr.assetLabels.returnedTo')}
            >
              <Input
                maxLength={200}
                placeholder={t('hr.assetPlaceholder.returnedTo')}
                style={{ borderRadius: 0 }}
              />
            </Form.Item>
            <Form.Item
              name="returnedNotes"
              label={t('hr.assetLabels.returnedNotes')}
              className="mb-0"
            >
              <Input.TextArea
                rows={3}
                maxLength={2000}
                showCount
                placeholder={t('hr.assetPlaceholder.returnNotes')}
                style={{ borderRadius: 0 }}
              />
            </Form.Item>
          </Form>
        </div>
      </ConfirmDialog>
    </div>
  );
}
