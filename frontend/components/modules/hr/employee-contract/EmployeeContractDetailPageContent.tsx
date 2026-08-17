'use client';

import { useState } from 'react';
import { Alert, Button, DatePicker, Form, Input, Skeleton } from 'antd';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
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
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { tokens } from '@/lib/theme/tokens';

interface TerminateFormValues {
  terminatedAt?: dayjs.Dayjs;
  terminationReason: string;
}

export default function EmployeeContractDetailPageContent({
  contractId,
}: {
  contractId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const canViewHr = useCanViewHr();
  const detailQuery = useEmployeeContract(contractId);
  const terminateMutation = useTerminateEmployeeContract(contractId);
  const deleteMutation = useDeleteEmployeeContract(contractId);
  const [terminateForm] = Form.useForm<TerminateFormValues>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [terminateOpen, setTerminateOpen] = useState(false);

  const contract = detailQuery.data;
  const canManage = canViewHr && contract?.status === 'ACTIVE';

  async function handleTerminate(): Promise<void> {
    const values = await terminateForm.validateFields();
    try {
      await terminateMutation.mutateAsync({
        terminationReason: values.terminationReason.trim(),
        terminatedAt: values.terminatedAt?.format('YYYY-MM-DD'),
      });
      messageApi.success(t('hr.messages.employeeContractTerminated'));
      setTerminateOpen(false);
      terminateForm.resetFields();
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToTerminateEmployeeContract'),
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
    return <Skeleton active paragraph={{ rows: 8 }} />;
  }

  if (detailQuery.isError || !contract) {
    return (
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
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={() => router.push('/hr/employee-contract')}
        >
          {t('hr.buttons.back')}
        </Button>
        {canManage ? (
          <>
            <Button
              className="ml-auto"
              onClick={() =>
                router.push(`/hr/employee-contract/${contractId}/edit`)
              }
            >
              {t('hr.buttons.editEmployeeContract')}
            </Button>
            <Button danger onClick={() => setTerminateOpen(true)}>
              {t('hr.buttons.terminateContract')}
            </Button>
            <Button
              danger
              type="primary"
              onClick={() => setConfirmDelete(true)}
            >
              {t('hr.buttons.delete')}
            </Button>
          </>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        <div
          className="rounded-lg overflow-hidden"
          style={{
            background: tokens.colorCardBg,
            border: `1px solid ${tokens.colorBorder}`,
          }}
        >
          <div className="px-5 py-4">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: tokens.colorTextTertiary }}
              >
                {contract.contractNumber}
              </span>
              <span style={{ color: tokens.colorBorder }}>|</span>
              <StatusBadge
                label={formatEmployeeContractStatus(contract.status, t)}
                variant={employeeContractStatusVariant(contract.status)}
              />
            </div>
            <h2
              className="text-lg font-semibold leading-snug m-0"
              style={{ color: tokens.colorTextPrimary }}
            >
              {t('pages.hr.employeeContract.detail')} —{' '}
              {formatEmployeeContractEmployeeName(contract.employee)}
            </h2>
            <p
              className="mt-1 text-sm m-0"
              style={{ color: tokens.colorTextSecondary }}
            >
              {formatEmployeeContractType(contract.contractType, t)}
              {contract.signedAt
                ? ` | ${t('hr.labels.signedAt')} ${formatProjectDate(contract.signedAt)}`
                : null}
            </p>
          </div>
        </div>

        <SummaryStrip
          items={[
            {
              label: t('hr.labels.contractType'),
              value: formatEmployeeContractType(contract.contractType, t),
            },
            {
              label: t('hr.labels.signedAt'),
              value: formatProjectDate(contract.signedAt),
            },
            {
              label: t('hr.labels.startDate'),
              value: formatProjectDate(contract.startDate),
            },
            {
              label: t('hr.labels.endDate'),
              value: contract.endDate
                ? formatProjectDate(contract.endDate)
                : t('hr.labels.openEnded'),
            },
          ]}
        />

        <SectionCard
          title={t('hr.section.contractDetails')}
          bodyClassName="px-5 py-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MetaItem label={t('hr.labels.employee')}>
              {formatEmployeeContractEmployeeName(contract.employee)}
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
            {contract.terminatedAt ? (
              <>
                <MetaItem label={t('hr.labels.terminatedAt')}>
                  {formatProjectDate(contract.terminatedAt)}
                </MetaItem>
                <MetaItem label={t('hr.labels.terminationReason')}>
                  <p className="whitespace-pre-wrap leading-relaxed m-0">
                    {contract.terminationReason ?? '-'}
                  </p>
                </MetaItem>
              </>
            ) : null}
            {contract.notes ? (
              <MetaItem label={t('hr.labels.notes')}>
                <p className="whitespace-pre-wrap leading-relaxed m-0">
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
        </SectionCard>

        <SectionCard
          title={t('hr.labels.supportingAttachments')}
          bodyClassName="px-5 py-4"
        >
          <AttachmentDownloadList
            documents={contract.attachmentFolder?.documents}
            emptyLabel={t('hr.empty.noAttachments')}
          />
        </SectionCard>
      </div>

      <ConfirmDialog
        open={terminateOpen}
        title={t('hr.dialog.terminateContractTitle')}
        description={t('hr.dialog.terminateContractDesc')}
        confirmLabel={t('hr.buttons.terminateContract')}
        danger
        confirmLoading={terminateMutation.isPending}
        onConfirm={() => handleTerminate()}
        onCancel={() => {
          setTerminateOpen(false);
          terminateForm.resetFields();
        }}
      >
        <Form form={terminateForm} layout="vertical" className="mt-4">
          <Form.Item name="terminatedAt" label={t('hr.form.terminatedAt')}>
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
