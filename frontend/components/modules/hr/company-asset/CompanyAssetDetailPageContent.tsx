'use client';

import { useState } from 'react';
import { Alert, Button, Form, Input, Select, Skeleton } from 'antd';
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
  ASSET_STATUS_OPTIONS,
  assetStatusVariant,
  formatAssetStatus,
} from '@/lib/utils/company-asset-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { tokens } from '@/lib/theme/tokens';

interface IssueAssetFormValues {
  employeeId?: string;
  notes?: string;
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
  const returnMutation = useReturnCompanyAssetAssignment(
    assetId,
    assignmentsQuery.data?.data?.[0]?.id ?? '',
  );

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<AssetStatus | undefined>();

  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [issueForm] = Form.useForm<IssueAssetFormValues>();
  const issueEmployeeId = Form.useWatch('employeeId', issueForm);

  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnTo, setReturnTo] = useState<string>('');
  const [returnNotes, setReturnNotes] = useState<string>('');

  const asset = detailQuery.data;
  const assignmentHistory = assignmentsQuery.data?.data ?? [];
  const mostRecentAssignment = assignmentHistory[0];
  const activeAssignment = mostRecentAssignment?.returnedAt
    ? undefined
    : mostRecentAssignment;
  const returnedAssignment = mostRecentAssignment?.returnedAt
    ? mostRecentAssignment
    : undefined;

  function formatUserName(user?: {
    firstName: string;
    lastName: string;
  } | null): string {
    if (!user) {
      return '-';
    }

    return `${user.firstName} ${user.lastName}`;
  }

  function renderAssignmentMeta(
    assignment: CompanyAssetAssignmentListItem,
  ): React.ReactNode {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <p className="text-sm m-0 text-slate-600">
          {t('hr.assetLabels.assignedAt')}: {formatProjectDate(assignment.assignedAt)}
        </p>
        <p className="text-sm m-0 text-slate-600">
          {t('hr.assetLabels.issuedBy')}: {formatUserName(assignment.issuedBy)}
        </p>
        {assignment.notes ? (
          <p className="text-sm m-0 whitespace-pre-wrap sm:col-span-2">
            {t('hr.assetLabels.notes')}: {assignment.notes}
          </p>
        ) : null}
        {assignment.returnedAt ? (
          <>
            <p className="text-sm m-0 text-slate-600">
              {t('hr.assetLabels.returnedAt')}: {formatProjectDate(assignment.returnedAt)}
            </p>
            <p className="text-sm m-0 text-slate-600">
              {t('hr.assetLabels.returnedBy')}: {formatUserName(assignment.returnedBy)}
            </p>
            <p className="text-sm m-0 text-slate-600">
              {t('hr.assetLabels.returnedTo')}: {assignment.returnedTo ?? '-'}
            </p>
            {assignment.returnedNotes ? (
              <p className="text-sm m-0 whitespace-pre-wrap sm:col-span-2">
                {t('hr.assetLabels.returnedNotes')}: {assignment.returnedNotes}
              </p>
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

  async function handleReturnSubmit(): Promise<void> {
    if (!activeAssignment) return;
    try {
      await returnMutation.mutateAsync({
        returnedTo: returnTo.trim() || undefined,
        returnedNotes: returnNotes.trim() || undefined,
      });
      messageApi.success(t('hr.assetMessages.assignmentReturned'));
      // Make UI update immediately (don't rely only on query invalidation).
      await assignmentsQuery.refetch();
      await detailQuery.refetch();
      setReturnModalOpen(false);
      setReturnTo('');
      setReturnNotes('');
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.assetMessages.failedToReturnAssignment'),
        messageApi,
      );
    }
  }

  async function handleStatusChange(): Promise<void> {
    if (!pendingStatus) return;
    try {
      await statusMutation.mutateAsync({ status: pendingStatus });
      messageApi.success(t('hr.assetMessages.statusUpdated'));
      setStatusModalOpen(false);
      setPendingStatus(undefined);
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
          <Button
            onClick={() => {
              setPendingStatus(asset.status);
              setStatusModalOpen(true);
            }}
            style={{ borderRadius: 0 }}
          >
            {t('hr.assetButtons.changeStatus')}
          </Button>
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
          title={t('hr.assetSection.assetDetails')}
          bodyClassName="px-3 py-4 sm:px-5"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <MetaItem label={t('hr.assetLabels.serialNumber')}>
              {asset.serialNumber}
            </MetaItem>
            <MetaItem label={t('hr.assetLabels.status')}>
              <StatusBadge
                label={formatAssetStatus(asset.status, t)}
                variant={assetStatusVariant(asset.status)}
              />
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
            <MetaItem label={t('hr.assetLabels.type')}>
              {asset.type}
            </MetaItem>
            <MetaItem label={t('hr.assetLabels.createdAt')}>
              {formatProjectDate(asset.createdAt)}
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
      </div>

      <SectionCard
        title={t('hr.assetSection.assetAssignments')}
        bodyClassName="px-3 py-4 sm:px-5"
      >
        {activeAssignment ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                {activeAssignment.employee.firstName}{' '}
                {activeAssignment.employee.lastName}
              </span>
              <StatusBadge
                label={t('hr.assetStatus.IN_USE')}
                variant={assetStatusVariant('IN_USE')}
              />
            </div>
            {renderAssignmentMeta(activeAssignment)}

            <div className="flex justify-end">
              <Button onClick={() => setReturnModalOpen(true)} type="primary">
                {t('hr.assetButtons.returnAsset')}
              </Button>
            </div>
          </div>
        ) : returnedAssignment ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                {returnedAssignment.employee.firstName}{' '}
                {returnedAssignment.employee.lastName}
              </span>
              <StatusBadge
                label={t('hr.assetStatus.AVAILABLE')}
                variant={assetStatusVariant('AVAILABLE')}
              />
            </div>
            {renderAssignmentMeta(returnedAssignment)}
            <div className="flex justify-end">
              {asset.status === 'AVAILABLE' ? (
                <Button type="primary" onClick={() => setIssueModalOpen(true)}>
                  {t('hr.assetButtons.issueAsset')}
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <Alert
            type="info"
            showIcon
            title={t('hr.assetMessages.noActiveAssignment')}
            action={
              asset.status === 'AVAILABLE' ? (
                <Button type="primary" onClick={() => setIssueModalOpen(true)}>
                  {t('hr.assetButtons.issueAsset')}
                </Button>
              ) : undefined
            }
          />
        )}

        {assignmentHistory.length > 0 ? (
          <div className="mt-5 border-t border-slate-200 pt-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">
              {t('hr.assetSection.assignmentHistory')}
            </h3>
            <div className="flex flex-col gap-3">
              {assignmentHistory.map((assignment) => {
                const isReturned = Boolean(assignment.returnedAt);
                return (
                  <div
                    key={assignment.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {assignment.employee.firstName} {assignment.employee.lastName}
                      </span>
                      <StatusBadge
                        label={t(
                          isReturned
                            ? 'hr.assetStatus.AVAILABLE'
                            : 'hr.assetStatus.IN_USE',
                        )}
                        variant={assetStatusVariant(
                          isReturned ? 'AVAILABLE' : 'IN_USE',
                        )}
                      />
                    </div>
                    {renderAssignmentMeta(assignment)}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </SectionCard>

      <ConfirmDialog
        open={statusModalOpen}
        title={t('hr.assetDialog.statusTitle')}
        description=""
        confirmLabel={t('hr.assetButtons.save')}
        confirmLoading={statusMutation.isPending}
        onConfirm={() => void handleStatusChange()}
        onCancel={() => {
          setStatusModalOpen(false);
          setPendingStatus(undefined);
        }}
      >
        <Select
          style={{ width: '100%', marginTop: 8 }}
          value={pendingStatus}
          onChange={setPendingStatus}
          options={ASSET_STATUS_OPTIONS}
        />
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
        description={t('hr.assetDialog.returnDesc')}
        confirmLabel={t('hr.assetButtons.returnAsset')}
        confirmLoading={returnMutation.isPending}
        onConfirm={() => void handleReturnSubmit()}
        onCancel={() => setReturnModalOpen(false)}
      >
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium">{t('hr.assetLabels.returnedTo')}</label>
          <Input
            maxLength={2000}
            value={returnTo}
            onChange={(e) => setReturnTo(e.target.value)}
            placeholder={t('hr.assetPlaceholder.returnedTo')}
          />
          <label className="text-sm font-medium">{t('hr.assetLabels.returnedNotes')}</label>
          <Input.TextArea
            rows={3}
            maxLength={2000}
            showCount
            value={returnNotes}
            onChange={(e) => setReturnNotes(e.target.value)}
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}
