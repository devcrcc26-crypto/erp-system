'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Form,
  Grid,
  Input,
  Skeleton,
  Space,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { MetaItem } from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import ContractEvaluationHistory from '@/components/modules/hr/evaluation/ContractEvaluationHistory';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import {
  useDeleteEmployeeContract,
  useEmployeeContract,
  useTerminateEmployeeContract,
} from '@/lib/query/employee-contract';
import {
  employeeContractStatusVariant,
  formatEmployeeContractEmployeeName,
  formatEmployeeContractStatus,
  formatEmployeeContractType,
} from '@/lib/utils/employee-contract-display';
import { formatCurrencyAmount } from '@/lib/utils/expense-claim-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';
interface TerminateFormValues {
  terminatedAt?: dayjs.Dayjs;
  terminationReason: string;
}

function DetailSection({
  title,
  children,
  className = '',
  bodyClassName = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}): React.ReactNode {
  return (
    <div className={`erp-employee-section ${className}`.trim()}>
      <div className="erp-employee-section-header">
        <h3 className="erp-employee-section-title">{title}</h3>
      </div>
      <div className={`erp-employee-section-body ${bodyClassName}`.trim()}>
        {children}
      </div>
    </div>
  );
}

function formatMoney(
  value: string | number | null | undefined,
  currency: string,
): string {
  return formatCurrencyAmount(value, currency);
}

/**
 * Employee contract detail - Users / employee profile chrome.
 */
export default function EmployeeContractDetailPageContent({
  contractId,
}: {
  contractId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const canViewHr = useCanViewHr();
  const detailQuery = useEmployeeContract(contractId);
  const terminateMutation = useTerminateEmployeeContract(contractId);
  const deleteMutation = useDeleteEmployeeContract(contractId);
  const [terminateForm] = Form.useForm<TerminateFormValues>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [terminateOpen, setTerminateOpen] = useState(false);

  const contract = detailQuery.data;
  const canEdit =
    canViewHr &&
    (contract?.status === 'ACTIVE' || contract?.status === 'DRAFT');
  const canTerminate = canViewHr && contract?.status === 'ACTIVE';
  const canEditTermination =
    canViewHr && contract?.status === 'TERMINATED' && Boolean(contract.terminatedAt);
  const ETB = 'ETB';

  function openTerminateDialog(): void {
    terminateForm.setFieldsValue({
      terminatedAt: undefined,
      terminationReason: '',
    });
    setTerminateOpen(true);
  }

  function openEditTerminationDialog(): void {
    if (!contract) {
      return;
    }
    terminateForm.setFieldsValue({
      terminatedAt: contract.terminatedAt
        ? dayjs(contract.terminatedAt)
        : undefined,
      terminationReason: contract.terminationReason ?? '',
    });
    setTerminateOpen(true);
  }

  async function handleTerminate(): Promise<void> {
    const values = await terminateForm.validateFields();
    const amending = contract?.status === 'TERMINATED';
    try {
      await terminateMutation.mutateAsync({
        terminationReason: values.terminationReason.trim(),
        terminatedAt: values.terminatedAt?.format('YYYY-MM-DD'),
      });
      messageApi.success(
        amending
          ? t('hr.messages.employeeContractTerminationUpdated')
          : t('hr.messages.employeeContractTerminated'),
      );
      setTerminateOpen(false);
      terminateForm.resetFields();
    } catch (error: unknown) {
      notifyApiError(
        error,
        amending
          ? t('hr.messages.failedToUpdateContractTermination')
          : t('hr.messages.failedToTerminateEmployeeContract'),
        messageApi,
      );
      throw error;
    }
  }

  async function handleDelete(): Promise<void> {
    try {
      await deleteMutation.mutateAsync();
      messageApi.success(t('hr.messages.employeeContractDeleted'));
      router.push('/hr/employee-contract');
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToDeleteEmployeeContract'),
        messageApi,
      );
      throw error;
    }
  }

  if (detailQuery.isLoading) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-employee-detail-page erp-contract-detail-page ${DETAIL_PAGE_V2}`}>
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !contract) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-employee-detail-page ${DETAIL_PAGE_V2}`}>
        <Alert
          type="error"
          showIcon
          title={
            detailQuery.error instanceof ApiRequestError
              ? detailQuery.error.message
              : t('hr.messages.employeeContractNotFound')
          }
          action={
            <Button onClick={() => router.push('/hr/employee-contract')}>
              {t('hr.buttons.backToList')}
            </Button>
          }
        />
      </div>
    );
  }

  const employeeName = formatEmployeeContractEmployeeName(contract.employee);
  const hasCompensation =
    contract.basicSalary != null ||
    contract.transportationAllowance != null ||
    contract.monthlyBonus != null ||
    (contract.monthlyNetBonus != null &&
      Number(contract.monthlyNetBonus) !== 0) ||
    contract.pensionApplicable != null ||
    contract.taxApplicable != null;

  return (
    <div className={`erp-pro-list-page erp-users-page erp-employee-detail-page erp-contract-detail-page ${DETAIL_PAGE_V2}`}>
      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-employee-toolbar">
          <div className="erp-employee-toolbar-back flex min-w-0 items-center gap-2">
            <Button
              type="text"
              icon={<ArrowLeft size={16} />}
              onClick={() => router.push('/hr/employee-contract')}
              aria-label={t('hr.buttons.backToList')}
            >
              {isNarrow ? undefined : t('hr.buttons.back')}
            </Button>
          </div>
          {canEdit || canTerminate || canEditTermination ? (
            <div className="erp-employee-toolbar-actions flex flex-wrap items-center justify-end gap-2">
              {canTerminate ? (
                <Button
                  icon={<StopOutlined />}
                  danger
                  onClick={openTerminateDialog}
                  aria-label={t('hr.buttons.terminateContract')}
                >
                  {isNarrow ? undefined : t('hr.buttons.terminateContract')}
                </Button>
              ) : null}
              {canEditTermination ? (
                <Button
                  icon={<EditOutlined />}
                  onClick={openEditTerminationDialog}
                  aria-label={t('hr.buttons.editTerminationDate')}
                >
                  {isNarrow ? undefined : t('hr.buttons.editTerminationDate')}
                </Button>
              ) : null}
              {canEdit ? (
                <Space.Compact>
                  <Button
                    type="primary"
                    icon={<EditOutlined />}
                    onClick={() =>
                      router.push(`/hr/employee-contract/${contractId}/edit`)
                    }
                    aria-label={t('hr.buttons.editEmployeeContract')}
                  >
                    {isNarrow
                      ? undefined
                      : isCompact
                        ? t('common.update')
                        : t('hr.buttons.editEmployeeContract')}
                  </Button>
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => setConfirmDelete(true)}
                    aria-label={t('hr.buttons.delete')}
                  >
                    {isNarrow ? undefined : t('hr.buttons.delete')}
                  </Button>
                </Space.Compact>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="erp-employee-hero erp-contract-hero">
          <div className="erp-employee-hero-copy min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="erp-users-id-chip">
                {contract.contractNumber}
              </span>
              <StatusBadge
                label={formatEmployeeContractStatus(contract.status, t)}
                variant={employeeContractStatusVariant(contract.status)}
              />
              <span className="erp-users-role-tag">
                {formatEmployeeContractType(contract.contractType, t)}
              </span>
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline justify-center gap-2 sm:justify-start">
              <h2 className="erp-users-name erp-employee-hero-name m-0">
                {employeeName}
              </h2>
            </div>
            <p className="erp-users-email m-0 mt-1.5">
              {contract.employee?.email ?? t('pages.hr.employeeContract.detail')}
            </p>
            <p className="erp-users-cell-sub m-0 mt-1">
              {[
                `${t('hr.labels.signedAt')} ${formatProjectDate(contract.signedAt)}`,
                `${t('hr.labels.startDate')} ${formatProjectDate(contract.startDate)}`,
                contract.endDate
                  ? `${t('hr.labels.endDate')} ${formatProjectDate(contract.endDate)}`
                  : t('hr.labels.openEnded'),
              ].join(' · ')}
            </p>
          </div>
        </div>
      </div>

      <div className="erp-users-stat-bar erp-employee-meta-bar erp-contract-meta-bar">
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.labels.contractType')}</p>
            <p className="erp-employee-meta-value">
              {formatEmployeeContractType(contract.contractType, t)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.labels.signedAt')}</p>
            <p className="erp-employee-meta-value">
              {formatProjectDate(contract.signedAt)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.labels.startDate')}</p>
            <p className="erp-employee-meta-value">
              {formatProjectDate(contract.startDate)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.labels.endDate')}</p>
            <p className="erp-employee-meta-value">
              {contract.endDate
                ? formatProjectDate(contract.endDate)
                : t('hr.labels.openEnded')}
            </p>
          </div>
        </div>
      </div>

      <div className="erp-pro-card">
        <div className="erp-employee-tab-panel erp-contract-detail-body">
          <DetailSection title={t('hr.section.contractDetails')}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <MetaItem label={t('hr.labels.employee')}>
                {employeeName}
              </MetaItem>
              <MetaItem label={t('hr.table.status')}>
                <StatusBadge
                  label={formatEmployeeContractStatus(contract.status, t)}
                  variant={employeeContractStatusVariant(contract.status)}
                />
              </MetaItem>
              <MetaItem label={t('hr.labels.contractType')}>
                {formatEmployeeContractType(contract.contractType, t)}
              </MetaItem>
              <MetaItem label={t('hr.labels.signedAt')}>
                {formatProjectDate(contract.signedAt)}
              </MetaItem>
              <MetaItem label={t('hr.labels.startDate')}>
                {formatProjectDate(contract.startDate)}
              </MetaItem>
              <MetaItem label={t('hr.labels.endDate')}>
                {contract.endDate
                  ? formatProjectDate(contract.endDate)
                  : t('hr.labels.openEnded')}
              </MetaItem>
              {contract.probationEndDate ? (
                <MetaItem label={t('hr.labels.probationEndDate')}>
                  {formatProjectDate(contract.probationEndDate)}
                </MetaItem>
              ) : null}
              {contract.governedBy ? (
                <MetaItem label={t('hr.labels.governedBy')}>
                  {contract.governedBy}
                </MetaItem>
              ) : null}
              {contract.terminatedAt ? (
                <>
                  <MetaItem label={t('hr.labels.terminatedAt')}>
                    {formatProjectDate(contract.terminatedAt)}
                  </MetaItem>
                  <MetaItem label={t('hr.labels.terminationReason')}>
                    <p className="m-0 whitespace-pre-wrap leading-relaxed">
                      {contract.terminationReason ?? '-'}
                    </p>
                  </MetaItem>
                </>
              ) : null}
              {contract.notes ? (
                <MetaItem label={t('hr.labels.notes')}>
                  <p className="m-0 whitespace-pre-wrap leading-relaxed">
                    {contract.notes}
                  </p>
                </MetaItem>
              ) : null}
              {contract.creator ? (
                <MetaItem label={t('hr.labels.createdBy')}>
                  {formatEmployeeContractEmployeeName(contract.creator)}
                </MetaItem>
              ) : null}
              <MetaItem label={t('hr.table.createdDate')}>
                {formatProjectDate(contract.createdAt)}
              </MetaItem>
            </div>
          </DetailSection>

          {hasCompensation ? (
            <DetailSection title={t('hr.section.compensation')}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <MetaItem label={t('hr.form.currency')}>
                  {ETB}
                </MetaItem>
                <MetaItem label={t('hr.labels.pensionApplicable')}>
                  {(contract.pensionApplicable ?? true)
                    ? t('common.yes')
                    : t('common.no')}
                </MetaItem>
                <MetaItem label={t('hr.labels.taxApplicable')}>
                  {(contract.taxApplicable ?? true)
                    ? t('common.yes')
                    : t('common.no')}
                </MetaItem>
              </div>
            </DetailSection>
          ) : null}

          {hasCompensation ? (
            <DetailSection title={t('hr.section.payrollDetails')}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <MetaItem label={t('hr.labels.basicSalary')}>
                  {formatMoney(contract.basicSalary, ETB)}
                </MetaItem>
                <MetaItem label={t('hr.labels.transportationAllowance')}>
                  {formatMoney(contract.transportationAllowance, ETB)}
                </MetaItem>
                <MetaItem label={t('hr.labels.monthlyBonus')}>
                  {formatMoney(contract.monthlyBonus, ETB)}
                </MetaItem>
                <MetaItem label={t('hr.labels.monthlyNetBonus')}>
                  {formatMoney(contract.monthlyNetBonus ?? 0, ETB)}
                </MetaItem>
              </div>
            </DetailSection>
          ) : null}

          <DetailSection
            title={t('hr.labels.supportingAttachments')}
            className="erp-employee-section--docs"
          >
            <AttachmentDownloadList
              documents={contract.attachmentFolder?.documents}
              emptyLabel={t('hr.empty.noAttachments')}
            />
          </DetailSection>

          <DetailSection title={t('hr.section.evaluationHistory')}>
            <ContractEvaluationHistory
              contractId={contract.id}
              employeeName={employeeName}
            />
          </DetailSection>
        </div>
      </div>

      <ConfirmDialog
        open={terminateOpen}
        title={
          canEditTermination
            ? t('hr.dialog.editTerminationTitle')
            : t('hr.dialog.terminateContractTitle')
        }
        description={
          canEditTermination
            ? t('hr.dialog.editTerminationDesc')
            : t('hr.dialog.terminateContractDesc')
        }
        confirmLabel={
          canEditTermination
            ? t('hr.buttons.saveTerminationDate')
            : t('hr.buttons.terminateContract')
        }
        danger={!canEditTermination}
        confirmLoading={terminateMutation.isPending}
        onConfirm={() => handleTerminate()}
        onCancel={() => {
          setTerminateOpen(false);
          terminateForm.resetFields();
        }}
      >
        <Form form={terminateForm} layout="vertical" className="mt-4">
          <Form.Item
            name="terminatedAt"
            label={t('hr.form.terminatedAt')}
            rules={
              canEditTermination
                ? [
                    {
                      required: true,
                      message: t('hr.validation.terminationDateRequired'),
                    },
                  ]
                : undefined
            }
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="terminationReason"
            label={t('hr.form.terminationReason')}
            rules={[
              {
                required: true,
                message: t('hr.validation.terminationReasonRequired'),
              },
            ]}
          >
            <Input.TextArea rows={3} maxLength={2000} showCount />
          </Form.Item>
        </Form>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDelete}
        title={t('hr.dialog.deleteContractTitle')}
        description={t('hr.dialog.deleteContractDesc')}
        confirmLabel={t('hr.buttons.delete')}
        danger
        confirmLoading={deleteMutation.isPending}
        onConfirm={() => handleDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
