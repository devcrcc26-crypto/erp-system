'use client';

import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Descriptions,
  Empty,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowLeft,
  CheckCircle2,
  Upload,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useCanManageFlight,
} from '@/hooks/use-auth-capabilities';
import { ApiRequestError } from '@/lib/api/errors';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import type { FlightPassenger } from '@/lib/api/flight.types';
import {
  useAcknowledgeTicket,
  useAttachCombinedTicket,
  useCancelFlightApplication,
  useFlightApplication,
} from '@/lib/query/flight';
import { useCurrentUser } from '@/lib/query/profile';
import { tokens } from '@/lib/theme/tokens';
import {
  flightStatusVariant,
  formatFlightStatus,
  formatFlightSubmitterName,
  formatTicketClass,
  formatTripType,
  formatVisaStatus,
  tripTypeVariant,
} from '@/lib/utils/flight-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';

/**
 * Flight application detail with passengers, tickets, and approval timeline.
 */
export default function FlightApplicationDetailPageContent({
  applicationId,
}: {
  applicationId: string;
}): React.ReactNode {
  const router = useRouter();
  const messageApi = useAppMessage();
  const currentUser = useCurrentUser();
  const canManage = useCanManageFlight();

  const detailQuery = useFlightApplication(applicationId);
  const cancelMutation = useCancelFlightApplication(applicationId);
  const attachTicketMutation = useAttachCombinedTicket(applicationId);
  const acknowledgeTicket = useAcknowledgeTicket(applicationId);

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [uploadingTicket, setUploadingTicket] = useState(false);
  const ticketInputRef = useRef<HTMLInputElement>(null);

  const application = detailQuery.data;

  const tiers = useMemo(
    () => (application?.approvalRequest?.tiers ?? []) as ApprovalTier[],
    [application?.approvalRequest?.tiers],
  );

  const canCancel =
    Boolean(application) &&
    Boolean(currentUser.data?.id) &&
    application?.submittedBy === currentUser.data?.id &&
    (application?.status === 'DRAFT' || application?.status === 'SUBMITTED');

  const currentUserPassenger = useMemo(() => {
    if (!currentUser.data?.id || !application?.passengers) {
      return null;
    }
    return (
      application.passengers.find(
        (p) => p.employeeId === currentUser.data?.id,
      ) ?? null
    );
  }, [application?.passengers, currentUser.data?.id]);

  const canAcknowledge =
    currentUserPassenger !== null &&
    currentUserPassenger.acknowledgementStatus === 'PENDING' &&
    (currentUserPassenger.ticketDocumentId !== null ||
      application?.combinedTicketDocumentId !== null);

  async function handleCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success('Flight application cancelled');
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to cancel flight application', messageApi);
    }
  }

  async function handleAcknowledge(): Promise<void> {
    if (!currentUserPassenger) {
      return;
    }
    try {
      await acknowledgeTicket.mutateAsync(currentUserPassenger.id);
      messageApi.success('Ticket acknowledged');
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to acknowledge ticket', messageApi);
    }
  }

  async function handleCombinedTicketUpload(
    e: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    setUploadingTicket(true);
    try {
      await attachTicketMutation.mutateAsync(file);
      messageApi.success('Combined ticket uploaded');
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to upload ticket', messageApi);
    } finally {
      setUploadingTicket(false);
      if (ticketInputRef.current) {
        ticketInputRef.current.value = '';
      }
    }
  }

  if (detailQuery.isLoading) {
    return <Skeleton active paragraph={{ rows: 10 }} />;
  }

  if (detailQuery.isError || !application) {
    return (
      <Alert
        type="error"
        showIcon
        message={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : 'Flight application not found'
        }
        action={
          <Button onClick={() => router.push('/hr/flight-applications')}>
            Back to list
          </Button>
        }
      />
    );
  }

  const passengerColumns: ColumnsType<FlightPassenger> = [
    {
      title: 'Name',
      key: 'name',
      render: (_: unknown, row: FlightPassenger) =>
        row.employee ? formatUserName(row.employee) : row.employeeId,
    },
    {
      title: 'Passport',
      dataIndex: 'passportNumber',
      key: 'passportNumber',
      render: (v: string | null | undefined) => v ?? '—',
    },
    {
      title: 'Visa',
      key: 'visa',
      render: (_: unknown, row: FlightPassenger) =>
        row.visaRequired ? (
          <Tag color="volcano">
            {row.visaStatus ? formatVisaStatus(row.visaStatus) : 'Required'}
          </Tag>
        ) : (
          <Tag>Not Required</Tag>
        ),
    },
    {
      title: 'Ticket',
      key: 'ticket',
      render: (_: unknown, row: FlightPassenger) => {
        if (row.ticket) {
          return (
            <AttachmentDownloadList
              documents={[row.ticket]}
              emptyLabel="No ticket"
            />
          );
        }
        if (application.combinedTicket) {
          return (
            <Tag color="green" icon={<CheckCircle2 size={12} />}>
              Combined ticket
            </Tag>
          );
        }
        return <Tag>Pending</Tag>;
      },
    },
    {
      title: 'Acknowledgement',
      dataIndex: 'acknowledgementStatus',
      key: 'acknowledgementStatus',
      render: (v: string, row: FlightPassenger) => {
        const isMe = row.employeeId === currentUser.data?.id;
        if (v === 'ACKNOWLEDGED') {
          return (
            <Space size={4}>
              <Tag color="success">Acknowledged</Tag>
              {row.acknowledgedAt
                ? formatProjectDate(row.acknowledgedAt)
                : null}
            </Space>
          );
        }
        if (isMe && canAcknowledge) {
          return (
            <Button
              size="small"
              type="primary"
              loading={acknowledgeTicket.isPending}
              onClick={() => void handleAcknowledge()}
            >
              Acknowledge
            </Button>
          );
        }
        return <Tag>Pending</Tag>;
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Button
            type="text"
            icon={<ArrowLeft size={16} />}
            onClick={() => router.push('/hr/flight-applications')}
            style={{ paddingInline: 0, marginBottom: 8 }}
          >
            Flight Applications
          </Button>
          <Space wrap align="center" size={12}>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {application.applicationNumber}
            </Typography.Title>
            <StatusBadge
              label={formatFlightStatus(application.status)}
              variant={flightStatusVariant(application.status)}
            />
            <StatusBadge
              label={formatTripType(application.tripType)}
              variant={tripTypeVariant(application.tripType)}
            />
            {application.isInternational ? (
              <Tag color="volcano">International</Tag>
            ) : null}
          </Space>
          <Typography.Paragraph
            type="secondary"
            style={{ marginTop: 8, marginBottom: 0 }}
          >
            {formatFlightSubmitterName(application.submitter)}
            {' · '}
            {formatProjectDate(application.createdAt)}
          </Typography.Paragraph>
        </div>

        <Space>
          {application.approvalRequestId ? (
            <Button
              onClick={() =>
                router.push(`/approvals/${application.approvalRequestId}`)
              }
            >
              View in Approvals
            </Button>
          ) : null}
          {canCancel ? (
            <Button danger onClick={() => setConfirmCancel(true)}>
              Cancel Application
            </Button>
          ) : null}
        </Space>
      </div>

      {/* ── Alert: ticket upload CTA ────────────────────────────────── */}
      {application.status === 'APPROVED' &&
      canManage &&
      application.needsTicketAttachment ? (
        <Alert
          type="info"
          showIcon
          message="Tickets required"
          description="The application is approved. Please upload the combined ticket or individual passenger tickets below."
        />
      ) : null}

      {/* ── Main grid ──────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 320px',
          gap: 20,
          alignItems: 'start',
        }}
        className="max-lg:!grid-cols-1"
      >
        {/* Left column */}
        <div className="flex flex-col gap-4">
          {/* Trip details */}
          <div
            style={{
              background: tokens.colorCardBg,
              border: `1px solid ${tokens.colorBorder}`,
              borderRadius: 8,
              padding: 20,
            }}
          >
            <Typography.Title level={5} style={{ marginTop: 0 }}>
              Trip Details
            </Typography.Title>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="Route">
                {application.origin}
                <span style={{ margin: '0 6px', color: tokens.colorTextSecondary }}>
                  →
                </span>
                {application.destination}
              </Descriptions.Item>
              <Descriptions.Item label="Trip Type">
                {formatTripType(application.tripType)}
              </Descriptions.Item>
              <Descriptions.Item label="Departure">
                {formatProjectDate(application.departureDate)}
              </Descriptions.Item>
              {application.returnDate ? (
                <Descriptions.Item label="Return">
                  {formatProjectDate(application.returnDate)}
                </Descriptions.Item>
              ) : null}
              <Descriptions.Item label="Ticket Class">
                {formatTicketClass(application.ticketClass)}
              </Descriptions.Item>
              <Descriptions.Item label="Passengers">
                {application.passengerCount}
              </Descriptions.Item>
              <Descriptions.Item label="Accommodation" span={2}>
                {application.accommodationRequired ? (
                  <>
                    <Tag color="blue">Required</Tag>
                    {application.accommodationDetails ? (
                      <Typography.Text
                        type="secondary"
                        style={{ marginLeft: 8 }}
                      >
                        {application.accommodationDetails}
                      </Typography.Text>
                    ) : null}
                  </>
                ) : (
                  'Not required'
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Per Diem">
                {application.perDiemRequired ? (
                  <Tag color="blue">Required</Tag>
                ) : (
                  'Not required'
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Purpose" span={2}>
                {application.purpose}
              </Descriptions.Item>
              {application.notes ? (
                <Descriptions.Item label="Notes" span={2}>
                  {application.notes}
                </Descriptions.Item>
              ) : null}
            </Descriptions>
          </div>

          {/* Passengers table */}
          <div
            style={{
              background: tokens.colorCardBg,
              border: `1px solid ${tokens.colorBorder}`,
              borderRadius: 8,
              padding: 20,
            }}
          >
            <Typography.Title level={5} style={{ marginTop: 0 }}>
              Passengers
            </Typography.Title>
            <Table<FlightPassenger>
              rowKey="id"
              columns={passengerColumns}
              dataSource={application.passengers}
              pagination={false}
              size="small"
            />
          </div>

          {/* Combined ticket section */}
          {application.status === 'APPROVED' && canManage ? (
            <div
              style={{
                background: tokens.colorCardBg,
                border: `1px solid ${tokens.colorBorder}`,
                borderRadius: 8,
                padding: 20,
              }}
            >
              <Typography.Title level={5} style={{ marginTop: 0 }}>
                Combined Ticket
              </Typography.Title>
              {application.combinedTicket ? (
                <AttachmentDownloadList
                  documents={[application.combinedTicket]}
                />
              ) : (
                <>
                  <Typography.Text
                    type="secondary"
                    style={{ display: 'block', marginBottom: 12 }}
                  >
                    No combined ticket uploaded yet.
                  </Typography.Text>
                  <input
                    ref={ticketInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => void handleCombinedTicketUpload(e)}
                  />
                  <Button
                    icon={<Upload size={14} />}
                    loading={uploadingTicket || attachTicketMutation.isPending}
                    onClick={() => ticketInputRef.current?.click()}
                  >
                    Upload combined ticket
                  </Button>
                </>
              )}
            </div>
          ) : null}

          {/* Supporting attachments */}
          <div
            style={{
              background: tokens.colorCardBg,
              border: `1px solid ${tokens.colorBorder}`,
              borderRadius: 8,
              padding: 20,
            }}
          >
            <Typography.Title level={5} style={{ marginTop: 0 }}>
              Supporting Attachments
            </Typography.Title>
            <AttachmentDownloadList documents={application.documents} />
          </div>
        </div>

        {/* Right column: approval timeline */}
        {application.approvalRequest ? (
          <ApprovalTierTimeline
            tiers={tiers}
            currentTier={application.approvalRequest.currentTier ?? 0}
          />
        ) : (
          <aside
            style={{
              background: tokens.colorCardBg,
              border: `1px solid ${tokens.colorBorder}`,
              borderRadius: 8,
              padding: 20,
            }}
          >
            <Empty description="No approval workflow linked" />
          </aside>
        )}
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel flight application?"
        description="This will cancel the flight application. This cannot be undone."
        confirmLabel="Cancel application"
        danger
        confirmLoading={cancelMutation.isPending}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => void handleCancel()}
      />
    </div>
  );
}
