'use client';

import { useState } from 'react';
import { Button, Space } from 'antd';
import { DownloadOutlined, EyeOutlined } from '@ant-design/icons';
import {
  downloadDocumentVersion,
  openDocumentVersion,
} from '@/lib/utils/document-download';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAppMessage } from '@/hooks/use-app-message';

/**
 * View and download actions for an engineering document version file.
 */
export default function EdvFileActions({
  documentVersionId,
  fileName,
  size = 'small',
}: {
  documentVersionId: string | undefined;
  fileName?: string;
  size?: 'small' | 'middle';
}): React.ReactNode {
  const messageApi = useAppMessage();
  const [loadingAction, setLoadingAction] = useState<'view' | 'download' | null>(
    null,
  );

  if (!documentVersionId) {
    return null;
  }

  async function handleView(): Promise<void> {
    setLoadingAction('view');
    try {
      await openDocumentVersion(documentVersionId!);
    } catch (error) {
      notifyApiError(error, 'Unable to open document', messageApi);
    } finally {
      setLoadingAction(null);
    }
  }

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

  return (
    <Space size={4} onClick={(event) => event.stopPropagation()}>
      <Button
        type="link"
        size={size}
        className="!px-1"
        icon={<EyeOutlined />}
        loading={loadingAction === 'view'}
        disabled={loadingAction !== null && loadingAction !== 'view'}
        onClick={() => void handleView()}
      >
        View
      </Button>
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
