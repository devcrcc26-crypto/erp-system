'use client';

import { Button, Space, Tooltip, Typography } from 'antd';
import { Download, Eye, Stamp } from 'lucide-react';
import ProfileFileTypeIcon, {
  profileFileMetaLine,
} from '@/components/modules/users/ProfileFileTypeIcon';
import {
  DocumentPreviewActions,
  DocumentPreviewGroup,
} from '@/components/shared/preview';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { AttachmentDocumentSummary } from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import {
  formatSealFileSize,
  resolveSealFileKind,
} from '@/lib/utils/seal-file-display';
import { tokens } from '@/lib/theme/tokens';

/**
 * File presentations for Official / Project Seal document sections.
 * - tiles: icon cards in a responsive grid (document to seal)
 * - proof: featured stamp-style card (sealed proof)
 * Images and PDFs can be previewed in place; every file can be downloaded.
 */
export default function SealDocumentGallery({
  documents,
  emptyLabel = 'No attachments',
  variant = 'tiles',
}: {
  documents: AttachmentDocumentSummary[] | undefined;
  emptyLabel?: string;
  variant?: 'tiles' | 'proof';
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const items = documents ?? [];

  if (items.length === 0) {
    return (
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        {emptyLabel}
      </Typography.Text>
    );
  }

  if (variant === 'proof') {
    return (
      <DocumentPreviewGroup documents={items}>
        <div className="flex flex-col gap-3">
          {items.map((doc) => {
            const meta = resolveSealFileKind(doc.name, doc.fileType);
            const sizeLabel = formatSealFileSize(doc.fileSizeBytes);
            return (
              <DocumentPreviewActions key={doc.id} document={doc}>
                {(actions) => (
                  <div
                    className="relative overflow-hidden rounded-xl"
                    style={{
                      border: `1px solid ${tokens.colorBorder}`,
                      background: `linear-gradient(135deg, ${meta.soft} 0%, ${tokens.colorCardBg} 55%)`,
                    }}
                  >
                    <div
                      className="pointer-events-none absolute -right-3 -top-3 opacity-[0.12]"
                      aria-hidden
                    >
                      <Stamp size={96} style={{ color: meta.accent }} />
                    </div>
                    <div className="relative flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                      <div className="flex min-w-0 items-start gap-3">
                        <ProfileFileTypeIcon
                          name={doc.name}
                          fileType={doc.fileType}
                          size="md"
                        />
                        <div className="min-w-0">
                          <p
                            className="m-0 text-[10px] font-semibold uppercase tracking-[0.14em]"
                            style={{ color: meta.accent }}
                          >
                            {t('hr.section.sealedProof')}
                          </p>
                          <p
                            className="m-0 mt-1 truncate text-sm font-semibold"
                            style={{ color: tokens.colorTextPrimary }}
                            title={doc.name}
                          >
                            {doc.name}
                          </p>
                          <p
                            className="m-0 mt-1 text-xs"
                            style={{ color: tokens.colorTextSecondary }}
                          >
                            {[meta.label, sizeLabel].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      </div>
                      <Space wrap size={8}>
                        {actions.canPreview ? (
                          <Button
                            icon={<Eye size={14} />}
                            loading={actions.previewLoading}
                            onClick={actions.preview}
                          >
                            {t('common.preview')}
                          </Button>
                        ) : null}
                        <Button
                          type="primary"
                          icon={<Download size={14} />}
                          loading={actions.downloading}
                          onClick={actions.download}
                        >
                          {t('common.download')}
                        </Button>
                      </Space>
                    </div>
                  </div>
                )}
              </DocumentPreviewActions>
            );
          })}
        </div>
      </DocumentPreviewGroup>
    );
  }

  return (
    <DocumentPreviewGroup documents={items}>
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
        {items.map((doc) => (
          <li key={doc.id}>
            <DocumentPreviewActions document={doc}>
              {(actions) => (
                <div
                  className="flex w-full items-center gap-1 rounded-xl border py-2 pl-3 pr-2"
                  style={{
                    borderColor: tokens.colorBorder,
                    background: tokens.colorCardBg,
                  }}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 border-0 bg-transparent py-1 pl-0 pr-1 text-left"
                    onClick={
                      actions.canPreview ? actions.preview : actions.download
                    }
                    disabled={actions.previewLoading || actions.downloading}
                    aria-label={
                      actions.canPreview
                        ? t('common.previewFile', { name: doc.name })
                        : t('common.downloadFile', { name: doc.name })
                    }
                  >
                    <ProfileFileTypeIcon
                      name={doc.name}
                      fileType={doc.fileType}
                      size="md"
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-sm font-medium"
                        style={{ color: tokens.colorTextPrimary }}
                        title={doc.name}
                      >
                        {doc.name}
                      </span>
                      <span
                        className="mt-0.5 block text-xs"
                        style={{ color: tokens.colorTextTertiary }}
                      >
                        {profileFileMetaLine(
                          doc.name,
                          doc.fileType,
                          doc.fileSizeBytes,
                        ) || t('hr.labels.attachment')}
                      </span>
                    </span>
                  </button>
                  {actions.canPreview ? (
                    <Tooltip title={t('common.preview')}>
                      <Button
                        type="text"
                        size="small"
                        icon={<Eye size={15} strokeWidth={1.75} />}
                        loading={actions.previewLoading}
                        aria-label={t('common.previewFile', { name: doc.name })}
                        onClick={actions.preview}
                      />
                    </Tooltip>
                  ) : null}
                  <Tooltip title={t('common.download')}>
                    <Button
                      type="text"
                      size="small"
                      icon={<Download size={15} strokeWidth={1.75} />}
                      loading={actions.downloading}
                      aria-label={t('common.downloadFile', { name: doc.name })}
                      onClick={actions.download}
                      style={{ color: tokens.colorPrimary }}
                    />
                  </Tooltip>
                </div>
              )}
            </DocumentPreviewActions>
          </li>
        ))}
      </ul>
    </DocumentPreviewGroup>
  );
}
