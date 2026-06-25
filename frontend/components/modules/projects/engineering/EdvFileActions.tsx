'use client';

import { useState, type MouseEvent } from 'react';
import { Button, Space, Tooltip } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
// import { EyeOutlined } from '@ant-design/icons';
import {
  downloadDocumentVersion,
  // openDocumentVersion,
} from '@/lib/utils/document-download';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAppMessage } from '@/hooks/use-app-message';

/**
 * Download actions for an engineering document version file.
 * View is disabled until an in-app preview is available.
 */
export default function EdvFileActions({
  documentVersionId,
  fileName,
  size = 'small',
  compact = false,
}: {
  documentVersionId: string | undefined;
  fileName?: string;
  size?: 'small' | 'middle';
  /** Icon-only buttons for tight layouts (e.g. review mode rows). */
  compact?: boolean;
}): React.ReactNode {
  const messageApi = useAppMessage();
  const [loadingAction, setLoadingAction] = useState<'download' | null>(null);

  if (!documentVersionId) {
    return null;
  }

  // async function handleView(): Promise<void> {
  //   setLoadingAction('view');
  //   try {
  //     await openDocumentVersion(documentVersionId!);
  //   } catch (error) {
  //     notifyApiError(error, 'Unable to open document', messageApi);
  //   } finally {
  //     setLoadingAction(null);
  //   }
  // }

  async function handleDownload(): Promise<void> {
    setLoadingAction('download');
    try {
      await downloadDocumentVersion(documentVersionId!, fileName);
    } catch (error) {
      notifyApiError(error, 'Unable to download document', messageApi);
    } finally {
      setLoadingAction(null);
    }
  }

  if (compact) {
    return (
      <Space size={2} onClick={(event: MouseEvent) => event.stopPropagation()}>
        {/* <Tooltip title="View">
          <Button
            type="text"
            size={size}
            aria-label="View document"
            icon={<EyeOutlined />}
            loading={loadingAction === 'view'}
            disabled={loadingAction !== null && loadingAction !== 'view'}
            onClick={() => void handleView()}
          />
        </Tooltip> */}
        <Tooltip title="Download">
          <Button
            type="text"
            size={size}
            aria-label="Download document"
            icon={<DownloadOutlined />}
            loading={loadingAction === 'download'}
            disabled={loadingAction !== null && loadingAction !== 'download'}
            onClick={() => void handleDownload()}
          />
        </Tooltip>
      </Space>
    );
  }

  return (
    <Space size={4} wrap onClick={(event: MouseEvent) => event.stopPropagation()}>
      {/* <Button
        type="link"
        size={size}
        className="!px-1"
        icon={<EyeOutlined />}
        loading={loadingAction === 'view'}
        disabled={loadingAction !== null && loadingAction !== 'view'}
        onClick={() => void handleView()}
      >
        View
      </Button> */}
      <Button
        type="link"
        size={size}
        className="!px-1"
        icon={<DownloadOutlined />}
        loading={loadingAction === 'download'}
        disabled={loadingAction !== null && loadingAction !== 'download'}
        onClick={() => void handleDownload()}
      >
        Download
      </Button>
    </Space>
  );
}
