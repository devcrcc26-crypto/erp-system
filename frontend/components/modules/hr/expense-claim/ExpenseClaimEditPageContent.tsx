'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Form, Input, Skeleton, Space, Table } from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';
import ReturnedRequestCallout from '@/components/modules/approvals/ReturnedRequestCallout';
import ExpenseClaimItemModal from '@/components/modules/hr/expense-claim/ExpenseClaimItemModal';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type { ExpenseClaimItem } from '@/lib/api/expense-claim.types';
import {
  useDeleteExpenseClaimItem,
  useExpenseClaim,
  useUpdateExpenseClaim,
} from '@/lib/query/expense-claim';
import { useCurrentUser } from '@/lib/query/profile';
import { formatEtbAmount } from '@/lib/utils/expense-claim-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface ClaimFormValues {
  title: string;
  description?: string;
}

/**
 * Edit an expense claim (header and line items) when DRAFT or RETURNED.
 * Item changes save immediately; Save writes the header. Status is unchanged:
 * a RETURNED claim is resubmitted from the request page.
 */
export default function ExpenseClaimEditPageContent({
  claimId,
}: {
  claimId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const canViewHr = useCanViewHr();
  const currentUser = useCurrentUser();
  const [form] = Form.useForm<ClaimFormValues>();
  const detailQuery = useExpenseClaim(claimId);
  const updateMutation = useUpdateExpenseClaim(claimId);

  const claim = detailQuery.data;
  const canEdit =
    Boolean(claim) &&
    (claim?.status === 'DRAFT' || claim?.status === 'RETURNED') &&
    (canViewHr ||
      (Boolean(currentUser.data?.id) &&
        claim?.employeeId === currentUser.data?.id));

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ExpenseClaimItem | null>(null);
  const deleteItemMutation = useDeleteExpenseClaimItem(claimId);
  // Seed the header once: item edits refresh the claim cache and must not
  // overwrite what the user is typing.
  const seededRef = useRef(false);
  const backHref = claim?.approvalRequestId
    ? `/approvals/${claim.approvalRequestId}`
    : `/hr/expense-claims/${claimId}`;

  useEffect(() => {
    if (!claim || seededRef.current) {
      return;
    }
    seededRef.current = true;
    form.setFieldsValue({
      title: claim.title,
      description: claim.description ?? undefined,
    });
  }, [claim, form]);

  async function handleDeleteItem(itemId: string): Promise<void> {
    try {
      await deleteItemMutation.mutateAsync(itemId);
    } catch (error: unknown) {
      notifyApiError(error, t('pages.approvals.edit.failed'), messageApi);
    }
  }

  async function handleSubmit(values: ClaimFormValues): Promise<void> {
    try {
      await updateMutation.mutateAsync({
        title: values.title.trim(),
        description: values.description?.trim() || undefined,
      });
      messageApi.success(t('pages.approvals.edit.saved'));
      router.push(backHref);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToUpdateExpenseClaim'),
        messageApi,
      );
    }
  }

  if (detailQuery.isLoading) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-expense-claim-form-page ${DETAIL_PAGE_V2}`}>
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Skeleton active paragraph={{ rows: 6 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !claim) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page ${DETAIL_PAGE_V2}`}>
        <Alert
          type="error"
          showIcon
          title={
            detailQuery.error instanceof ApiRequestError
              ? detailQuery.error.message
              : t('hr.messages.expenseClaimNotFound')
          }
          action={
            <Button onClick={() => router.push('/hr/expense-claims')}>
              {t('hr.buttons.backToList')}
            </Button>
          }
        />
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page ${DETAIL_PAGE_V2}`}>
        <Alert
          type="warning"
          showIcon
          title={t('hr.messages.cannotEditExpenseClaim')}
          action={
            <Button
              onClick={() => router.push(`/hr/expense-claims/${claimId}`)}
            >
              {t('hr.buttons.back')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-expense-claim-form-page ${DETAIL_PAGE_V2}`}>
      <HrFormPageShell
        title={t('pages.hr.expenseClaim.edit')}
        description={t('pages.hr.expenseClaim.editDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref={backHref}
        backLabel={t('hr.buttons.back')}
        headerExtra={
          <Button
            type="primary"
            loading={updateMutation.isPending}
            onClick={() => form.submit()}
          >
            {t('pages.approvals.edit.saveChanges')}
          </Button>
        }
      >
        {claim.status === 'RETURNED' ? (
          <ReturnedRequestCallout approvalRequestId={claim.approvalRequestId} />
        ) : null}
        <FormLayout
          variant="pro"
          title={t('hr.section.requestDetails')}
          description={
            claim.claimNumber
              ? `${claim.claimNumber} · ${t('pages.hr.expenseClaim.detailsStepDescription')}`
              : t('pages.hr.expenseClaim.detailsStepDescription')
          }
        >
          <Form
            form={form}
            layout="vertical"
            requiredMark={false}
            className="erp-drawer-form"
            onFinish={(values) => void handleSubmit(values)}
          >
            <Form.Item
              name="title"
              label={t('hr.form.title')}
              rules={[
                {
                  required: true,
                  message: t('hr.validation.titleRequired'),
                },
              ]}
            >
              <Input
                placeholder={t('hr.placeholder.enterTitle')}
                maxLength={200}
                size="large"
              />
            </Form.Item>
            <Form.Item
              name="description"
              label={t('hr.form.description')}
              className="!mb-0"
              extra={t('pages.hr.expenseClaim.descriptionHint')}
            >
              <Input.TextArea
                rows={4}
                maxLength={4000}
                showCount
                placeholder={t('hr.placeholder.enterExpenseClaimDescription')}
              />
            </Form.Item>
          </Form>
        </FormLayout>

        <FormLayout
          variant="pro"
          title={t('hr.section.items')}
          description={t('hr.form.itemCount', { count: claim.items.length })}
        >
          <Table<ExpenseClaimItem>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={claim.items}
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: t('hr.empty.noItems') }}
            columns={[
              {
                title: t('hr.table.category'),
                dataIndex: 'category',
                key: 'category',
                width: 140,
              },
              {
                title: t('hr.table.description'),
                dataIndex: 'description',
                key: 'description',
                ellipsis: true,
              },
              {
                title: t('hr.table.amount'),
                key: 'amount',
                width: 130,
                align: 'right',
                render: (_: unknown, row) => formatEtbAmount(row.amountEtb),
              },
              {
                title: t('hr.table.receipt'),
                key: 'receipt',
                width: 90,
                render: (_: unknown, row) =>
                  row.receipts.length > 0
                    ? t('hr.form.receiptFileCount', { count: row.receipts.length })
                    : '-',
              },
              {
                title: <span className="sr-only">{t('common.edit')}</span>,
                key: 'actions',
                width: 88,
                render: (_: unknown, row) => (
                  <Space size={4}>
                    <Button
                      size="small"
                      type="text"
                      icon={<EditOutlined />}
                      aria-label={`${t('common.edit')} ${row.description}`}
                      onClick={() => {
                        setEditingItem(row);
                        setItemModalOpen(true);
                      }}
                    />
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label={`${t('common.delete')} ${row.description}`}
                      loading={deleteItemMutation.isPending}
                      onClick={() => void handleDeleteItem(row.id)}
                    />
                  </Space>
                ),
              },
            ]}
          />
          <Button
            className="mt-3"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingItem(null);
              setItemModalOpen(true);
            }}
          >
            {t('hr.buttons.addItem')}
          </Button>
        </FormLayout>
      </HrFormPageShell>

      <ExpenseClaimItemModal
        open={itemModalOpen}
        claimId={claimId}
        editingItem={editingItem}
        onClose={() => {
          setItemModalOpen(false);
          setEditingItem(null);
        }}
      />
    </div>
  );
}
