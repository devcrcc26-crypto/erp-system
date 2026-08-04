'use client';

import { useMemo, useState } from 'react';
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
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import BusinessTripCurrentStepBanner from '@/components/modules/hr/business-trip/BusinessTripCurrentStepBanner';
import BusinessTripTicketAssignmentPanel from '@/components/modules/hr/business-trip/BusinessTripTicketAssignmentPanel';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useCanManageBusinessTrip,
  useCanViewHr,
} from '@/hooks/use-auth-capabilities';
import { ApiRequestError } from '@/lib/api/errors';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import type { BusinessTripPassenger } from '@/lib/api/business-trip.types';
import {
  useBusinessTrip,
  useCancelBusinessTrip,
} from '@/lib/query/business-trip';
import { useCurrentUser } from '@/lib/query/profile';
import { tokens } from '@/lib/theme/tokens';
import {
  businessTripStatusVariant,
  formatBusinessTripStatus,
  formatBusinessTripSubmitterName,
  formatEtb,
  formatTicketClass,
  formatTripType,
  formatVisaStatus,
  tripTypeVariant,
} from '@/lib/utils/business-trip-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';

/**
 * Business trip detail with passengers, tickets, budget, and approval timeline.
 */
export default function BusinessTripDetailPageContent({
  tripId,
}: {
  tripId: string;
}): React.ReactNode {
  const router = useRouter();
  const messageApi = useAppMessage();
  const currentUser = useCurrentUser();
  const canManage = useCanManageBusinessTrip();
  const canViewHr = useCanViewHr();

  const detailQuery = useBusinessTrip(tripId);
  const cancelMutation = useCancelBusinessTrip(tripId);

  const [confirmCancel, setConfirmCancel] = useState(false);

  const trip = detailQuery.data;

  const tiers = useMemo(
    () => (trip?.approvalRequest?.tiers ?? []) as ApprovalTier[],
    [trip?.approvalRequest?.tiers],
  );

  const canCancel =
    Boolean(trip) &&
    Boolean(currentUser.data?.id) &&
    trip?.submittedBy === currentUser.data?.id &&
    (trip?.status === 'DRAFT' || trip?.status === 'SUBMITTED');

  const showTicketPanel =
    trip?.status === 'APPROVED' ||
    Boolean(trip?.combinedTicketDocumentId) ||
    (trip?.passengers.some((p) => p.ticketDocumentId) ?? false);

  async function handleCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success('Business trip cancelled');
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to cancel business trip', messageApi);
    }
  }

  if (detailQuery.isLoading) {
    return <Skeleton active paragraph={{ rows: 10 }} />;
  }

  if (detailQuery.isError || !trip) {
    return (
      <Alert
        type="error"
        showIcon
        message={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : 'Business trip not found'
        }
        action={
          <Button onClick={() => router.push('/hr/business-trips')}>
            Back to list
          </Button>
        }
      />
    );
  }

  const passengerColumns: ColumnsType<BusinessTripPassenger> = [
    {
      title: 'Name',
      key: 'name',
      render: (_: unknown, row: BusinessTripPassenger) =>
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
      render: (_: unknown, row: BusinessTripPassenger) =>
        row.visaRequired ? (
          <Tag color="volcano">
            {row.visaStatus ? formatVisaStatus(row.visaStatus) : 'Required'}
          </Tag>
        ) : (
          <Tag>Not Required</Tag>
        ),
    },
  ];

  const budgetRows = [
    { key: 'flight', item: 'Flight', cost: trip.estimatedFlightCost },
    {
      key: 'accommodation',
      item: 'Accommodation',
      cost: trip.estimatedAccommodationCost,
    },
    { key: 'perDiem', item: 'Per Diem', cost: trip.estimatedPerDiem },
    { key: 'other', item: 'Other', cost: trip.estimatedOtherCost },
    { key: 'total', item: 'Total', cost: trip.estimatedTotalCost, bold: true },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Button
            type="text"
            icon={<ArrowLeft size={16} />}
            onClick={() => router.push('/hr/business-trips')}
            style={{ paddingInline: 0, marginBottom: 8 }}
          >
            Business Trips
          </Button>
          <Space wrap align="center" size={12}>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {trip.tripNumber}
            </Typography.Title>
            <StatusBadge
              label={formatBusinessTripStatus(trip.status)}
              variant={businessTripStatusVariant(trip.status)}
            />
            <StatusBadge
              label={formatTripType(trip.tripType)}
              variant={tripTypeVariant(trip.tripType)}
            />
            <Tag color="volcano">International</Tag>
          </Space>
          <Typography.Paragraph
            type="secondary"
            style={{ marginTop: 8, marginBottom: 0 }}
          >
            {formatBusinessTripSubmitterName(trip.submitter)}
            {' - '}
            {formatProjectDate(trip.createdAt)}
          </Typography.Paragraph>
        </div>

        <Space>
          {trip.approvalRequestId ? (
            <Button
              onClick={() =>
                router.push(`/approvals/${trip.approvalRequestId}`)
              }
            >
              View in Approvals
            </Button>
          ) : null}
          {canCancel ? (
            <Button danger onClick={() => setConfirmCancel(true)}>
              Cancel Trip
            </Button>
          ) : null}
        </Space>
      </div>

      <BusinessTripCurrentStepBanner trip={trip} />

      {trip.status === 'APPROVED' &&
      (canViewHr || canManage) &&
      trip.needsTicketAttachment ? (
        <Alert
          type="info"
          showIcon
          title="Tickets required"
          description="The trip is approved. Upload a combined ticket and/or individual passenger tickets below."
        />
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 320px',
          gap: 20,
          alignItems: 'start',
        }}
        className="max-lg:!grid-cols-1"
      >
        <div className="flex flex-col gap-4">
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
                {trip.originCity}, {trip.originCountry}
                <span
                  style={{ margin: '0 6px', color: tokens.colorTextSecondary }}
                >
                  to
                </span>
                {trip.destinationCountry}
                {trip.destinationCity ? ` / ${trip.destinationCity}` : ''}
              </Descriptions.Item>
              <Descriptions.Item label="Trip Type">
                {formatTripType(trip.tripType)}
              </Descriptions.Item>
              <Descriptions.Item
                label="Departure"
                span={trip.returnDate ? 1 : 2}
              >
                {formatProjectDate(trip.departureDate)}
              </Descriptions.Item>
              {trip.returnDate ? (
                <Descriptions.Item label="Return">
                  {formatProjectDate(trip.returnDate)}
                </Descriptions.Item>
              ) : null}
              <Descriptions.Item label="Ticket Class">
                {formatTicketClass(trip.ticketClass)}
              </Descriptions.Item>
              <Descriptions.Item label="Passengers">
                {trip.passengerCount}
              </Descriptions.Item>
              <Descriptions.Item label="Accommodation" span={2}>
                {trip.accommodationRequired ? (
                  <>
                    <Tag color="blue">Required</Tag>
                    {trip.accommodationDetails ? (
                      <Typography.Text
                        type="secondary"
                        style={{ marginLeft: 8 }}
                      >
                        {trip.accommodationDetails}
                      </Typography.Text>
                    ) : null}
                  </>
                ) : (
                  'Not required'
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Per Diem" span={2}>
                {trip.perDiemRequired ? (
                  <Tag color="blue">Required</Tag>
                ) : (
                  'Not required'
                )}
              </Descriptions.Item>
              {trip.notes ? (
                <Descriptions.Item label="Notes" span={2}>
                  {trip.notes}
                </Descriptions.Item>
              ) : null}
            </Descriptions>
          </div>

          <div
            style={{
              background: tokens.colorCardBg,
              border: `1px solid ${tokens.colorBorder}`,
              borderRadius: 8,
              padding: 20,
            }}
          >
            <Typography.Title level={5} style={{ marginTop: 0 }}>
              Purpose & Host
            </Typography.Title>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Purpose">
                {trip.purpose}
              </Descriptions.Item>
              {trip.hostOrganization ? (
                <Descriptions.Item label="Host Organization">
                  {trip.hostOrganization}
                </Descriptions.Item>
              ) : null}
              {trip.hostContact ? (
                <Descriptions.Item label="Host Contact">
                  {trip.hostContact}
                </Descriptions.Item>
              ) : null}
              {trip.expectedOutcomes ? (
                <Descriptions.Item label="Expected Outcomes">
                  {trip.expectedOutcomes}
                </Descriptions.Item>
              ) : null}
              {trip.itinerary ? (
                <Descriptions.Item label="Itinerary">
                  {trip.itinerary}
                </Descriptions.Item>
              ) : null}
            </Descriptions>
          </div>

          <div
            style={{
              background: tokens.colorCardBg,
              border: `1px solid ${tokens.colorBorder}`,
              borderRadius: 8,
              padding: 20,
            }}
          >
            <Typography.Title level={5} style={{ marginTop: 0 }}>
              Budget Estimate
            </Typography.Title>
            <Table
              rowKey="key"
              size="small"
              pagination={false}
              columns={[
                {
                  title: 'Item',
                  dataIndex: 'item',
                  key: 'item',
                  render: (value: string, row: { bold?: boolean }) =>
                    row.bold ? <Typography.Text strong>{value}</Typography.Text> : value,
                },
                {
                  title: 'Estimated Cost',
                  dataIndex: 'cost',
                  key: 'cost',
                  align: 'right' as const,
                  render: (
                    value: number | null | undefined,
                    row: { bold?: boolean },
                  ) =>
                    row.bold ? (
                      <Typography.Text strong>{formatEtb(value)}</Typography.Text>
                    ) : (
                      formatEtb(value)
                    ),
                },
              ]}
              dataSource={budgetRows}
            />
          </div>

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
            <Table<BusinessTripPassenger>
              rowKey="id"
              columns={passengerColumns}
              dataSource={trip.passengers}
              pagination={false}
              size="small"
            />
          </div>

          {showTicketPanel ? (
            <BusinessTripTicketAssignmentPanel trip={trip} />
          ) : null}

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
            <AttachmentDownloadList documents={trip.documents} />
          </div>
        </div>

        {trip.approvalRequest ? (
          <ApprovalTierTimeline
            tiers={tiers}
            currentTier={trip.approvalRequest.currentTier ?? 0}
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
        title="Cancel business trip?"
        description="This will cancel the business trip. This cannot be undone."
        confirmLabel="Cancel trip"
        danger
        confirmLoading={cancelMutation.isPending}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => void handleCancel()}
      />
    </div>
  );
}
