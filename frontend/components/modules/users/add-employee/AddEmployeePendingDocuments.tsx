'use client';

import { Button, Input, Upload } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { FilePlus2 } from 'lucide-react';
import ProfileFileTypeIcon, {
  profileFileMetaLine,
} from '@/components/modules/users/ProfileFileTypeIcon';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

export interface PendingEmployeeDocument {
  uid: string;
  file: File;
  label: string;
}

interface AddEmployeePendingDocumentsProps {
  value: PendingEmployeeDocument[];
  onChange: (next: PendingEmployeeDocument[]) => void;
}

export default function AddEmployeePendingDocuments({
  value,
  onChange,
}: AddEmployeePendingDocumentsProps): React.ReactNode {
  const { t } = useEpcTranslation();

  /**
   * Upload calls this once per selected file in the same tick, so `value`
   * is stale for all but the first call. Add the whole batch once, on its
   * last file, so multi-select keeps every file.
   */
  function handleSelect(file: File, batch: File[]): false {
    if (file !== batch[batch.length - 1]) {
      return false;
    }
    onChange([
      ...value,
      ...batch.map((item) => ({
        uid: `${item.name}-${item.lastModified}-${Math.random()}`,
        file: item,
        label: item.name.replace(/\.[^.]+$/, ''),
      })),
    ]);
    return false;
  }

  function updateLabel(uid: string, label: string): void {
    onChange(value.map((item) => (item.uid === uid ? { ...item, label } : item)));
  }

  function remove(uid: string): void {
    onChange(value.filter((item) => item.uid !== uid));
  }

  return (
    <div className="erp-profile-docs erp-profile-docs--embedded">
      <div className="erp-profile-docs-toolbar">
        <Upload multiple beforeUpload={handleSelect} showUploadList={false}>
          <Button icon={<PlusOutlined />}>{t('users.form.selectDocuments')}</Button>
        </Upload>
      </div>
      {value.length > 0 ? (
        <div className="erp-profile-docs-grid">
          {value.map((item) => (
            <article
              key={item.uid}
              className="erp-profile-doc-card erp-profile-doc-card--pending"
            >
              <div className="erp-profile-doc-card-top">
                <ProfileFileTypeIcon name={item.file.name} fileType={item.file.type} />
                <Button
                  type="text"
                  danger
                  size="small"
                  className="erp-profile-doc-card-action"
                  icon={<DeleteOutlined />}
                  onClick={() => remove(item.uid)}
                  aria-label={t('common.delete')}
                />
              </div>
              <div className="erp-profile-doc-card-body">
                <p className="erp-profile-doc-card-name" title={item.file.name}>
                  {item.file.name}
                </p>
                <p className="erp-profile-doc-card-meta">
                  {profileFileMetaLine(item.file.name, item.file.type, item.file.size)}
                </p>
                <Input
                  size="small"
                  className="erp-profile-doc-card-label"
                  placeholder={t('users.form.documentLabel')}
                  value={item.label}
                  onChange={(event) => updateLabel(item.uid, event.target.value)}
                />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="erp-profile-docs-empty">
          <div className="erp-profile-docs-empty-icon" aria-hidden>
            <FilePlus2 size={22} strokeWidth={1.6} />
          </div>
          <p className="erp-profile-docs-empty-title">
            {t('users.form.noDocumentsSelected')}
          </p>
        </div>
      )}
    </div>
  );
}
