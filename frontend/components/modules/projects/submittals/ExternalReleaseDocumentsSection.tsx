'use client';

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Button, Checkbox, Modal, Space, Spin } from 'antd';
import { DownloadOutlined, FileOutlined } from '@ant-design/icons';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
import type {
  SubmittalDetail,
  SubmittalItem,
  SubmittalItemReleasableEdv,
  SubmittalPurpose,
} from '@/lib/api/project-management.types';
import { apiGet } from '@/lib/api/client';
import { layout } from '@/lib/theme/layout';
import {
  fetchEdvDownloadUrl,
  submittalKeys,
  submittalsPath,
  useExcludeSubmittalItemEdv,
  useIncludeSubmittalItemEdv,
} from '@/lib/query/submittals';
import { useIssueSubmittal } from '@/lib/query/epc-submittals';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';

function releaseTargetLabel(purpose: SubmittalPurpose | null): string {
  if (purpose === 'DISCIPLINE_SITE') {
    return 'site';
  }
  if (purpose === 'DISCIPLINE_CONSULTANT') {
    return 'consultant';
  }
  return 'external reviewers';
}

function DraftItemEdvList({
  projectId,
  submittalId,
  item,
  edvs,
  loading,
}: {
  projectId: string;
  submittalId: string;
  item: SubmittalItem;
  edvs: SubmittalItemReleasableEdv[];
  loading: boolean;
}): React.ReactNode {
  const messageApi = useAppMessage();
  const excludeEdv = useExcludeSubmittalItemEdv();
  const includeEdv = useIncludeSubmittalItemEdv();
  const excluded = useMemo(
    () => new Set(item.excludedEdvIds ?? []),
    [item.excludedEdvIds],
  );

  async function handleDownload(edvId: string): Promise<void> {
    try {
      const { url } = await fetchEdvDownloadUrl(projectId, edvId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      notifyApiError(error, 'Failed to download file', messageApi);
    }
  }

  async function setIncluded(edvId: string, included: boolean): Promise<void> {
    try {
      if (included) {
        await includeEdv.mutateAsync({
          projectId,
          submittalId,
          itemId: item.id,
          edvId,
        });
      } else {
        await excludeEdv.mutateAsync({
          projectId,
          submittalId,
          itemId: item.id,
          edvId,
        });
      }
    } catch (error) {
      notifyApiError(error, 'Failed to update document selection', messageApi);
    }
  }

  if (loading) {
    return <Spin size="small" className="py-2" />;
  }

  if (edvs.length === 0) {
    return (
      <p className={`py-2 ${layout.drawerMutedText}`}>
        No locked documents in this subtask. Documents must be locked before they
        can be released.
      </p>
    );
  }

  return (
    <ul className="erp-drawer-file-list">
      {edvs.map((edv) => {
        const included = !excluded.has(edv.id);
        return (
          <li
            key={edv.id}
            className="flex flex-wrap items-start justify-between gap-2 py-2"
          >
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <Checkbox
                checked={included}
                onChange={(event) => void setIncluded(edv.id, event.target.checked)}
              />
              <FileOutlined className="mt-0.5 text-[var(--color-text-secondary)]" />
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-[var(--color-text-primary)]">
                  {edv.title}
                </p>
                <p className={layout.drawerMutedText}>
                  Rev {edv.revisionLabel}
                  {edv.documentNumber ? ` (${edv.documentNumber})` : ''}
                </p>
              </div>
            </div>
            <Space size="small">
              <Button
                type="link"
                size="small"
                icon={<DownloadOutlined />}
                onClick={() => void handleDownload(edv.id)}
              >
                Download
              </Button>
              {included && (
                <Button
                  type="link"
                  size="small"
                  danger
                  onClick={() => void setIncluded(edv.id, false)}
                >
                  Remove
                </Button>
              )}
            </Space>
          </li>
        );
      })}
    </ul>
  );
}

function ReleasedSnapshotList({
  projectId,
  items,
}: {
  projectId: string;
  items: SubmittalItem[];
}): React.ReactNode {
  const messageApi = useAppMessage();

  async function handleDownload(edvId: string): Promise<void> {
    try {
      const { url } = await fetchEdvDownloadUrl(projectId, edvId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      notifyApiError(error, 'Failed to download file', messageApi);
    }
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.id}>
          <p className={`mb-2 font-medium ${layout.drawerHeading}`}>
            {item.packageCode ?? '—'} — {item.packageName ?? 'Unknown subtask'}
          </p>
          <ul className="erp-drawer-file-list">
            {(item.snapshotPayload ?? []).map((row) => (
              <li
                key={row.engineeringDocumentVersionId}
                className="flex items-start justify-between gap-3 py-2"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <FileOutlined className="mt-0.5 text-[var(--color-text-secondary)]" />
                  <div>
                    <p className="text-[12px] font-medium">{row.title}</p>
                    <p className={layout.drawerMutedText}>
                      Rev {row.revisionLabel}
                      {row.documentNumber ? ` (${row.documentNumber})` : ''}
                    </p>
                  </div>
                </div>
                <Button
                  type="link"
                  icon={<DownloadOutlined />}
                  onClick={() =>
                    void handleDownload(row.engineeringDocumentVersionId)
                  }
                >
                  Download
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function ExternalReleaseDocumentsSection({
  projectId,
  submittal,
  submittalId,
  onUpdated,
}: {
  projectId: string;
  submittal: SubmittalDetail;
  submittalId: string;
  onUpdated: () => void;
}): React.ReactNode {
  const messageApi = useAppMessage();
  const issueSubmittal = useIssueSubmittal();
  const isDraft = submittal.status === 'DRAFT' && !submittal.issuedAt;

  const edvQueries = useQueries({
    queries: submittal.items.map((item) => ({
      queryKey: submittalKeys.itemEdvs(projectId, submittalId, item.id),
      queryFn: () =>
        apiGet<SubmittalItemReleasableEdv[]>(
          `${submittalsPath(projectId)}/${submittalId}/items/${item.id}/edvs`,
        ),
      enabled: isDraft && Boolean(submittalId),
      retry: false,
    })),
  });

  const selectedCount = useMemo(() => {
    if (!isDraft) {
      return 0;
    }
    let count = 0;
    submittal.items.forEach((item, index) => {
      const excluded = new Set(item.excludedEdvIds ?? []);
      const edvs = edvQueries[index]?.data ?? [];
      count += edvs.filter((edv) => !excluded.has(edv.id)).length;
    });
    return count;
  }, [isDraft, submittal.items, edvQueries]);

  function handleIssue(): void {
    Modal.confirm({
      title: 'Issue this package?',
      content: `The document snapshots will be frozen. This cannot be undone. Issue to ${releaseTargetLabel(submittal.submittalPurpose)}?`,
      okText: 'Issue',
      cancelText: 'Cancel',
      onOk: () =>
        issueSubmittal
          .mutateAsync({ projectId, submittalId })
          .then(() => {
            messageApi.success('Release issued to external reviewers');
            onUpdated();
          })
          .catch((error: unknown) => {
            notifyApiError(error, 'Failed to issue release', messageApi);
          }),
    });
  }

  if (isDraft) {
    return (
      <section className={layout.drawerSection}>
        <h3 className={`${layout.drawerHeading} mb-3`}>Documents for release</h3>
        {submittal.items.map((item, index) => (
          <div
            key={item.id}
            className="mb-4 rounded border border-[var(--color-border)] p-3"
          >
            <p className={`mb-2 font-medium ${layout.drawerHeading}`}>
              {item.packageCode ?? '—'} — {item.packageName ?? 'Unknown subtask'}
            </p>
            <DraftItemEdvList
              projectId={projectId}
              submittalId={submittalId}
              item={item}
              edvs={edvQueries[index]?.data ?? []}
              loading={edvQueries[index]?.isLoading ?? false}
            />
          </div>
        ))}

        <h4 className={`${layout.drawerHeading} mb-2 mt-4`}>
          Additional attachments (optional)
        </h4>
        <p className={`mb-2 ${layout.drawerMutedText}`}>
          Add transmittal letters, cover sheets, or supporting documents
        </p>
        {submittal.attachmentFolderId ? (
          <DocumentAttachmentPanel
            folderId={submittal.attachmentFolderId}
            readOnly={false}
            title=""
            description=""
          />
        ) : (
          <p className={layout.drawerMutedText}>Loading attachment folder…</p>
        )}

        {submittal.items.length > 0 && (
          <Button
            type="primary"
            className="mt-4"
            loading={issueSubmittal.isPending}
            disabled={selectedCount === 0}
            onClick={handleIssue}
          >
            {`Issue ${selectedCount} document${selectedCount === 1 ? '' : 's'} to ${releaseTargetLabel(submittal.submittalPurpose)}`}
          </Button>
        )}
      </section>
    );
  }

  return (
    <section className={layout.drawerSection}>
      <h3 className={`${layout.drawerHeading} mb-3`}>Released documents</h3>
      <ReleasedSnapshotList projectId={projectId} items={submittal.items} />

      <h4 className={`${layout.drawerHeading} mb-2 mt-4`}>Additional attachments</h4>
      {submittal.attachmentFolderId ? (
        <DocumentAttachmentPanel
          folderId={submittal.attachmentFolderId}
          readOnly
          title=""
          description=""
        />
      ) : null}
    </section>
  );
}
