'use client';

import { useRef, useState } from 'react';
import { Avatar, Button, Space, Spin, Tooltip, Upload } from 'antd';
import { CameraOutlined, DeleteOutlined, UserOutlined } from '@ant-design/icons';
import { ImagePreviewTrigger } from '@/components/shared/preview';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  useDeleteMyProfilePhoto,
  useMyProfilePhotoUrl,
  useUploadMyProfilePhoto,
} from '@/lib/query/profile';
import {
  useDeleteUserPhoto,
  useUploadUserPhoto,
  useUserPhotoUrl,
} from '@/lib/query/users';
import { tokens } from '@/lib/theme/tokens';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,image/gif';
const MAX_BYTES = 5 * 1024 * 1024;

export type EmployeeProfilePhotoVariant = 'hero' | 'panel';
export type EmployeeProfilePhotoSource = 'user' | 'self';

interface EmployeeProfilePhotoProps {
  /** Required when `source` is `user` (admin editing another employee). */
  userId?: string;
  photoDocumentId?: string | null;
  firstName?: string;
  lastName?: string;
  /** When false, only shows the avatar (no upload/remove). */
  canEdit?: boolean;
  size?: number;
  /**
   * `hero` - avatar with compact icon actions under it (identity headers).
   * `panel` - avatar beside labelled controls (form sections).
   */
  variant?: EmployeeProfilePhotoVariant;
  /**
   * `user` - `/users/:id/photo` (requires users.edit).
   * `self` - `/auth/me/photo` (signed-in user).
   */
  source?: EmployeeProfilePhotoSource;
}

/**
 * Dedicated profile picture upload / preview for an employee or self.
 */
export default function EmployeeProfilePhoto({
  userId,
  photoDocumentId,
  firstName,
  lastName,
  canEdit = true,
  size = 96,
  variant = 'panel',
  source = 'user',
}: EmployeeProfilePhotoProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const isSelf = source === 'self';

  const uploadUserMutation = useUploadUserPhoto();
  const deleteUserMutation = useDeleteUserPhoto();
  const userPhotoQuery = useUserPhotoUrl(
    userId ?? '',
    photoDocumentId,
    !isSelf && Boolean(userId),
  );

  const uploadSelfMutation = useUploadMyProfilePhoto();
  const deleteSelfMutation = useDeleteMyProfilePhoto();
  const selfPhotoQuery = useMyProfilePhotoUrl(
    isSelf && Boolean(photoDocumentId),
  );

  const uploadPending = isSelf
    ? uploadSelfMutation.isPending
    : uploadUserMutation.isPending;
  const deletePending = isSelf
    ? deleteSelfMutation.isPending
    : deleteUserMutation.isPending;
  const photoLoading = isSelf
    ? selfPhotoQuery.isLoading
    : userPhotoQuery.isLoading;
  const imageFromQuery = isSelf
    ? selfPhotoQuery.data?.url
    : userPhotoQuery.data?.url;

  const initials =
    `${firstName?.charAt(0) ?? ''}${lastName?.charAt(0) ?? ''}`.toUpperCase() ||
    undefined;

  const imageSrc = localPreview ?? imageFromQuery ?? undefined;

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
    if (!isSelf && !userId) {
      messageApi.error(t('users.photoUploadError'));
      return false;
    }

    revokeLocalPreview();
    const preview = URL.createObjectURL(file);
    objectUrlRef.current = preview;
    setLocalPreview(preview);

    try {
      if (isSelf) {
        await uploadSelfMutation.mutateAsync(file);
      } else {
        await uploadUserMutation.mutateAsync({ userId: userId!, file });
      }
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
      if (isSelf) {
        await deleteSelfMutation.mutateAsync();
      } else if (userId) {
        await deleteUserMutation.mutateAsync(userId);
      }
      messageApi.success(t('users.photoRemoved'));
      setConfirmRemove(false);
    } catch (error: unknown) {
      notifyApiError(error, t('users.photoRemoveError'), messageApi);
    }
  }

  const busy =
    uploadPending ||
    deletePending ||
    (Boolean(photoDocumentId) && photoLoading);

  const avatar = (
    <Spin spinning={busy}>
      <ImagePreviewTrigger
        src={localPreview ? null : imageFromQuery}
        alt={[firstName, lastName].filter(Boolean).join(' ')}
      >
        <Avatar
          size={size}
          src={imageSrc}
          icon={!imageSrc && !initials ? <UserOutlined /> : undefined}
          style={{
            backgroundColor: imageSrc ? undefined : '#e8f7f2',
            color: imageSrc ? undefined : '#0f6e56',
            fontWeight: 600,
            flexShrink: 0,
            border: '1px solid rgba(29, 158, 117, 0.18)',
            boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)',
          }}
        >
          {initials}
        </Avatar>
      </ImagePreviewTrigger>
    </Spin>
  );

  const uploadControl = (
    <Upload
      accept={ACCEPTED_TYPES}
      showUploadList={false}
      beforeUpload={(file) => {
        void handleUpload(file);
        return false;
      }}
    >
      {variant === 'hero' ? (
        <Tooltip
          title={
            photoDocumentId ? t('users.changePhoto') : t('users.uploadPhoto')
          }
        >
          <Button
            type="default"
            size="small"
            icon={<CameraOutlined />}
            loading={uploadPending}
            style={{ borderRadius: 8 }}
          />
        </Tooltip>
      ) : (
        <Button
          icon={<CameraOutlined />}
          loading={uploadPending}
          style={{ borderRadius: 10 }}
        >
          {photoDocumentId ? t('users.changePhoto') : t('users.uploadPhoto')}
        </Button>
      )}
    </Upload>
  );

  const removeControl =
    photoDocumentId && canEdit ? (
      variant === 'hero' ? (
        <Tooltip title={t('users.removePhoto')}>
          <Button
            danger
            size="small"
            icon={<DeleteOutlined />}
            loading={deletePending}
            onClick={() => setConfirmRemove(true)}
            style={{ borderRadius: 8 }}
          />
        </Tooltip>
      ) : (
        <Button
          danger
          icon={<DeleteOutlined />}
          loading={deletePending}
          onClick={() => setConfirmRemove(true)}
          style={{ borderRadius: 10 }}
        >
          {t('users.removePhoto')}
        </Button>
      )
    ) : null;

  const dialog = (
    <ConfirmDialog
      className="erp-hr-travel-modal"
      open={confirmRemove}
      title={t('users.removePhotoTitle')}
      description={t('users.removePhotoDescription')}
      confirmLabel={t('common.delete')}
      cancelLabel={t('common.cancel')}
      danger
      confirmLoading={deletePending}
      onConfirm={() => void handleRemove()}
      onCancel={() => {
        if (!deletePending) {
          setConfirmRemove(false);
        }
      }}
    />
  );

  if (variant === 'hero') {
    return (
      <div className="flex flex-col items-center gap-2">
        {avatar}
        {canEdit ? (
          <Space size={6}>
            {uploadControl}
            {removeControl}
          </Space>
        ) : null}
        {dialog}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
      {avatar}
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
            {uploadControl}
            {removeControl}
          </Space>
        </div>
      ) : null}
      {dialog}
    </div>
  );
}
