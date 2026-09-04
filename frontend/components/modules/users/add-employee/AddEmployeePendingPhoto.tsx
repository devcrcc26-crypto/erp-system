'use client';

import { Button, Upload } from 'antd';
import { CameraOutlined, DeleteOutlined } from '@ant-design/icons';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';
import { tokens } from '@/lib/theme/tokens';

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,image/gif';
const MAX_BYTES = 5 * 1024 * 1024;

interface AddEmployeePendingPhotoProps {
  value: File | null;
  onChange: (file: File | null) => void;
}

/**
 * Selects a profile photo before the employee record exists (uploaded after create).
 */
export default function AddEmployeePendingPhoto({
  value,
  onChange,
}: AddEmployeePendingPhotoProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();

  return (
    <div className="flex flex-col gap-2">
      <div
        className="text-sm font-medium"
        style={{ color: tokens.colorTextPrimary }}
      >
        {t('users.profilePhoto')}
      </div>
      <p className="m-0 text-xs" style={{ color: tokens.colorTextSecondary }}>
        {t('users.photoHelp')}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Upload
          accept={ACCEPTED_TYPES}
          showUploadList={false}
          beforeUpload={(file) => {
            if (!ACCEPTED_TYPES.split(',').includes(file.type)) {
              messageApi.error(t('users.photoInvalidType'));
              return false;
            }
            if (file.size > MAX_BYTES) {
              messageApi.error(t('users.photoTooLarge'));
              return false;
            }
            onChange(file);
            return false;
          }}
        >
          <Button icon={<CameraOutlined />} style={{ borderRadius: 8 }}>
            {value ? t('users.changePhoto') : t('users.uploadPhoto')}
          </Button>
        </Upload>
        {value ? (
          <>
            <span className="text-sm" style={{ color: tokens.colorTextSecondary }}>
              {value.name}
            </span>
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => onChange(null)}
              aria-label={t('users.removePhoto')}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
