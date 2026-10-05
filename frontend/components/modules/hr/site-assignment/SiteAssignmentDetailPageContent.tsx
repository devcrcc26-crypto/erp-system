'use client';

import { useState } from 'react';
import { Button, DatePicker, Form, Input, Modal, Space } from 'antd';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  useCancelApprovedSiteAssignment,
  useCancelSiteAssignment,
  useShortenSiteAssignment,
  useSiteAssignment,
} from '@/lib/query/site-assignment';
import { useCurrentUser } from '@/lib/query/profile';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';

export default function SiteAssignmentDetailPageContent({
  id,
}: {
  id: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const canViewHr = useCanViewHr();
  const currentUser = useCurrentUser();
  const detailQuery = useSiteAssignment(id);
  const cancelMutation = useCancelSiteAssignment(id);
  const cancelApprovedMutation = useCancelApprovedSiteAssignment(id);
  const shortenMutation = useShortenSiteAssignment(id);
  const [shortenOpen, setShortenOpen] = useState(false);
  const [cancelHrOpen, setCancelHrOpen] = useState(false);
  const [shortenForm] = Form.useForm();

  const row = detailQuery.data;
  const isOwner = row?.employeeId === currentUser.data?.id;
  const tiers = row?.approvalRequest?.tiers ?? [];

  async function handleEmployeeCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success(t('pages.hr.siteAssignments.detail.cancelled'));
    } catch (error) {
      notifyApiError(messageApi, error);
    }
  }

  return (
    <div className="erp-page-stack">
      <Button
        type="text"
        icon={<ArrowLeft size={16} />}
        onClick={() => router.push('/hr/site-assignments')}
      >
        {t('pages.hr.siteAssignments.detail.back')}
      </Button>
      {detailQuery.isLoading || !row ? (
        <div>{t('common.loading')}</div>
      ) : (
        <>
          <div className="erp-employee-section">
            <div className="erp-employee-section-header">
              <h2>{row.requestNumber}</h2>
              <StatusBadge
                variant={
                  row.status === 'APPROVED'
                    ? 'approved'
                    : row.status === 'REJECTED' || row.status === 'CANCELLED'
                      ? 'rejected'
                      : 'pending'
                }
                label={t(`pages.hr.siteAssignments.status.${row.status}`)}
              />
            </div>
            <div className="erp-employee-section-body">
              <p>
                <strong>{t('pages.hr.siteAssignments.columns.employee')}:</strong>{' '}
                {formatUserName(row.employee)}
              </p>
              <p>
                <strong>{t('pages.hr.siteAssignments.columns.site')}:</strong>{' '}
                {row.siteName}
              </p>
              <p>
                <strong>{t('pages.hr.siteAssignments.columns.project')}:</strong>{' '}
                {row.project
                  ? `${row.project.projectCode} — ${row.project.name}`
                  : '—'}
              </p>
              <p>
                <strong>{t('pages.hr.siteAssignments.form.dateRange')}:</strong>{' '}
                {formatProjectDate(row.startDate)} —{' '}
                {formatProjectDate(row.endDate)} ({row.calendarDays}{' '}
                {t('pages.hr.siteAssignments.form.daysLabel')})
              </p>
              {row.reason ? (
                <p>
                  <strong>{t('pages.hr.siteAssignments.form.reason')}:</strong>{' '}
                  {row.reason}
                </p>
              ) : null}
            </div>
          </div>
          <div className="erp-employee-section mt-4">
            <div className="erp-employee-section-header">
              <h3>{t('pages.hr.perDiem.linkedAdvances')}</h3>
            </div>
            <div className="erp-employee-section-body">
              {(row.perDiemRequests?.length ?? 0) === 0 ? (
                <p className="erp-users-cell-sub m-0">
                  {t('pages.hr.perDiem.noLinkedAdvances')}
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {(row.perDiemRequests ?? []).map((advance) => (
                    <li key={advance.id}>
                      <Button
                        type="link"
                        className="h-auto p-0"
                        onClick={() => router.push(`/hr/per-diem/${advance.id}`)}
                      >
                        {advance.requestNumber} — {advance.destination} (
                        {advance.status}
                        {advance.paidAt
                          ? ` · ${t('pages.hr.perDiem.paid')}`
                          : ''}
                        )
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {tiers.length > 0 ? (
            <ApprovalTierTimeline tiers={tiers} />
          ) : null}
          <Space>
            {isOwner && row.status === 'SUBMITTED' ? (
              <Button danger onClick={() => void handleEmployeeCancel()}>
                {t('pages.hr.siteAssignments.detail.cancelSubmitted')}
              </Button>
            ) : null}
            {canViewHr && row.status === 'APPROVED' ? (
              <>
                <Button onClick={() => setShortenOpen(true)}>
                  {t('pages.hr.siteAssignments.detail.shorten')}
                </Button>
                <Button danger onClick={() => setCancelHrOpen(true)}>
                  {t('pages.hr.siteAssignments.detail.cancelApproved')}
                </Button>
              </>
            ) : null}
          </Space>
        </>
      )}
      <Modal
        open={shortenOpen}
        title={t('pages.hr.siteAssignments.detail.shortenTitle')}
        onCancel={() => setShortenOpen(false)}
        onOk={() => shortenForm.submit()}
        confirmLoading={shortenMutation.isPending}
      >
        <Form
          form={shortenForm}
          layout="vertical"
          onFinish={async (values: { endDate: { format: (s: string) => string }; reason: string }) => {
            try {
              await shortenMutation.mutateAsync({
                endDate: values.endDate.format('YYYY-MM-DD'),
                reason: values.reason,
              });
              messageApi.success(t('pages.hr.siteAssignments.detail.shortened'));
              setShortenOpen(false);
            } catch (error) {
              notifyApiError(messageApi, error);
            }
          }}
        >
          <Form.Item
            name="endDate"
            label={t('pages.hr.siteAssignments.detail.newEndDate')}
            rules={[{ required: true }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="reason"
            label={t('pages.hr.siteAssignments.form.reason')}
            rules={[{ required: true }]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        open={cancelHrOpen}
        title={t('pages.hr.siteAssignments.detail.cancelApprovedTitle')}
        onCancel={() => setCancelHrOpen(false)}
        onOk={async () => {
          const reason = (
            document.getElementById('sa-cancel-reason') as HTMLTextAreaElement
          )?.value;
          if (!reason?.trim()) {
            messageApi.error(t('pages.hr.siteAssignments.detail.reasonRequired'));
            return;
          }
          try {
            await cancelApprovedMutation.mutateAsync(reason.trim());
            messageApi.success(t('pages.hr.siteAssignments.detail.cancelled'));
            setCancelHrOpen(false);
          } catch (error) {
            notifyApiError(messageApi, error);
          }
        }}
        confirmLoading={cancelApprovedMutation.isPending}
      >
        <Input.TextArea id="sa-cancel-reason" rows={3} />
      </Modal>
    </div>
  );
}
