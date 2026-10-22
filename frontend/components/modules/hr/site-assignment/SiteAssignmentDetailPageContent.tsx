'use client';

import './site-assignments-v2.css';

import { useState } from 'react';
import { Button, DatePicker, Form, Grid, Input, Modal, Space, Spin } from 'antd';
import {
  CalendarOutlined,
  EnvironmentOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { ArrowLeft, MapPin } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import SiteAssignmentOvertimeImpact from '@/components/modules/hr/site-assignment/SiteAssignmentOvertimeImpact';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
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
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatSiteAssignmentProject,
  siteAssignmentStatusVariant,
} from '@/lib/utils/site-assignment-display';
import { formatUserName } from '@/lib/utils/user-display';

const LIST_PATH = '/hr/site-assignments';

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="erp-pro-card erp-sa-section-card">
      <div className="erp-employee-section">
        <div className="erp-employee-section-header">
          <h3 className="erp-employee-section-title">{title}</h3>
        </div>
        <div className="erp-employee-section-body">{children}</div>
      </div>
    </div>
  );
}

/**
 * Site assignment detail - leave / attendance v2 hero and soft sections.
 */
export default function SiteAssignmentDetailPageContent({
  id,
}: {
  id: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isNarrow = screens.sm === false;
  const canViewHr = useCanViewHr();
  const currentUser = useCurrentUser();
  const detailQuery = useSiteAssignment(id);
  const cancelMutation = useCancelSiteAssignment(id);
  const cancelApprovedMutation = useCancelApprovedSiteAssignment(id);
  const shortenMutation = useShortenSiteAssignment(id);
  const [shortenOpen, setShortenOpen] = useState(false);
  const [cancelHrOpen, setCancelHrOpen] = useState(false);
  const [confirmCancelSubmitted, setConfirmCancelSubmitted] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [shortenForm] = Form.useForm();
  const shortenEndDate = Form.useWatch('endDate', shortenForm) as
    | { format: (s: string) => string }
    | undefined;

  const row = detailQuery.data;
  const isOwner = row?.employeeId === currentUser.data?.id;
  const tiers = row?.approvalRequest?.tiers ?? [];

  async function handleEmployeeCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success(t('pages.hr.siteAssignments.detail.cancelled'));
      setConfirmCancelSubmitted(false);
    } catch (error) {
      notifyApiError(
        error,
        t('pages.hr.siteAssignments.detail.actionFailed'),
        messageApi,
        t,
      );
    }
  }

  if (detailQuery.isLoading && !row) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-sa-detail-page erp-site-assignments-v2">
        <div className="erp-sa-loading">
          <Spin />
        </div>
      </div>
    );
  }

  if (detailQuery.isError) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-sa-detail-page erp-site-assignments-v2">
        <ErpNotice
          tone="error"
          title={getFriendlyApiErrorMessage(
            detailQuery.error,
            t('pages.hr.siteAssignments.loadFailed'),
            t,
          )}
          action={
            <Button onClick={() => router.push(LIST_PATH)}>
              {t('pages.hr.siteAssignments.detail.back')}
            </Button>
          }
        />
      </div>
    );
  }

  if (!row) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-sa-detail-page erp-site-assignments-v2">
        <ErpNotice
          tone="warning"
          title={t('pages.hr.siteAssignments.notFound')}
          action={
            <Button onClick={() => router.push(LIST_PATH)}>
              {t('pages.hr.siteAssignments.detail.back')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-sa-detail-page erp-site-assignments-v2">
      <ConfirmDialog
        open={confirmCancelSubmitted}
        title={t('pages.hr.siteAssignments.detail.cancelSubmitted')}
        description={t('pages.hr.siteAssignments.detail.cancelSubmittedHint')}
        confirmLabel={t('pages.hr.siteAssignments.detail.cancelSubmitted')}
        danger
        confirmLoading={cancelMutation.isPending}
        onConfirm={() => void handleEmployeeCancel()}
        onCancel={() => setConfirmCancelSubmitted(false)}
      />

      <section className="erp-sa-detail-hero">
        <div className="erp-sa-hero-top">
          <div className="min-w-0">
            <Link href={LIST_PATH} className="erp-sa-back">
              <ArrowLeft size={14} strokeWidth={2} aria-hidden />
              {t('pages.hr.siteAssignments.detail.back')}
            </Link>
            <div className="erp-sa-hero-title-row">
              <h2 className="erp-sa-hero-title">{row.requestNumber}</h2>
              <StatusBadge
                variant={siteAssignmentStatusVariant(row.status)}
                label={t(`pages.hr.siteAssignments.status.${row.status}`)}
              />
            </div>
            <p className="erp-sa-detail-meta">
              <span>
                <MapPin size={14} strokeWidth={2} aria-hidden />
                {row.siteName}
              </span>
              <span>
                <CalendarOutlined />
                {formatProjectDate(row.startDate)} –{' '}
                {formatProjectDate(row.endDate)}
              </span>
              <span>{formatUserName(row.employee)}</span>
            </p>
          </div>

          <div className="erp-sa-hero-actions">
            <Space.Compact>
              {isOwner && row.status === 'SUBMITTED' ? (
                <Button
                  danger
                  icon={<StopOutlined />}
                  onClick={() => setConfirmCancelSubmitted(true)}
                >
                  {isNarrow
                    ? undefined
                    : t('pages.hr.siteAssignments.detail.cancelSubmitted')}
                </Button>
              ) : null}
              {canViewHr && row.status === 'APPROVED' ? (
                <>
                  <Button onClick={() => setShortenOpen(true)}>
                    {isNarrow
                      ? undefined
                      : t('pages.hr.siteAssignments.detail.shorten')}
                  </Button>
                  <Button danger onClick={() => setCancelHrOpen(true)}>
                    {isNarrow
                      ? undefined
                      : t('pages.hr.siteAssignments.detail.cancelApproved')}
                  </Button>
                </>
              ) : null}
            </Space.Compact>
          </div>
        </div>

        <div className="erp-sa-fact-row">
          <div className="erp-sa-fact">
            <p className="erp-sa-fact-label">
              {t('pages.hr.siteAssignments.columns.employee')}
            </p>
            <p className="erp-sa-fact-value">{formatUserName(row.employee)}</p>
          </div>
          <div className="erp-sa-fact">
            <p className="erp-sa-fact-label">
              {t('pages.hr.siteAssignments.columns.site')}
            </p>
            <p className="erp-sa-fact-value">{row.siteName}</p>
          </div>
          <div className="erp-sa-fact">
            <p className="erp-sa-fact-label">
              {t('pages.hr.siteAssignments.form.dateRange')}
            </p>
            <p className="erp-sa-fact-value">
              {formatProjectDate(row.startDate)} –{' '}
              {formatProjectDate(row.endDate)}
            </p>
          </div>
          <div className="erp-sa-fact">
            <p className="erp-sa-fact-label">
              {t('pages.hr.siteAssignments.columns.days')}
            </p>
            <p className="erp-sa-fact-value">
              {row.calendarDays} {t('pages.hr.siteAssignments.form.daysLabel')}
            </p>
          </div>
        </div>
      </section>

      <DetailSection title={t('pages.hr.siteAssignments.detail.details')}>
        <div className="erp-sa-details-grid">
          <div className="erp-sa-field">
            <p className="erp-sa-field-label">
              {t('pages.hr.siteAssignments.columns.requestNumber')}
            </p>
            <p className="erp-sa-field-value">{row.requestNumber}</p>
          </div>
          <div className="erp-sa-field">
            <p className="erp-sa-field-label">
              {t('pages.hr.siteAssignments.columns.status')}
            </p>
            <p className="erp-sa-field-value">
              <StatusBadge
                variant={siteAssignmentStatusVariant(row.status)}
                label={t(`pages.hr.siteAssignments.status.${row.status}`)}
              />
            </p>
          </div>
          <div className="erp-sa-field">
            <p className="erp-sa-field-label">
              {t('pages.hr.siteAssignments.columns.project')}
            </p>
            <p className="erp-sa-field-value">
              {formatSiteAssignmentProject(row) ?? '-'}
            </p>
          </div>
          <div className="erp-sa-field">
            <p className="erp-sa-field-label">
              {t('pages.hr.siteAssignments.columns.site')}
            </p>
            <p className="erp-sa-field-value">
              <span className="inline-flex items-center gap-1.5">
                <EnvironmentOutlined />
                {row.siteName}
              </span>
            </p>
          </div>
          {row.reason ? (
            <div className="erp-sa-field erp-sa-field--wide">
              <p className="erp-sa-field-label">
                {t('pages.hr.siteAssignments.form.reason')}
              </p>
              <p className="erp-sa-field-value">{row.reason}</p>
            </div>
          ) : null}
        </div>
      </DetailSection>

      <DetailSection title={t('pages.hr.perDiem.linkedAdvances')}>
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
                  {advance.requestNumber} - {advance.destination} (
                  {advance.status}
                  {(advance._count?.disbursements ?? 0) > 0
                    ? ` · ${t('pages.hr.perDiem.disbursed')}`
                    : ''}
                  )
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DetailSection>

      {tiers.length > 0 ? (
        <div className="erp-pro-card erp-sa-section-card overflow-hidden">
          <ApprovalTierTimeline
            tiers={tiers}
            currentTier={row.approvalRequest?.currentTier ?? 0}
          />
        </div>
      ) : null}

      <Modal
        rootClassName="erp-sa-modal"
        open={shortenOpen}
        title={t('pages.hr.siteAssignments.detail.shortenTitle')}
        onCancel={() => setShortenOpen(false)}
        onOk={() => shortenForm.submit()}
        confirmLoading={shortenMutation.isPending}
      >
        <SiteAssignmentOvertimeImpact
          id={id}
          mode="shorten"
          endDate={shortenEndDate ? shortenEndDate.format('YYYY-MM-DD') : null}
          open={shortenOpen}
        />
        <Form
          form={shortenForm}
          layout="vertical"
          onFinish={async (values: {
            endDate: { format: (s: string) => string };
            reason: string;
          }) => {
            try {
              await shortenMutation.mutateAsync({
                endDate: values.endDate.format('YYYY-MM-DD'),
                reason: values.reason,
              });
              messageApi.success(
                t('pages.hr.siteAssignments.detail.shortened'),
              );
              setShortenOpen(false);
            } catch (error) {
              notifyApiError(
                error,
                t('pages.hr.siteAssignments.detail.actionFailed'),
                messageApi,
                t,
              );
            }
          }}
        >
          <Form.Item
            name="endDate"
            label={t('pages.hr.siteAssignments.detail.newEndDate')}
            rules={[{ required: true }]}
          >
            <DatePicker className="w-full" />
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
        rootClassName="erp-sa-modal"
        open={cancelHrOpen}
        title={t('pages.hr.siteAssignments.detail.cancelApprovedTitle')}
        onCancel={() => {
          setCancelHrOpen(false);
          setCancelReason('');
        }}
        onOk={async () => {
          if (!cancelReason.trim()) {
            messageApi.error(
              t('pages.hr.siteAssignments.detail.reasonRequired'),
            );
            return;
          }
          try {
            await cancelApprovedMutation.mutateAsync(cancelReason.trim());
            messageApi.success(t('pages.hr.siteAssignments.detail.cancelled'));
            setCancelHrOpen(false);
            setCancelReason('');
          } catch (error) {
            notifyApiError(
              error,
              t('pages.hr.siteAssignments.detail.actionFailed'),
              messageApi,
              t,
            );
          }
        }}
        confirmLoading={cancelApprovedMutation.isPending}
      >
        <SiteAssignmentOvertimeImpact
          id={id}
          mode="cancel"
          endDate={null}
          open={cancelHrOpen}
        />
        <Input.TextArea
          rows={3}
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder={t('pages.hr.siteAssignments.form.reason')}
        />
      </Modal>
    </div>
  );
}
