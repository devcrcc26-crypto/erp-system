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
import { useEpcTranslation } from '@/hooks/use-epc-translation';

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
  const { t } = useEpcTranslation();
  if (passenger.acknowledgementStatus === 'ACKNOWLEDGED') {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <Tag color="success" className="m-0">
          {t('hr.acknowledgement.ACKNOWLEDGED')}
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
    return <Tag className="m-0">{t('hr.labels.pending')}</Tag>;
  }

  if (currentUserId === passenger.employeeId) {
    return (
      <Button
        size="small"
        type="primary"
        loading={acknowledgePending && acknowledgeVariables === passenger.id}
        onClick={() => onAcknowledge(passenger.id)}
      >
        {t('hr.buttons.acknowledgeReceipt')}
      </Button>
    );
  }

  return (
    <Tag color="orange" className="m-0">
      {t('hr.acknowledgement.PENDING')}
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
  const { t } = useEpcTranslation();
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
            {t('hr.buttons.replaceTicket')}
          </Button>
          <Popconfirm
            title={t('hr.labels.removeTicket')}
            description={t('hr.labels.removeTicketDesc')}
            okText={t('hr.labels.remove')}
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
              {t('hr.buttons.removeTicket')}
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
            placeholder={t('hr.labels.attachTicket')}
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
              {isReplacing
                ? t('hr.buttons.replaceTicket')
                : t('hr.buttons.uploadTicket')}
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
              {t('hr.buttons.cancel')}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="erp-employee-section overflow-hidden">
      <div className="erp-employee-section-header flex flex-wrap items-center justify-between gap-2">
        <h3 className="erp-employee-section-title m-0">
          {t('hr.table.ticket')}
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
          <span className="inline-flex items-center gap-1">
            <Ticket size={12} />
            {combinedTickets.length > 0
              ? t('hr.section.combinedTicket')
              : t('hr.empty.noTicket')}
          </span>
          <span className="text-[var(--color-border-secondary)]">·</span>
          <span className="inline-flex items-center gap-1">
            <Users size={12} />
            {passengersWithOwnTicket}/{trip.passengers.length}{' '}
            {t('hr.section.individualTickets')}
          </span>
          <span className="text-[var(--color-border-secondary)]">·</span>
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 size={12} />
            {acknowledgedCount}/{trip.passengers.length}{' '}
            {t('hr.table.acknowledged')}
          </span>
        </div>
      </div>

      {/* Combined ticket */}
      <div className="border-b border-[rgba(0,0,0,0.06)] px-3 py-4 sm:px-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-0.5 flex flex-wrap items-center gap-2">
              <FileText
                size={15}
                className="flex-shrink-0 text-[var(--color-text-tertiary)]"
              />
              <h4 className="m-0 text-sm font-semibold text-[var(--color-text-primary)]">
                {t('hr.section.combinedTicket')}
              </h4>
              {combinedTickets.length > 0 && !replacingCombined ? (
                <Tag color="green" className="m-0">
                  {t('hr.labels.combinedTicket')}
                </Tag>
              ) : (
                <Tag className="m-0">{t('hr.empty.noTicket')}</Tag>
              )}
            </div>
            <p className="m-0 ml-[23px] text-xs text-[var(--color-text-tertiary)]">
              {t('hr.labels.uploadTickets')}
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
                {t('hr.buttons.replaceTicket')}
              </Button>
              <Popconfirm
                title={t('hr.labels.removeCombinedTicket')}
                description={t('hr.labels.removeCombinedTicketDesc')}
                okText={t('hr.labels.remove')}
                okButtonProps={{ danger: true }}
                onConfirm={() => void handleRemoveCombined()}
              >
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  loading={removeCombined.isPending}
                >
                  {t('hr.buttons.removeTicket')}
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
              placeholder={t('hr.buttons.uploadCombinedTicket')}
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
                      ? t('hr.buttons.replaceTicket')
                      : t('hr.buttons.uploadCombinedTicket')}
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
                    {t('hr.buttons.cancel')}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="m-0 ml-0 text-sm text-[var(--color-text-tertiary)] sm:ml-[23px]">
            {t('hr.empty.noTicket')}
          </p>
        )}
      </div>

      {/* Individual tickets */}
      <div>
        <div className="border-b border-[rgba(0,0,0,0.06)] bg-[var(--color-surface-secondary)] px-3 py-3 sm:px-5">
          <div className="mb-0.5 flex items-center gap-2">
            <Users
              size={15}
              className="flex-shrink-0 text-[var(--color-text-tertiary)]"
            />
            <h4 className="m-0 text-sm font-semibold text-[var(--color-text-primary)]">
              {t('hr.section.individualTickets')}
            </h4>
          </div>
          <p className="m-0 ml-[23px] text-xs text-[var(--color-text-tertiary)]">
            {t('hr.labels.uploadTickets')}
          </p>
        </div>

        <ul className="m-0 list-none divide-y divide-[rgba(0,0,0,0.06)] p-0">
          {trip.passengers.map((row) => {
            const tickets = passengerTickets(row);
            const hasOwnTicket = tickets.length > 0;
            const hasTicket =
              hasOwnTicket || Boolean(trip.combinedTicketDocumentId);

            return (
              <li key={row.id} className="px-3 py-4 sm:px-5">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="m-0 text-sm font-medium text-[var(--color-text-primary)]">
                        {row.employee
                          ? formatUserName(row.employee)
                          : row.employeeId}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {hasOwnTicket ? (
                          <Tag color="green" className="m-0">
                            {t('hr.table.ticket')}
                          </Tag>
                        ) : combinedTickets.length > 0 ? (
                          <Tag color="blue" className="m-0">
                            {t('hr.labels.coveredByCombined')}
                          </Tag>
                        ) : (
                          <Tag className="m-0">{t('hr.labels.noTicket')}</Tag>
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
                        emptyLabel={t('hr.empty.noTicket')}
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
