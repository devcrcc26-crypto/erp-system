'use client';

import {
  Alert,
  Button,
  Descriptions,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import BusinessTripCurrentStepBanner from '@/components/modules/hr/business-trip/BusinessTripCurrentStepBanner';
import BusinessTripTicketAssignmentPanel from '@/components/modules/hr/business-trip/BusinessTripTicketAssignmentPanel';
import { useAppMessage } from '@/hooks/use-app-message';
import { ApiRequestError } from '@/lib/api/errors';
import type { BusinessTripPassenger } from '@/lib/api/business-trip.types';
import {
  useAcknowledgeBusinessTripTicket,
  useBusinessTrip,
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
 * Business trip body for the Approvals detail inbox (includes passenger ack).
 */
export default function BusinessTripDetail({
  sourceId,
}: {
  approvalRequestId: string;
  sourceId: string;
}): React.ReactNode {
  const messageApi = useAppMessage();
  const currentUser = useCurrentUser();
  const detailQuery = useBusinessTrip(sourceId);
  const trip = detailQuery.data;
  const acknowledgeTicket = useAcknowledgeBusinessTripTicket(sourceId);

  const currentUserPassenger = trip?.passengers.find(
    (p) => p.employeeId === currentUser.data?.id,
  );

  const canAcknowledge =
    Boolean(currentUserPassenger) &&
    currentUserPassenger?.acknowledgementStatus === 'PENDING' &&
    (Boolean(currentUserPassenger?.ticketDocumentId) ||
      Boolean(trip?.combinedTicketDocumentId));

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

  if (detailQuery.isLoading && !trip) {
    return (
      <div
        style={{
          background: tokens.colorCardBg,
          border: `1px solid ${tokens.colorBorder}`,
          borderRadius: 8,
          padding: 24,
        }}
      >
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
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
    <div
      style={{
        background: tokens.colorCardBg,
        border: `1px solid ${tokens.colorBorder}`,
        borderRadius: 8,
        padding: 24,
      }}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Typography.Title level={5} style={{ margin: 0 }}>
          Business trip
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
      </div>

      <div className="mb-4">
        <BusinessTripCurrentStepBanner trip={trip} />
      </div>

      {canAcknowledge && currentUserPassenger ? (
        <div
          className="mb-4 rounded-lg border px-4 py-3"
          style={{
            background: tokens.colorAmber50,
            borderColor: tokens.colorAmber400,
            color: tokens.colorAmber400,
          }}
        >
          <Typography.Text
            strong
            style={{
              display: 'block',
              marginBottom: 8,
              color: tokens.colorAmber400,
            }}
          >
            Your ticket is ready — please acknowledge receipt
          </Typography.Text>
          {trip.combinedTicket ? (
            <div className="mb-3">
              <Typography.Text
                type="secondary"
                style={{ display: 'block', marginBottom: 4, fontSize: 13 }}
              >
                Combined Ticket:
              </Typography.Text>
              <AttachmentDownloadList documents={[trip.combinedTicket]} />
            </div>
          ) : null}
          {currentUserPassenger.ticket ? (
            <div className="mb-3">
              <Typography.Text
                type="secondary"
                style={{ display: 'block', marginBottom: 4, fontSize: 13 }}
              >
                Your Ticket:
              </Typography.Text>
              <AttachmentDownloadList
                documents={[currentUserPassenger.ticket]}
              />
            </div>
          ) : null}
          <Button
            type="primary"
            loading={acknowledgeTicket.isPending}
            onClick={() => void handleAcknowledge()}
          >
            Acknowledge Receipt
          </Button>
        </div>
      ) : null}

      <Descriptions bordered size="small" column={2}>
        <Descriptions.Item label="Submitted by">
          {formatBusinessTripSubmitterName(trip.submitter)}
        </Descriptions.Item>
        <Descriptions.Item label="Trip #">{trip.tripNumber}</Descriptions.Item>
        <Descriptions.Item label="Route">
          <Space size={4}>
            {trip.originCity}, {trip.originCountry}
            <span style={{ color: tokens.colorTextSecondary }}>→</span>
            {trip.destinationCountry}
            {trip.destinationCity ? ` / ${trip.destinationCity}` : ''}
          </Space>
        </Descriptions.Item>
        <Descriptions.Item label="Ticket Class">
          {formatTicketClass(trip.ticketClass)}
        </Descriptions.Item>
        <Descriptions.Item label="Departure">
          {formatProjectDate(trip.departureDate)}
        </Descriptions.Item>
        {trip.returnDate ? (
          <Descriptions.Item label="Return">
            {formatProjectDate(trip.returnDate)}
          </Descriptions.Item>
        ) : null}
        <Descriptions.Item label="Accommodation">
          {trip.accommodationRequired ? (
            <>
              <Tag color="blue">Required</Tag>
              {trip.accommodationDetails ? (
                <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                  {trip.accommodationDetails}
                </Typography.Text>
              ) : null}
            </>
          ) : (
            'Not required'
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Per Diem">
          {trip.perDiemRequired ? (
            <Tag color="blue">Required</Tag>
          ) : (
            'Not required'
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Purpose" span={2}>
          {trip.purpose}
        </Descriptions.Item>
        {trip.hostOrganization ? (
          <Descriptions.Item label="Host Organization" span={2}>
            {trip.hostOrganization}
          </Descriptions.Item>
        ) : null}
        {trip.hostContact ? (
          <Descriptions.Item label="Host Contact" span={2}>
            {trip.hostContact}
          </Descriptions.Item>
        ) : null}
        {trip.expectedOutcomes ? (
          <Descriptions.Item label="Expected Outcomes" span={2}>
            {trip.expectedOutcomes}
          </Descriptions.Item>
        ) : null}
        {trip.itinerary ? (
          <Descriptions.Item label="Itinerary" span={2}>
            {trip.itinerary}
          </Descriptions.Item>
        ) : null}
        {trip.notes ? (
          <Descriptions.Item label="Notes" span={2}>
            {trip.notes}
          </Descriptions.Item>
        ) : null}
      </Descriptions>

      <Typography.Title level={5} style={{ marginTop: 24, marginBottom: 12 }}>
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
              row.bold ? (
                <Typography.Text strong>{value}</Typography.Text>
              ) : (
                value
              ),
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

      <Typography.Title level={5} style={{ marginTop: 24, marginBottom: 12 }}>
        Passengers ({trip.passengerCount})
      </Typography.Title>
      <Table<BusinessTripPassenger>
        rowKey="id"
        columns={passengerColumns}
        dataSource={trip.passengers}
        pagination={false}
        size="small"
      />

      {trip.status === 'APPROVED' ||
      trip.combinedTicketDocumentId ||
      trip.passengers.some((p) => p.ticketDocumentId) ? (
        <div style={{ marginTop: 24 }}>
          <BusinessTripTicketAssignmentPanel trip={trip} />
        </div>
      ) : null}

      {(trip.documents?.length ?? 0) > 0 ? (
        <>
          <Typography.Title level={5} style={{ marginTop: 24, marginBottom: 8 }}>
            Supporting Attachments
          </Typography.Title>
          <AttachmentDownloadList documents={trip.documents} />
        </>
      ) : null}
    </div>
  );
}
