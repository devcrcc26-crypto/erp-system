'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Skeleton, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import FlightCurrentStepBanner from '@/components/modules/hr/flight/FlightCurrentStepBanner';
import FlightTicketAssignmentPanel from '@/components/modules/hr/flight/FlightTicketAssignmentPanel';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useCanManageFlight,
  useCanViewHr,
} from '@/hooks/use-auth-capabilities';
import { ApiRequestError } from '@/lib/api/errors';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import type { FlightPassenger } from '@/lib/api/flight.types';
import {
  useCancelFlightApplication,
  useFlightApplication,
} from '@/lib/query/flight';
import { useCurrentUser } from '@/lib/query/profile';
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
  const canViewHr = useCanViewHr();

  const detailQuery = useFlightApplication(applicationId);
  const cancelMutation = useCancelFlightApplication(applicationId);

  const [confirmCancel, setConfirmCancel] = useState(false);

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

  const showTicketPanel =
    application?.status === 'APPROVED' ||
    Boolean(application?.combinedTicketDocumentId) ||
    (application?.passengers.some((p) => p.ticketDocumentId) ?? false);

  async function handleCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success('Flight application cancelled');
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to cancel flight application', messageApi);
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
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Page header */}
      <div className="mb-2">
        <button
          onClick={() => router.push('/hr/flight-applications')}
          className="flex items-center gap-1.5 text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] mb-3 transition-colors"
        >
          <ArrowLeft size={14} />
          <span>Flight Applications</span>
        </button>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
              Flight Applications · {application.applicationNumber}
            </p>
            <h1 className="text-xl font-semibold text-[var(--color-text-primary)] leading-tight">
              {formatTripType(application.tripType)}
              {application.isInternational ? ' · International' : ''}
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
              {formatFlightSubmitterName(application.submitter)}
              {' · '}
              {formatProjectDate(application.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge
              label={formatFlightStatus(application.status)}
              variant={flightStatusVariant(application.status)}
            />
            <StatusBadge
              label={formatTripType(application.tripType)}
              variant={tripTypeVariant(application.tripType)}
            />
            {application.approvalRequestId ? (
              <Button
                size="small"
                onClick={() =>
                  router.push(`/approvals/${application.approvalRequestId}`)
                }
              >
                View in Approvals
              </Button>
            ) : null}
            {canCancel ? (
              <Button danger size="small" onClick={() => setConfirmCancel(true)}>
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <FlightCurrentStepBanner application={application} />

      {application.status === 'APPROVED' &&
      (canViewHr || canManage) &&
      application.needsTicketAttachment ? (
        <Alert
          type="info"
          showIcon
          message="Tickets required"
          description="The application is approved. Upload a combined ticket and/or individual passenger tickets below."
        />
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)]">
            <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.06)]">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                Trip Details
              </h3>
            </div>
            <div className="px-5 py-4">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div className="col-span-2">
                  <dt className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                    Route
                  </dt>
                  <dd className="text-sm text-[var(--color-text-primary)]">
                    {application.originCity}, {application.originCountry}
                    <span className="mx-1.5 text-[var(--color-text-tertiary)]">
                      to
                    </span>
                    {application.destination}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                    Trip Type
                  </dt>
                  <dd className="text-sm text-[var(--color-text-primary)]">
                    {formatTripType(application.tripType)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                    Ticket Class
                  </dt>
                  <dd className="text-sm text-[var(--color-text-primary)]">
                    {formatTicketClass(application.ticketClass)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                    Departure
                  </dt>
                  <dd className="text-sm text-[var(--color-text-primary)]">
                    {formatProjectDate(application.departureDate)}
                  </dd>
                </div>
                {application.returnDate ? (
                  <div>
                    <dt className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                      Return
                    </dt>
                    <dd className="text-sm text-[var(--color-text-primary)]">
                      {formatProjectDate(application.returnDate)}
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                    Passengers
                  </dt>
                  <dd className="text-sm text-[var(--color-text-primary)]">
                    {application.passengerCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                    Accommodation
                  </dt>
                  <dd className="text-sm text-[var(--color-text-primary)]">
                    {application.accommodationRequired ? (
                      <>
                        <Tag color="blue">Required</Tag>
                        {application.accommodationDetails ? (
                          <span className="ml-2 text-[var(--color-text-secondary)]">
                            {application.accommodationDetails}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      'Not required'
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                    Per Diem
                  </dt>
                  <dd className="text-sm text-[var(--color-text-primary)]">
                    {application.perDiemRequired ? (
                      <Tag color="blue">Required</Tag>
                    ) : (
                      'Not required'
                    )}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                    Purpose
                  </dt>
                  <dd className="text-sm text-[var(--color-text-primary)]">
                    {application.purpose}
                  </dd>
                </div>
                {application.notes ? (
                  <div className="col-span-2">
                    <dt className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                      Notes
                    </dt>
                    <dd className="text-sm text-[var(--color-text-primary)]">
                      {application.notes}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)]">
            <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.06)]">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                Passengers
              </h3>
            </div>
            <div className="px-5 py-4">
              <Table<FlightPassenger>
                rowKey="id"
                columns={passengerColumns}
                dataSource={application.passengers}
                pagination={false}
                size="small"
              />
            </div>
          </div>

          {showTicketPanel ? (
            <FlightTicketAssignmentPanel application={application} />
          ) : null}

          <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)]">
            <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.06)]">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                Supporting Attachments
              </h3>
            </div>
            <div className="px-5 py-4">
              <AttachmentDownloadList documents={application.documents} />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {application.approvalRequest ? (
            <ApprovalTierTimeline
              tiers={tiers}
              currentTier={application.approvalRequest.currentTier ?? 0}
            />
          ) : (
            <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)]">
              <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.06)]">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                  Approval Chain
                </h3>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm text-[var(--color-text-tertiary)]">
                  No approval workflow linked.
                </p>
              </div>
            </div>
          )}
        </div>
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
