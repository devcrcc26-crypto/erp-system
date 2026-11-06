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
  FlightApplicationDetail,
  FlightPassenger,
} from '@/lib/api/flight.types';
import {
  useAcknowledgeTicket,
  useAttachCombinedTicket,
  useAttachPassengerTicket,
  useRemoveFlightCombinedTicket,
  useRemoveFlightPassengerTicket,
} from '@/lib/query/flight';
import { useCurrentUser } from '@/lib/query/profile';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

const TICKET_ACCEPT = '.pdf,.jpg,.jpeg,.png';

function passengerTickets(row: FlightPassenger): NonNullable<
  FlightPassenger['tickets']
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
  passenger: FlightPassenger;
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
export default function FlightTicketAssignmentPanel({
  application,
}: {
  application: FlightApplicationDetail;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const canViewHr = useCanViewHr();
  const currentUser = useCurrentUser();
  const currentUserId = currentUser.data?.id ?? '';

  const attachCombined = useAttachCombinedTicket(application.id);
  const attachPassenger = useAttachPassengerTicket(application.id);
  const removeCombined = useRemoveFlightCombinedTicket(application.id);
  const removePassenger = useRemoveFlightPassengerTicket(application.id);
  const acknowledgeTicket = useAcknowledgeTicket(application.id);

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

  const isApproved = application.status === 'APPROVED';
  const canUpload = canViewHr && isApproved;
  const combinedTickets =
    application.combinedTickets && application.combinedTickets.length > 0
      ? application.combinedTickets
      : application.combinedTicket
        ? [application.combinedTicket]
        : [];
  const showCombinedUploader =
    canUpload && (combinedTickets.length === 0 || replacingCombined);

  const passengersWithOwnTicket = application.passengers.filter(
    (p) => Boolean(p.ticketDocumentId) || (p.tickets?.length ?? 0) > 0,
  ).length;
  const acknowledgedCount = application.passengers.filter(
    (p) => p.acknowledgementStatus === 'ACKNOWLEDGED',
  ).length;

  async function handleUploadCombined(files: File[]): Promise<void> {
    if (files.length === 0) {
      return;
    }
    setCombinedTicketFiles(files);
    try {
      await attachCombined.mutateAsync(files);
      messageApi.success(
        replacingCombined
          ? 'Combined ticket replaced'
          : files.length > 1
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

  async function handleUploadPassenger(
    passengerId: string,
    files: File[],
  ): Promise<void> {
    if (files.length === 0) {
      return;
    }
    setPassengerFiles((prev) => ({ ...prev, [passengerId]: files }));
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

  function renderPassengerActions(row: FlightPassenger): React.ReactNode {
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
            onChange={(files) => {
              void handleUploadPassenger(row.id, files);
            }}
            accept={TICKET_ACCEPT}
            multiple
            placeholder={t('hr.labels.attachTicket')}
            compact
            disabled={
              attachPassenger.isPending && uploadingPassengerId === row.id
            }
          />
        </div>
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
            {passengersWithOwnTicket}/{application.passengers.length}{' '}
            {t('hr.section.individualTickets')}
          </span>
          <span className="text-[var(--color-border-secondary)]">·</span>
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 size={12} />
            {acknowledgedCount}/{application.passengers.length}{' '}
            {t('hr.table.acknowledged')}
          </span>
        </div>
      </div>

      {/* Combined ticket */}
      <div className="border-b border-[rgba(0,0,0,0.06)] px-3 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-0.5">
              <FileText
                size={15}
                className="text-[var(--color-text-tertiary)] flex-shrink-0"
              />
              <h4 className="text-sm font-semibold text-[var(--color-text-primary)] m-0">
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
            <p className="text-xs text-[var(--color-text-tertiary)] ml-[23px] m-0">
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
              onChange={(files) => {
                void handleUploadCombined(files);
              }}
              accept={TICKET_ACCEPT}
              multiple
              placeholder={t('hr.buttons.uploadCombinedTicket')}
              disabled={attachCombined.isPending}
            />
            {replacingCombined ? (
              <div className="flex flex-wrap gap-2">
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
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-[var(--color-text-tertiary)] ml-0 sm:ml-[23px] m-0">
            {t('hr.empty.noTicket')}
          </p>
        )}
      </div>

      {/* Individual tickets */}
      <div>
        <div className="border-b border-[rgba(0,0,0,0.06)] bg-[var(--color-surface-secondary)] px-3 py-3 sm:px-5">
          <div className="flex items-center gap-2 mb-0.5">
            <Users
              size={15}
              className="text-[var(--color-text-tertiary)] flex-shrink-0"
            />
            <h4 className="text-sm font-semibold text-[var(--color-text-primary)] m-0">
              {t('hr.section.individualTickets')}
            </h4>
          </div>
          <p className="text-xs text-[var(--color-text-tertiary)] ml-[23px] m-0">
            {t('hr.labels.uploadTickets')}
          </p>
        </div>

        <ul className="m-0 list-none p-0 divide-y divide-[rgba(0,0,0,0.06)]">
          {application.passengers.map((row) => {
            const tickets = passengerTickets(row);
            const hasOwnTicket = tickets.length > 0;
            const hasTicket =
              hasOwnTicket || Boolean(application.combinedTicketDocumentId);

            return (
              <li key={row.id} className="px-3 py-4 sm:px-5">
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
