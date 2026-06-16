'use client';

import { useMemo } from 'react';
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Spin,
  Tag,
  Timeline,
  Upload,
} from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import DocumentAttachmentPanel from '@/components/ui/DocumentAttachmentPanel/DocumentAttachmentPanel';
import EntityLinkPicker from '@/components/ui/EntityLinkPicker/EntityLinkPicker';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { EntityLink } from '@/lib/api/documents.types';
import { ApiRequestError } from '@/lib/api/errors';
import {
  useCreateDrawingLink,
  useDeleteDrawingLink,
  useDrawing,
  useDrawingLinks,
  useDrawingVersions,
} from '@/lib/query/drawings';
import { useUserNameLookup } from '@/hooks/useUserNameLookup';
import {
  drawingLinkToEntityLink,
  entityLinkToDrawingLinkPayload,
} from '@/lib/utils/drawing-links';
import { formatProjectDate } from '@/lib/utils/project-display';

export default function DrawingDetailDrawer({
  projectId,
  drawingId,
  onClose,
  onUpdated,
}: {
  projectId: string;
  drawingId: string | null;
  onClose: () => void;
  onUpdated: () => void;
}): React.ReactNode {
  const open = Boolean(drawingId);
  const resolveUserName = useUserNameLookup();

  const drawingQuery = useDrawing(projectId, drawingId ?? '', open);
  const versionsQuery = useDrawingVersions(projectId, drawingId ?? '', open);
  const linksQuery = useDrawingLinks(projectId, drawingId ?? '', open);
  const createLink = useCreateDrawingLink();
  const deleteLink = useDeleteDrawingLink();

  const drawing = drawingQuery.data;
  const versions = versionsQuery.data ?? [];
  const links = linksQuery.data ?? [];

  const entityLinks = useMemo(
    () => links.map((link) => drawingLinkToEntityLink(link)),
    [links],
  );

  async function handleLinksChange(nextLinks: EntityLink[]): Promise<void> {
    if (!drawingId) {
      return;
    }

    const added = nextLinks.filter(
      (link) =>
        !entityLinks.some(
          (existing) =>
            existing.entityType === link.entityType &&
            existing.entityId === link.entityId,
        ),
    );

    const removed = entityLinks.filter(
      (link) =>
        !nextLinks.some(
          (existing) =>
            existing.entityType === link.entityType &&
            existing.entityId === link.entityId,
        ),
    );

    for (const link of added) {
      await createLink.mutateAsync({
        projectId,
        drawingId,
        body: entityLinkToDrawingLinkPayload(link),
      });
    }

    for (const link of removed) {
      const backendLink = links.find(
        (item) => item.linkedEntityId === link.entityId,
      );
      if (backendLink) {
        await deleteLink.mutateAsync({
          projectId,
          drawingId,
          linkId: backendLink.id,
        });
      }
    }

    onUpdated();
    void linksQuery.refetch();
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={
        drawing
          ? `${drawing.drawingNumber} Rev ${drawing.revision} — ${drawing.title}`
          : 'Drawing detail'
      }
      size="large"
      destroyOnHidden
    >
      {drawingQuery.isLoading && (
        <div className="flex justify-center py-12">
          <Spin />
        </div>
      )}

      {drawingQuery.isError && (
        <p className="text-sm text-slate-500">
          {drawingQuery.error instanceof ApiRequestError
            ? drawingQuery.error.message
            : 'Unable to load drawing.'}
        </p>
      )}

      {drawing && (
        <div className="space-y-6">
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="Number">
              {drawing.drawingNumber}
            </Descriptions.Item>
            <Descriptions.Item label="Revision">
              {drawing.revision}
            </Descriptions.Item>
            <Descriptions.Item label="Discipline">
              {drawing.discipline ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Latest">
              {drawing.isLatest ? (
                <Tag color="green">Latest</Tag>
              ) : (
                <Tag>Superseded</Tag>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Status" span={2}>
              <StatusBadge label={drawing.status} variant="default" />
            </Descriptions.Item>
            <Descriptions.Item label="Date issued" span={2}>
              {formatProjectDate(drawing.dateIssued)}
            </Descriptions.Item>
          </Descriptions>

          <Alert
            type="info"
            showIcon
            message="Drawing viewer"
            description="Inline PDF viewing will be enabled when file versions are stored. DWG and IFC files will be available for download only."
          />

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Version history
              </h3>
              <Upload disabled showUploadList={false}>
                <Button icon={<UploadOutlined />} disabled>
                  Upload revision
                </Button>
              </Upload>
            </div>
            {versions.length === 0 ? (
              <p className="text-sm text-slate-500">
                No file versions uploaded yet.
              </p>
            ) : (
              <Timeline
                items={versions.map((version) => ({
                  children: (
                    <div>
                      <p className="font-medium text-slate-900">
                        Revision {version.revision}
                      </p>
                      <p className="text-xs text-slate-500">
                        {resolveUserName(version.uploadedBy)} ·{' '}
                        {formatProjectDate(version.createdAt)}
                      </p>
                      {version.changeNote && (
                        <p className="mt-1 text-sm text-slate-600">
                          {version.changeNote}
                        </p>
                      )}
                      <Tag className="!mt-2">{version.status}</Tag>
                    </div>
                  ),
                }))}
              />
            )}
          </div>

          <EntityLinkPicker
            value={entityLinks}
            onChange={(nextLinks) => void handleLinksChange(nextLinks)}
            allowedTypes={['rfi', 'submittal', 'issue', 'punch_item']}
            title="Linked records"
            description="Link this drawing to related RFIs, submittals, issues, or punch items."
          />

          <DocumentAttachmentPanel
            folderId={drawing.folderId ?? undefined}
            readOnly={!drawing.folderId}
            title="Drawing files"
            description="Upload PDF, DWG, IFC, or image files for this drawing revision."
          />
        </div>
      )}
    </Drawer>
  );
}
