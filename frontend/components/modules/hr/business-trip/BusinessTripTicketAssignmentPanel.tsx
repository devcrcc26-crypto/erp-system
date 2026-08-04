'use client';

import { useState } from 'react';
import { Button, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import type {
  BusinessTripDetail,
  BusinessTripPassenger,
} from '@/lib/api/business-trip.types';
import {
  useAcknowledgeBusinessTripTicket,
  useAttachBusinessTripCombinedTicket,
  useAttachBusinessTripPassengerTicket,
} from '@/lib/query/business-trip';
import { useCurrentUser } from '@/lib/query/profile';
import { tokens } from '@/lib/theme/tokens';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';

const TICKET_ACCEPT = '.pdf,.jpg,.jpeg,.png';

/**
 * Combined + per-passenger ticket upload, download, and acknowledge UI.
 */
export default function BusinessTripTicketAssignmentPanel({
  trip,
}: {
  trip: BusinessTripDetail;
}): React.ReactNode {
  const messageApi = useAppMessage();
  const canViewHr = useCanViewHr();
  const currentUser = useCurrentUser();
  const currentUserId = currentUser.data?.id ?? '';

  const attachCombined = useAttachBusinessTripCombinedTicket(trip.id);
  const attachPassenger = useAttachBusinessTripPassengerTicket(trip.id);
  const acknowledgeTicket = useAcknowledgeBusinessTripTicket(trip.id);

  const [combinedTicketFiles, setCombinedTicketFiles] = useState<File[]>([]);
  const [passengerFiles, setPassengerFiles] = useState<Record<string, File[]>>(
    {},
  );
  const [replacingCombined, setReplacingCombined] = useState(false);
  const [uploadingPassengerId, setUploadingPassengerId] = useState<
    string | null
  >(null);

  const isApproved = trip.status === 'APPROVED';
  const canUpload = canViewHr && isApproved;
  const combinedTickets =
    trip.combinedTickets && trip.combinedTickets.length > 0
      ? trip.combinedTickets
      : trip.combinedTicket
        ? [trip.combinedTicket]
        : [];
  const showCombinedUploader =
    canUpload && (combinedTickets.length === 0 || replacingCombined);

  async function handleUploadCombined(): Promise<void> {
    if (combinedTicketFiles.length === 0) {
      return;
    }
    try {
      await attachCombined.mutateAsync(combinedTicketFiles);
      messageApi.success(
        replacingCombined
          ? 'Combined ticket replaced'
          : combinedTicketFiles.length > 1
            ? 'Combined tickets uploaded'
            : 'Combined ticket uploaded',
      );
      setCombinedTicketFiles([]);
      setReplacingCombined(false);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to upload combined ticket', messageApi);
    }
  }

  async function handleUploadPassenger(passengerId: string): Promise<void> {
    const files = passengerFiles[passengerId] ?? [];
    if (files.length === 0) {
      return;
    }
    setUploadingPassengerId(passengerId);
    try {
      await attachPassenger.mutateAsync({ passengerId, files });
      messageApi.success(
        files.length > 1
          ? 'Passenger tickets uploaded'
          : 'Passenger ticket uploaded',
      );
      setPassengerFiles((prev) => {
        const next = { ...prev };
        delete next[passengerId];
        return next;
      });
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to upload passenger ticket', messageApi);
    } finally {
      setUploadingPassengerId(null);
    }
  }

  async function handleAcknowledge(passengerId: string): Promise<void> {
    try {
      await acknowledgeTicket.mutateAsync(passengerId);
      messageApi.success('Ticket acknowledged');
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to acknowledge ticket', messageApi);
    }
  }

  const passengerColumns: ColumnsType<BusinessTripPassenger> = [
    {
      title: 'Passenger',
      key: 'passenger',
      render: (_: unknown, row: BusinessTripPassenger) =>
        row.employee ? formatUserName(row.employee) : row.employeeId,
    },
    {
      title: 'Ticket',
      key: 'ticket',
      render: (_: unknown, row: BusinessTripPassenger) => {
        const tickets =
          row.tickets && row.tickets.length > 0
            ? row.tickets
            : row.ticket
              ? [row.ticket]
              : [];
        if (tickets.length > 0) {
          return (
            <AttachmentDownloadList
              documents={tickets}
              emptyLabel="No ticket"
            />
          );
        }
        if (combinedTickets.length > 0) {
          return <Tag color="blue">Covered by combined ticket</Tag>;
        }
        return (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            No ticket
          </Typography.Text>
        );
      },
    },
    {
      title: 'Acknowledged',
      key: 'acknowledged',
      width: 180,
      render: (_: unknown, row: BusinessTripPassenger) => {
        const hasTicket =
          Boolean(row.ticketDocumentId) ||
          Boolean(trip.combinedTicketDocumentId);

        if (row.acknowledgementStatus === 'ACKNOWLEDGED') {
          return (
            <span className="flex flex-col gap-0.5">
              <Tag color="success">Acknowledged</Tag>
              {row.acknowledgedAt ? (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {formatProjectDate(row.acknowledgedAt)}
                </Typography.Text>
              ) : null}
            </span>
          );
        }

        if (!hasTicket) {
          return <Tag>Awaiting Ticket</Tag>;
        }

        if (currentUserId === row.employeeId) {
          return (
            <Button
              size="small"
              type="primary"
              loading={
                acknowledgeTicket.isPending &&
                acknowledgeTicket.variables === row.id
              }
              onClick={() => void handleAcknowledge(row.id)}
            >
              Acknowledge Receipt
            </Button>
          );
        }

        return <Tag color="orange">Pending</Tag>;
      },
    },
    ...(canUpload
      ? [
          {
            title: 'Action',
            key: 'action',
            width: 220,
            render: (_: unknown, row: BusinessTripPassenger) => {
              const pending = passengerFiles[row.id] ?? [];
              return (
                <div className="flex flex-col gap-1">
                  <FileUploadInput
                    files={pending}
                    onChange={(files) =>
                      setPassengerFiles((prev) => ({
                        ...prev,
                        [row.id]: files,
                      }))
                    }
                    accept={TICKET_ACCEPT}
                    multiple
                    placeholder="Upload tickets"
                    compact
                    disabled={
                      attachPassenger.isPending &&
                      uploadingPassengerId === row.id
                    }
                  />
                  {pending.length > 0 ? (
                    <Button
                      size="small"
                      type="primary"
                      loading={
                        attachPassenger.isPending &&
                        uploadingPassengerId === row.id
                      }
                      onClick={() => void handleUploadPassenger(row.id)}
                    >
                      {row.ticketDocumentId ? 'Replace' : 'Upload'}
                    </Button>
                  ) : null}
                </div>
              );
            },
          } satisfies ColumnsType<BusinessTripPassenger>[number],
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div
        className="rounded-lg border p-4"
        style={{
          borderColor: tokens.colorBorder,
          background: tokens.colorCardBg,
        }}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Typography.Text strong>Combined Ticket</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            One or more files covering all passengers
          </Typography.Text>
        </div>

        {combinedTickets.length > 0 && !replacingCombined ? (
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <AttachmentDownloadList documents={combinedTickets} />
            </div>
            {canUpload ? (
              <Button
                size="small"
                onClick={() => {
                  setReplacingCombined(true);
                  setCombinedTicketFiles([]);
                }}
              >
                Replace
              </Button>
            ) : null}
          </div>
        ) : showCombinedUploader ? (
          <>
            <FileUploadInput
              files={combinedTicketFiles}
              onChange={setCombinedTicketFiles}
              accept={TICKET_ACCEPT}
              multiple
              placeholder="Upload combined ticket files (PDF or image)"
              disabled={attachCombined.isPending}
            />
            {combinedTicketFiles.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="primary"
                  loading={attachCombined.isPending}
                  onClick={() => void handleUploadCombined()}
                >
                  {replacingCombined
                    ? 'Upload Replacement'
                    : 'Upload Combined Ticket'}
                </Button>
                {replacingCombined ? (
                  <Button
                    disabled={attachCombined.isPending}
                    onClick={() => {
                      setReplacingCombined(false);
                      setCombinedTicketFiles([]);
                    }}
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            No combined ticket attached yet
          </Typography.Text>
        )}
      </div>

      <div
        className="rounded-lg border p-4"
        style={{
          borderColor: tokens.colorBorder,
          background: tokens.colorCardBg,
        }}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Typography.Text strong>Individual Tickets</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            Assign ticket files per passenger
          </Typography.Text>
        </div>
        <Table<BusinessTripPassenger>
          rowKey="id"
          size="small"
          pagination={false}
          columns={passengerColumns}
          dataSource={trip.passengers}
          scroll={{ x: true }}
        />
      </div>
    </div>
  );
}
