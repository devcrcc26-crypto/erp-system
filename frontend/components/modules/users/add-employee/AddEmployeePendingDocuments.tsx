'use client';

import { Button, Input, Upload } from 'antd';
import { DeleteOutlined, UploadOutlined } from '@ant-design/icons';
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

  function handleSelect(file: File): false {
    onChange([
      ...value,
      {
        uid: `${file.name}-${file.lastModified}-${Math.random()}`,
        file,
        label: file.name.replace(/\.[^.]+$/, ''),
      },
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
    <div className="space-y-4">
      <p className="text-sm text-slate-500">{t('users.form.documentsHelp')}</p>
      <Upload multiple beforeUpload={handleSelect} showUploadList={false}>
        <Button icon={<UploadOutlined />}>{t('users.form.selectDocuments')}</Button>
      </Upload>
      {value.length > 0 ? (
        <div className="divide-y divide-slate-200 rounded border border-slate-200">
          {value.map((item) => (
            <div
              key={item.uid}
              className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                <span className="min-w-0 flex-1 truncate text-sm">{item.file.name}</span>
                <Input
                  size="small"
                  placeholder={t('users.form.documentLabel')}
                  value={item.label}
                  onChange={(event) => updateLabel(item.uid, event.target.value)}
                />
              </div>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => remove(item.uid)}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400">{t('users.form.noDocumentsSelected')}</p>
      )}
    </div>
  );
}
