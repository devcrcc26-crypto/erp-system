'use client';

import { useState } from 'react';
import { Button, Popconfirm, Tag } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { CheckCircle2, FileText, Ticket, Users } from 'lucide-react';
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
  useRemoveBusinessTripCombinedTicket,
  useRemoveBusinessTripPassengerTicket,
} from '@/lib/query/business-trip';
import { useCurrentUser } from '@/lib/query/profile';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';

const TICKET_ACCEPT = '.pdf,.jpg,.jpeg,.png';

function passengerTickets(row: BusinessTripPassenger): NonNullable<
  BusinessTripPassenger['tickets']
> {
  if (row.tickets && row.tickets.length > 0) {
    return row.tickets;
  }
  if (row.ticket) {
    return [row.ticket];
  }
  return [];
}

function AckStatus({
  passenger,
  hasTicket,
  currentUserId,
  acknowledgePending,
  acknowledgeVariables,
  onAcknowledge,
}: {
  passenger: BusinessTripPassenger;
  hasTicket: boolean;
  currentUserId: string;
  acknowledgePending: boolean;
  acknowledgeVariables: string | undefined;
  onAcknowledge: (passengerId: string) => void;
}): React.ReactNode {
  if (passenger.acknowledgementStatus === 'ACKNOWLEDGED') {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <Tag color="success" className="m-0">
          Acknowledged
        </Tag>
        {passenger.acknowledgedAt ? (
          <span className="text-xs text-[var(--color-text-tertiary)]">
            {formatProjectDate(passenger.acknowledgedAt)}
          </span>
        ) : null}
      </div>
    );
  }

  if (!hasTicket) {
    return <Tag className="m-0">Awaiting Ticket</Tag>;
  }

  if (currentUserId === passenger.employeeId) {
    return (
      <Button
        size="small"
        type="primary"
        loading={acknowledgePending && acknowledgeVariables === passenger.id}
        onClick={() => onAcknowledge(passenger.id)}
      >
        Acknowledge Receipt
      </Button>
    );
  }

  return (
    <Tag color="orange" className="m-0">
      Pending Ack
    </Tag>
  );
}

/**
 * Combined + per-passenger ticket upload, download, remove/replace, and acknowledge UI.
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
  const removeCombined = useRemoveBusinessTripCombinedTicket(trip.id);
  const removePassenger = useRemoveBusinessTripPassengerTicket(trip.id);
  const acknowledgeTicket = useAcknowledgeBusinessTripTicket(trip.id);

  const [combinedTicketFiles, setCombinedTicketFiles] = useState<File[]>([]);
  const [passengerFiles, setPassengerFiles] = useState<Record<string, File[]>>(
    {},
  );
  const [replacingCombined, setReplacingCombined] = useState(false);
  const [replacingPassengerId, setReplacingPassengerId] = useState<
    string | null
  >(null);
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

  const passengersWithOwnTicket = trip.passengers.filter(
    (p) => Boolean(p.ticketDocumentId) || (p.tickets?.length ?? 0) > 0,
  ).length;
  const acknowledgedCount = trip.passengers.filter(
    (p) => p.acknowledgementStatus === 'ACKNOWLEDGED',
  ).length;

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

  async function handleRemoveCombined(): Promise<void> {
    try {
      await removeCombined.mutateAsync();
      messageApi.success('Combined ticket removed');
      setReplacingCombined(false);
      setCombinedTicketFiles([]);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to remove combined ticket', messageApi);
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
        replacingPassengerId === passengerId
          ? 'Passenger ticket replaced'
          : files.length > 1
            ? 'Passenger tickets uploaded'
            : 'Passenger ticket uploaded',
      );
      setPassengerFiles((prev) => {
        const next = { ...prev };
        delete next[passengerId];
        return next;
      });
      setReplacingPassengerId(null);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to upload passenger ticket', messageApi);
    } finally {
      setUploadingPassengerId(null);
    }
  }

  async function handleRemovePassenger(passengerId: string): Promise<void> {
    try {
      await removePassenger.mutateAsync(passengerId);
      messageApi.success('Passenger ticket removed');
      setReplacingPassengerId(null);
      setPassengerFiles((prev) => {
        const next = { ...prev };
        delete next[passengerId];
        return next;
      });
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to remove passenger ticket', messageApi);
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

  function renderPassengerActions(row: BusinessTripPassenger): React.ReactNode {
    if (!canUpload) {
      return null;
    }

    const pending = passengerFiles[row.id] ?? [];
    const hasTicket = Boolean(row.ticketDocumentId);
    const isReplacing = replacingPassengerId === row.id;

    if (hasTicket && !isReplacing) {
      return (
        <div className="flex flex-wrap gap-2">
          <Button
            size="small"
            onClick={() => {
              setReplacingPassengerId(row.id);
              setPassengerFiles((prev) => ({
                ...prev,
                [row.id]: [],
              }));
            }}
          >
            Replace
          </Button>
          <Popconfirm
            title="Remove ticket?"
            description="Passenger acknowledgement will be reset."
            okText="Remove"
            okButtonProps={{ danger: true }}
            onConfirm={() => void handleRemovePassenger(row.id)}
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              loading={
                removePassenger.isPending &&
                removePassenger.variables === row.id
              }
            >
              Remove
            </Button>
          </Popconfirm>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:flex-wrap">
        <div className="min-w-0 flex-1 sm:max-w-xs">
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
            placeholder="Choose ticket files"
            compact
            disabled={
              attachPassenger.isPending && uploadingPassengerId === row.id
            }
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {pending.length > 0 ? (
            <Button
              size="small"
              type="primary"
              loading={
                attachPassenger.isPending && uploadingPassengerId === row.id
              }
              onClick={() => void handleUploadPassenger(row.id)}
            >
              {isReplacing ? 'Upload Replacement' : 'Upload'}
            </Button>
          ) : null}
          {isReplacing ? (
            <Button
              size="small"
              disabled={attachPassenger.isPending}
              onClick={() => {
                setReplacingPassengerId(null);
                setPassengerFiles((prev) => {
                  const next = { ...prev };
                  delete next[row.id];
                  return next;
                });
              }}
            >
              Cancel
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden">
      <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.06)] flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
          Tickets
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
          <span className="inline-flex items-center gap-1">
            <Ticket size={12} />
            {combinedTickets.length > 0
              ? `${combinedTickets.length} combined`
              : 'No combined'}
          </span>
          <span className="text-[var(--color-border-secondary)]">·</span>
          <span className="inline-flex items-center gap-1">
            <Users size={12} />
            {passengersWithOwnTicket}/{trip.passengers.length} individual
          </span>
          <span className="text-[var(--color-border-secondary)]">·</span>
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 size={12} />
            {acknowledgedCount}/{trip.passengers.length} acknowledged
          </span>
        </div>
      </div>

      {/* Combined ticket */}
      <div className="px-5 py-4 border-b border-[rgba(0,0,0,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <FileText
                size={15}
                className="text-[var(--color-text-tertiary)] flex-shrink-0"
              />
              <h4 className="text-sm font-semibold text-[var(--color-text-primary)] m-0">
                Combined Ticket
              </h4>
              {combinedTickets.length > 0 && !replacingCombined ? (
                <Tag color="green" className="m-0">
                  Attached
                </Tag>
              ) : (
                <Tag className="m-0">Not attached</Tag>
              )}
            </div>
            <p className="text-xs text-[var(--color-text-tertiary)] ml-[23px]">
              One or more files covering all passengers
            </p>
          </div>
          {canUpload && combinedTickets.length > 0 && !replacingCombined ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="small"
                onClick={() => {
                  setReplacingCombined(true);
                  setCombinedTicketFiles([]);
                }}
              >
                Replace
              </Button>
              <Popconfirm
                title="Remove combined ticket?"
                description="All passenger acknowledgements will be reset."
                okText="Remove"
                okButtonProps={{ danger: true }}
                onConfirm={() => void handleRemoveCombined()}
              >
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  loading={removeCombined.isPending}
                >
                  Remove
                </Button>
              </Popconfirm>
            </div>
          ) : null}
        </div>

        {combinedTickets.length > 0 && !replacingCombined ? (
          <div className="ml-0 sm:ml-[23px]">
            <AttachmentDownloadList documents={combinedTickets} />
          </div>
        ) : showCombinedUploader ? (
          <div className="ml-0 sm:ml-[23px] flex flex-col gap-2">
            <FileUploadInput
              files={combinedTicketFiles}
              onChange={setCombinedTicketFiles}
              accept={TICKET_ACCEPT}
              multiple
              placeholder="Upload combined ticket files (PDF or image)"
              disabled={attachCombined.isPending}
            />
            {combinedTicketFiles.length > 0 || replacingCombined ? (
              <div className="flex flex-wrap gap-2">
                {combinedTicketFiles.length > 0 ? (
                  <Button
                    type="primary"
                    size="small"
                    loading={attachCombined.isPending}
                    onClick={() => void handleUploadCombined()}
                  >
                    {replacingCombined
                      ? 'Upload Replacement'
                      : 'Upload Combined Ticket'}
                  </Button>
                ) : null}
                {replacingCombined ? (
                  <Button
                    size="small"
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
          </div>
        ) : (
          <p className="text-sm text-[var(--color-text-tertiary)] ml-0 sm:ml-[23px]">
            No combined ticket attached yet.
          </p>
        )}
      </div>

      {/* Individual tickets */}
      <div>
        <div className="px-5 py-3 bg-[var(--color-surface-secondary)] border-b border-[rgba(0,0,0,0.06)]">
          <div className="flex items-center gap-2 mb-0.5">
            <Users
              size={15}
              className="text-[var(--color-text-tertiary)] flex-shrink-0"
            />
            <h4 className="text-sm font-semibold text-[var(--color-text-primary)] m-0">
              Individual Tickets
            </h4>
          </div>
          <p className="text-xs text-[var(--color-text-tertiary)] ml-[23px]">
            Assign ticket files per passenger when not covered by the combined
            ticket
          </p>
        </div>

        <ul className="m-0 list-none p-0 divide-y divide-[rgba(0,0,0,0.06)]">
          {trip.passengers.map((row) => {
            const tickets = passengerTickets(row);
            const hasOwnTicket = tickets.length > 0;
            const hasTicket =
              hasOwnTicket || Boolean(trip.combinedTicketDocumentId);

            return (
              <li key={row.id} className="px-5 py-4">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text-primary)] m-0">
                        {row.employee
                          ? formatUserName(row.employee)
                          : row.employeeId}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {hasOwnTicket ? (
                          <Tag color="green" className="m-0">
                            Own ticket
                          </Tag>
                        ) : combinedTickets.length > 0 ? (
                          <Tag color="blue" className="m-0">
                            Covered by combined
                          </Tag>
                        ) : (
                          <Tag className="m-0">No ticket</Tag>
                        )}
                      </div>
                    </div>
                    <AckStatus
                      passenger={row}
                      hasTicket={hasTicket}
                      currentUserId={currentUserId}
                      acknowledgePending={acknowledgeTicket.isPending}
                      acknowledgeVariables={acknowledgeTicket.variables}
                      onAcknowledge={(id) => void handleAcknowledge(id)}
                    />
                  </div>

                  {hasOwnTicket ? (
                    <div className="rounded-md border border-[rgba(0,0,0,0.06)] bg-[var(--color-page-bg)] p-2.5">
                      <AttachmentDownloadList
                        documents={tickets}
                        emptyLabel="No ticket"
                      />
                    </div>
                  ) : null}

                  {renderPassengerActions(row)}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
