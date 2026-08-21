'use client';

import { useRef, useState } from 'react';
import { Avatar, Button, Space, Spin, Upload } from 'antd';
import { CameraOutlined, DeleteOutlined, UserOutlined } from '@ant-design/icons';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  useDeleteUserPhoto,
  useUploadUserPhoto,
  useUserPhotoUrl,
} from '@/lib/query/users';
import { tokens } from '@/lib/theme/tokens';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,image/gif';
const MAX_BYTES = 5 * 1024 * 1024;

interface EmployeeProfilePhotoProps {
  userId: string;
  photoDocumentId?: string | null;
  firstName?: string;
  lastName?: string;
  /** When false, only shows the avatar (no upload/remove). */
  canEdit?: boolean;
  size?: number;
}

/**
 * Dedicated profile picture upload / preview for an employee.
 */
export default function EmployeeProfilePhoto({
  userId,
  photoDocumentId,
  firstName,
  lastName,
  canEdit = true,
  size = 96,
}: EmployeeProfilePhotoProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const uploadMutation = useUploadUserPhoto();
  const deleteMutation = useDeleteUserPhoto();
  const photoQuery = useUserPhotoUrl(userId, photoDocumentId);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const initials =
    `${firstName?.charAt(0) ?? ''}${lastName?.charAt(0) ?? ''}`.toUpperCase() ||
    undefined;

  const imageSrc = localPreview ?? photoQuery.data?.url ?? undefined;

  function revokeLocalPreview(): void {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setLocalPreview(null);
  }

  async function handleUpload(file: File): Promise<false> {
    if (!ACCEPTED_TYPES.split(',').includes(file.type)) {
      messageApi.error(t('users.photoInvalidType'));
      return false;
    }
    if (file.size > MAX_BYTES) {
      messageApi.error(t('users.photoTooLarge'));
      return false;
    }

    revokeLocalPreview();
    const preview = URL.createObjectURL(file);
    objectUrlRef.current = preview;
    setLocalPreview(preview);

    try {
      await uploadMutation.mutateAsync({ userId, file });
      messageApi.success(t('users.photoUploaded'));
      revokeLocalPreview();
    } catch (error: unknown) {
      revokeLocalPreview();
      notifyApiError(error, t('users.photoUploadError'), messageApi);
    }
    return false;
  }

  async function handleRemove(): Promise<void> {
    try {
      await deleteMutation.mutateAsync(userId);
      messageApi.success(t('users.photoRemoved'));
      setConfirmRemove(false);
    } catch (error: unknown) {
      notifyApiError(error, t('users.photoRemoveError'), messageApi);
    }
  }

  const busy =
    uploadMutation.isPending ||
    deleteMutation.isPending ||
    (Boolean(photoDocumentId) && photoQuery.isLoading);

  return (
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
      <Spin spinning={busy}>
        <Avatar
          size={size}
          src={imageSrc}
          icon={!imageSrc && !initials ? <UserOutlined /> : undefined}
          style={{
            backgroundColor: imageSrc
              ? undefined
              : tokens.colorPrimary,
            flexShrink: 0,
            border: `1px solid ${tokens.colorBorder}`,
          }}
        >
          {initials}
        </Avatar>
      </Spin>

      {canEdit ? (
        <div className="flex flex-col gap-1">
          <div
            className="text-sm font-medium"
            style={{ color: tokens.colorTextPrimary }}
          >
            {t('users.profilePhoto')}
          </div>
          <p
            className="m-0 text-xs"
            style={{ color: tokens.colorTextSecondary }}
          >
            {t('users.photoHelp')}
          </p>
          <Space wrap size={8} className="mt-1">
            <Upload
              accept={ACCEPTED_TYPES}
              showUploadList={false}
              beforeUpload={(file) => {
                void handleUpload(file);
                return false;
              }}
            >
              <Button
                icon={<CameraOutlined />}
                loading={uploadMutation.isPending}
                style={{ borderRadius: 2 }}
              >
                {photoDocumentId
                  ? t('users.changePhoto')
                  : t('users.uploadPhoto')}
              </Button>
            </Upload>
            {photoDocumentId ? (
              <Button
                danger
                icon={<DeleteOutlined />}
                loading={deleteMutation.isPending}
                onClick={() => setConfirmRemove(true)}
                style={{ borderRadius: 2 }}
              >
                {t('users.removePhoto')}
              </Button>
            ) : null}
          </Space>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmRemove}
        title={t('users.removePhotoTitle')}
        description={t('users.removePhotoDescription')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        danger
        confirmLoading={deleteMutation.isPending}
        onConfirm={() => void handleRemove()}
        onCancel={() => {
          if (!deleteMutation.isPending) {
            setConfirmRemove(false);
          }
        }}
      />
    </div>
  );
}
