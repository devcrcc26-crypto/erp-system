'use client';

import { useState } from 'react';
import { Alert, Button, Descriptions, Drawer } from 'antd';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { ApiRequestError } from '@/lib/api/errors';
import type { CorrespondenceDirection } from '@/lib/api/project-management.types';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcCapabilities, usePmCapabilities } from '@/hooks/use-pm-capabilities';
import {
  useAcknowledgeCorrespondence,
  useCloseCorrespondence,
  useCorrespondenceItem,
  useMarkCorrespondenceSent,
} from '@/lib/query/correspondence';
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  correspondenceDirectionVariant,
  correspondenceStatusVariant,
  formatCorrespondenceDirection,
  formatCorrespondenceStatus,
} from '@/lib/utils/pm-status-display';
import {
  formatCorrespondenceAcknowledgedAttribution,
  formatCorrespondenceRecordedAttribution,
  formatCorrespondenceSentAttribution,
} from '@/lib/utils/correspondence-attribution';
import { notifyApiError } from '@/lib/utils/notify-api-error';

export default function CorrespondenceDetailDrawer({
  projectId,
  correspondenceId,
  onClose,
  onUpdated,
  onNavigateTo,
  onOpenCreateResponse,
}: {
  projectId: string;
  correspondenceId: string | null;
  onClose: () => void;
  onUpdated: () => void;
  onNavigateTo?: (id: string) => void;
  onOpenCreateResponse?: (opts: {
    parentId: string;
    direction: CorrespondenceDirection;
  }) => void;
}): React.ReactNode {
  const [sendOpen, setSendOpen] = useState(false);
  const [ackOpen, setAckOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const open = Boolean(correspondenceId);
  const messageApi = useAppMessage();
  const pm = usePmCapabilities();
  const epc = useEpcCapabilities();

  const itemQuery = useCorrespondenceItem(projectId, correspondenceId ?? '', open);
  const markSent = useMarkCorrespondenceSent();
  const acknowledge = useAcknowledgeCorrespondence();
  const closeItem = useCloseCorrespondence();

  const item = itemQuery.data;
  const canEdit = epc.navFullAccess || pm.correspondence.canEdit;
  const canCreate = epc.navFullAccess || pm.correspondence.canCreate;
  const canUploadAttachments = item !== undefined && item.status !== 'CLOSED';
  const oppositeDirection: CorrespondenceDirection =
    item?.direction === 'INCOMING' ? 'OUTGOING' : 'INCOMING';

  async function refresh(): Promise<void> {
    onUpdated();
    await itemQuery.refetch();
  }

  async function handleMarkSent(): Promise<void> {
    if (!correspondenceId) return;
    try {
      await markSent.mutateAsync({ projectId, correspondenceId });
      messageApi.success('Correspondence marked as sent');
      setSendOpen(false);
      await refresh();
    } catch (error) {
      notifyApiError(error, 'Failed to mark correspondence as sent', messageApi);
    }
  }

  async function handleAcknowledge(): Promise<void> {
    if (!correspondenceId) return;
    try {
      await acknowledge.mutateAsync({ projectId, correspondenceId });
      messageApi.success('Acknowledgement recorded');
      setAckOpen(false);
      await refresh();
    } catch (error) {
      notifyApiError(error, 'Failed to record acknowledgement', messageApi);
    }
  }

  async function handleClose(): Promise<void> {
    if (!correspondenceId) return;
    try {
      await closeItem.mutateAsync({ projectId, correspondenceId });
      messageApi.success('Correspondence closed');
      setCloseConfirmOpen(false);
      await refresh();
    } catch (error) {
      notifyApiError(error, 'Failed to close correspondence', messageApi);
    }
  }

  return (
    <>
      <Drawer
        {...wideDetailDrawerProps}
        open={open}
        onClose={onClose}
        title={
          item ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[14px] font-semibold">
                {item.referenceNumber}
              </span>
              <StatusBadge
                label={formatCorrespondenceStatus(item.status)}
                variant={correspondenceStatusVariant(item.status)}
              />
              <StatusBadge
                label={formatCorrespondenceDirection(item.direction)}
                variant={correspondenceDirectionVariant(item.direction)}
              />
            </div>
          ) : (
            'Correspondence'
          )
        }
        destroyOnHidden
      >
        {itemQuery.isLoading && (
          <div className="flex flex-col gap-3">
            <div className="erp-page-skeleton h-10 w-full rounded" />
            <div className="erp-page-skeleton h-10 w-full rounded" />
            <div className="erp-page-skeleton h-32 w-full rounded" />
          </div>
        )}
        {itemQuery.isError && (
          <p className={layout.drawerMutedText}>
            {itemQuery.error instanceof ApiRequestError
              ? itemQuery.error.message
              : 'Unable to load correspondence.'}
          </p>
        )}
        {item && (
          <div className={layout.drawerStack}>
            <section className={layout.drawerSection}>
              <p className={`mb-2 ${layout.drawerHeading}`}>Details</p>
              <Descriptions
                className={layout.drawerDescriptionsClass}
                column={1}
                size="small"
                bordered
              >
                <Descriptions.Item label="Direction">
                  <StatusBadge
                    label={formatCorrespondenceDirection(item.direction)}
                    variant={correspondenceDirectionVariant(item.direction)}
                  />
                </Descriptions.Item>
                <Descriptions.Item label="Type">
                  {item.correspondenceType.replace(/_/g, ' ')}
                </Descriptions.Item>
                <Descriptions.Item label="Subject">
                  {item.subject}
                </Descriptions.Item>
                <Descriptions.Item label="Date">
                  {formatProjectDate(item.correspondenceDate)}
                </Descriptions.Item>
                <Descriptions.Item label="From">
                  {item.senderName}
                  {item.senderCompany ? ` (${item.senderCompany})` : ''}
                </Descriptions.Item>
                <Descriptions.Item label="To">
                  {item.recipientName}
                  {item.recipientCompany ? ` (${item.recipientCompany})` : ''}
                </Descriptions.Item>
                <Descriptions.Item label="Status">
                  <StatusBadge
                    label={formatCorrespondenceStatus(item.status)}
                    variant={correspondenceStatusVariant(item.status)}
                  />
                </Descriptions.Item>
                <Descriptions.Item label="Recorded">
                  {formatCorrespondenceRecordedAttribution(item)}
                  {item.createdAt
                    ? ` · ${formatProjectDate(item.createdAt)}`
                    : ''}
                </Descriptions.Item>
                {item.sentAt && (
                  <Descriptions.Item label="Sent">
                    {formatCorrespondenceSentAttribution(item)}
                    {` · ${formatProjectDate(item.sentAt)}`}
                  </Descriptions.Item>
                )}
                {item.acknowledgedAt && (
                  <Descriptions.Item label="Acknowledged">
                    {formatCorrespondenceAcknowledgedAttribution(item)}
                    {` · ${formatProjectDate(item.acknowledgedAt)}`}
                  </Descriptions.Item>
                )}
              </Descriptions>
            </section>

            {item.notes && (
              <section className={layout.drawerSection}>
                <p className={`mb-2 ${layout.drawerHeading}`}>Notes</p>
                <div className={layout.drawerSurface}>
                  <p className={`whitespace-pre-wrap ${layout.drawerMutedText}`}>
                    {item.notes}
                  </p>
                </div>
              </section>
            )}

            <section className={layout.drawerSection}>
              <p className={`mb-2 ${layout.drawerHeading}`}>Correspondence Chain</p>
              {item.parent && (
                <div className={`mb-3 ${layout.drawerSurface}`}>
                  <p className={layout.drawerMetaLabel}>In Response To</p>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-[var(--color-text-primary)]">
                        {item.parent.referenceNumber} - {item.parent.subject}
                      </p>
                      <StatusBadge
                        label={formatCorrespondenceStatus(item.parent.status)}
                        variant={correspondenceStatusVariant(item.parent.status)}
                      />
                    </div>
                    <Button
                      size="small"
                      onClick={() => onNavigateTo?.(item.parent!.id)}
                    >
                      Open
                    </Button>
                  </div>
                </div>
              )}

              {(item.responses?.length ?? 0) > 0 && (
                <div>
                  <p className={`mb-2 ${layout.drawerMetaLabel}`}>Responses</p>
                  <ul className="erp-drawer-list">
                    {(item.responses ?? []).map((response) => (
                      <li
                        key={response.id}
                        className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-[var(--color-surface-secondary)]"
                        onClick={() => onNavigateTo?.(response.id)}
                      >
                        <span className="font-mono text-xs">
                          {response.referenceNumber}
                        </span>
                        <span className="flex-1 truncate px-2">
                          {response.subject}
                        </span>
                        <StatusBadge
                          label={formatCorrespondenceStatus(response.status)}
                          variant={correspondenceStatusVariant(response.status)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!item.parent && (item.responses?.length ?? 0) === 0 && (
                <p className={layout.drawerMutedText}>
                  No related correspondence.
                </p>
              )}
            </section>

            <DocumentAttachmentPanel
              folderId={item.attachmentFolderId ?? undefined}
              readOnly={!canUploadAttachments}
              title="Correspondence files"
              description={
                canUploadAttachments
                  ? 'Upload letters, scanned documents, email PDFs, and other supporting files.'
                  : 'Closed correspondence is read-only - attachments cannot be changed.'
              }
            />

            {((item.raisedRfis?.length ?? 0) > 0 ||
              (item.raisedIssues?.length ?? 0) > 0 ||
              (item.raisedChangeRequests?.length ?? 0) > 0) && (
              <section>
                <p className={`mb-3 ${layout.drawerHeading}`}>Raised items</p>
                {(item.raisedRfis?.length ?? 0) > 0 && (
                  <div className="mb-4">
                    <p className={`mb-2 text-xs font-medium uppercase tracking-wide ${layout.drawerMetaLabel}`}>
                      RFIs
                    </p>
                    <ul className="erp-drawer-list">
                      {(item.raisedRfis ?? []).map((rfi) => (
                        <li key={rfi.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                          <span className="font-mono text-xs">{rfi.rfiNumber}</span>
                          <span className="flex-1 truncate">{rfi.subject}</span>
                          <span className={layout.drawerMetaLabel}>{rfi.status}</span>
                          <span className={layout.drawerMetaLabel}>{rfi.priority}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(item.raisedIssues?.length ?? 0) > 0 && (
                  <div className="mb-4">
                    <p className={`mb-2 text-xs font-medium uppercase tracking-wide ${layout.drawerMetaLabel}`}>
                      Issues
                    </p>
                    <ul className="erp-drawer-list">
                      {(item.raisedIssues ?? []).map((issue) => (
                        <li key={issue.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                          <span className="font-mono text-xs">{issue.issueNumber}</span>
                          <span className="flex-1 truncate">{issue.title}</span>
                          <span className={layout.drawerMetaLabel}>{issue.status}</span>
                          <span className={layout.drawerMetaLabel}>{issue.severity}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(item.raisedChangeRequests?.length ?? 0) > 0 && (
                  <div className="mb-2">
                    <p className={`mb-2 text-xs font-medium uppercase tracking-wide ${layout.drawerMetaLabel}`}>
                      Change Requests
                    </p>
                    <ul className="erp-drawer-list">
                      {(item.raisedChangeRequests ?? []).map((cr) => (
                        <li key={cr.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                          <span className="font-mono text-xs">{cr.changeNumber}</span>
                          <span className="flex-1 truncate">{cr.title}</span>
                          <span className={layout.drawerMetaLabel}>{cr.status}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {item.status === 'CLOSED' && (
              <Alert
                type="info"
                showIcon
                title="This correspondence is closed and read-only."
              />
            )}

            {item.status !== 'CLOSED' && (canEdit || canCreate) && (
              <section className={layout.drawerSection}>
                <div className="flex flex-col gap-2">
                  {canEdit && item.status === 'DRAFT' && item.direction === 'OUTGOING' && (
                    <Button
                      type="primary"
                      block
                      onClick={() => setSendOpen(true)}
                    >
                      Mark as Sent
                    </Button>
                  )}
                  {canEdit && item.status === 'SENT' && (
                    <Button
                      type="primary"
                      block
                      onClick={() => setAckOpen(true)}
                    >
                      Record Acknowledgement
                    </Button>
                  )}
                  {(item.status === 'SENT' || item.status === 'ACKNOWLEDGED') &&
                    canCreate &&
                    onOpenCreateResponse && (
                      <Button
                        block
                        onClick={() =>
                          onOpenCreateResponse({
                            parentId: item.id,
                            direction: oppositeDirection,
                          })
                        }
                      >
                        Record Response
                      </Button>
                    )}
                  {(item.status === 'SENT' || item.status === 'ACKNOWLEDGED') &&
                    canEdit && (
                      <Button block onClick={() => setCloseConfirmOpen(true)}>
                        Close Correspondence
                      </Button>
                    )}
                </div>
              </section>
            )}
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={sendOpen}
        title="Mark as sent?"
        description="This marks the correspondence as sent to the recipient."
        confirmLabel="Mark as Sent"
        confirmLoading={markSent.isPending}
        onConfirm={() => void handleMarkSent()}
        onCancel={() => setSendOpen(false)}
      />

      <ConfirmDialog
        open={ackOpen}
        title="Record acknowledgement?"
        description="This records that the recipient has acknowledged this correspondence."
        confirmLabel="Record Acknowledgement"
        confirmLoading={acknowledge.isPending}
        onConfirm={() => void handleAcknowledge()}
        onCancel={() => setAckOpen(false)}
      />

      <ConfirmDialog
        open={closeConfirmOpen}
        title="Close correspondence?"
        description="Closed correspondence becomes read-only and cannot be edited or have new attachments."
        confirmLabel="Close"
        confirmLoading={closeItem.isPending}
        onConfirm={() => void handleClose()}
        onCancel={() => setCloseConfirmOpen(false)}
      />
    </>
  );
}
