'use client';

import { useRef, useState } from 'react';
import { Avatar, Button, Space, Spin, Tooltip, Upload } from 'antd';
import { CameraOutlined, CarOutlined, DeleteOutlined } from '@ant-design/icons';
import { ImagePreviewTrigger } from '@/components/shared/preview';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  useCompanyVehiclePhotoUrl,
  useDeleteCompanyVehiclePhoto,
  useUploadCompanyVehiclePhoto,
} from '@/lib/query/company-vehicle';
import { tokens } from '@/lib/theme/tokens';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,image/gif';
const MAX_BYTES = 5 * 1024 * 1024;

export type VehiclePhotoVariant = 'hero' | 'panel' | 'thumb';

interface VehiclePhotoProps {
  vehicleId: string;
  photoDocumentId?: string | null;
  plateNumber?: string;
  canEdit?: boolean;
  size?: number;
  variant?: VehiclePhotoVariant;
}

/**
 * Vehicle photo upload, preview, and removal for fleet register pages.
 */
export default function VehiclePhoto({
  vehicleId,
  photoDocumentId,
  plateNumber,
  canEdit = true,
  size = 96,
  variant = 'panel',
}: VehiclePhotoProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const photoQuery = useCompanyVehiclePhotoUrl(
    vehicleId,
    photoDocumentId,
    Boolean(photoDocumentId),
  );
  const uploadMutation = useUploadCompanyVehiclePhoto();
  const deleteMutation = useDeleteCompanyVehiclePhoto();

  const imageSrc = localPreview ?? photoQuery.data?.url ?? undefined;
  const busy =
    uploadMutation.isPending ||
    deleteMutation.isPending ||
    (Boolean(photoDocumentId) && photoQuery.isLoading);

  function revokeLocalPreview(): void {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setLocalPreview(null);
  }

  async function handleUpload(file: File): Promise<false> {
    if (!ACCEPTED_TYPES.split(',').includes(file.type)) {
      messageApi.error(t('vehicles.photoInvalidType'));
      return false;
    }
    if (file.size > MAX_BYTES) {
      messageApi.error(t('vehicles.photoTooLarge'));
      return false;
    }

    revokeLocalPreview();
    const preview = URL.createObjectURL(file);
    objectUrlRef.current = preview;
    setLocalPreview(preview);

    try {
      await uploadMutation.mutateAsync({ vehicleId, file });
      messageApi.success(t('vehicles.photoUploaded'));
      revokeLocalPreview();
    } catch (error: unknown) {
      revokeLocalPreview();
      notifyApiError(error, t('vehicles.photoUploadError'), messageApi);
    }
    return false;
  }

  async function handleRemove(): Promise<void> {
    try {
      await deleteMutation.mutateAsync(vehicleId);
      messageApi.success(t('vehicles.photoRemoved'));
      setConfirmRemove(false);
    } catch (error: unknown) {
      notifyApiError(error, t('vehicles.photoRemoveError'), messageApi);
    }
  }

  const avatar = (
    <Spin spinning={busy}>
      <ImagePreviewTrigger
        src={localPreview ? null : photoQuery.data?.url}
        alt={plateNumber ?? t('vehicles.form.photo')}
        className={variant === 'thumb' ? '!rounded-lg' : undefined}
      >
        <Avatar
          size={size}
          shape={variant === 'thumb' ? 'square' : 'circle'}
          src={imageSrc}
          icon={!imageSrc ? <CarOutlined /> : undefined}
          style={{
            backgroundColor: imageSrc ? undefined : tokens.colorTeal50,
            color: imageSrc ? undefined : tokens.colorTeal400,
            flexShrink: 0,
            border: `1px solid ${tokens.colorBorder}`,
            borderRadius: variant === 'thumb' ? 8 : undefined,
          }}
        >
          {!imageSrc && plateNumber ? plateNumber.slice(0, 2) : undefined}
        </Avatar>
      </ImagePreviewTrigger>
    </Spin>
  );

  if (variant === 'thumb') {
    return avatar;
  }

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
            photoDocumentId ? t('vehicles.changePhoto') : t('vehicles.uploadPhoto')
          }
        >
          <Button
            type="default"
            size="small"
            icon={<CameraOutlined />}
            loading={uploadMutation.isPending}
          />
        </Tooltip>
      ) : (
        <Button
          icon={<CameraOutlined />}
          loading={uploadMutation.isPending}
        >
          {photoDocumentId ? t('vehicles.changePhoto') : t('vehicles.uploadPhoto')}
        </Button>
      )}
    </Upload>
  );

  const removeControl =
    photoDocumentId && canEdit ? (
      variant === 'hero' ? (
        <Tooltip title={t('vehicles.removePhoto')}>
          <Button
            danger
            size="small"
            icon={<DeleteOutlined />}
            loading={deleteMutation.isPending}
            onClick={() => setConfirmRemove(true)}
          />
        </Tooltip>
      ) : (
        <Button
          danger
          icon={<DeleteOutlined />}
          loading={deleteMutation.isPending}
          onClick={() => setConfirmRemove(true)}
        >
          {t('vehicles.removePhoto')}
        </Button>
      )
    ) : null;

  const dialog = (
    <ConfirmDialog
      open={confirmRemove}
      title={t('vehicles.removePhotoTitle')}
      description={t('vehicles.removePhotoDescription')}
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
            {t('vehicles.form.photo')}
          </div>
          <p
            className="m-0 text-xs"
            style={{ color: tokens.colorTextSecondary }}
          >
            {t('vehicles.form.photoHelp')}
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
