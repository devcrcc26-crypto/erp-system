'use client';

import {
  Alert,
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
import FlightCurrentStepBanner from '@/components/modules/hr/flight/FlightCurrentStepBanner';
import { ApiRequestError } from '@/lib/api/errors';
import type { FlightPassenger } from '@/lib/api/flight.types';
import { useFlightApplication } from '@/lib/query/flight';
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
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';

/**
 * Read-only flight application body for the Approvals detail inbox.
 */
export default function FlightApplicationDetail({
  sourceId,
}: {
  approvalRequestId: string;
  sourceId: string;
}): React.ReactNode {
  const detailQuery = useFlightApplication(sourceId);
  const application = detailQuery.data;

  if (detailQuery.isLoading && !application) {
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
          Flight application
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
      </div>

      <div className="mb-4">
        <FlightCurrentStepBanner application={application} />
      </div>

      <Descriptions bordered size="small" column={2}>
        <Descriptions.Item label="Submitted by">
          {formatFlightSubmitterName(application.submitter)}
        </Descriptions.Item>
        <Descriptions.Item label="Application #">
          {application.applicationNumber}
        </Descriptions.Item>
        <Descriptions.Item label="Route">
          <Space size={4}>
            {application.origin}
            <span style={{ color: tokens.colorTextSecondary }}>→</span>
            {application.destination}
          </Space>
        </Descriptions.Item>
        <Descriptions.Item label="Ticket Class">
          {formatTicketClass(application.ticketClass)}
        </Descriptions.Item>
        <Descriptions.Item label="Departure">
          {formatProjectDate(application.departureDate)}
        </Descriptions.Item>
        {application.returnDate ? (
          <Descriptions.Item label="Return">
            {formatProjectDate(application.returnDate)}
          </Descriptions.Item>
        ) : null}
        <Descriptions.Item label="Accommodation">
          {application.accommodationRequired ? (
            <>
              <Tag color="blue">Required</Tag>
              {application.accommodationDetails ? (
                <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
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

      <Typography.Title level={5} style={{ marginTop: 24, marginBottom: 12 }}>
        Passengers ({application.passengerCount})
      </Typography.Title>
      <Table<FlightPassenger>
        rowKey="id"
        columns={passengerColumns}
        dataSource={application.passengers}
        pagination={false}
        size="small"
      />

      {(application.documents?.length ?? 0) > 0 ? (
        <>
          <Typography.Title level={5} style={{ marginTop: 24, marginBottom: 8 }}>
            Supporting Attachments
          </Typography.Title>
          <AttachmentDownloadList documents={application.documents} />
        </>
      ) : null}
    </div>
  );
}
