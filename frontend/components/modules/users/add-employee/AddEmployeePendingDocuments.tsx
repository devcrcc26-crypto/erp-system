'use client';

import { useState } from 'react';
import { Button, Input, List, Upload } from 'antd';
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
        <List
          size="small"
          dataSource={value}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button
                  key="remove"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => remove(item.uid)}
                />,
              ]}
            >
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                <span className="min-w-0 flex-1 truncate text-sm">{item.file.name}</span>
                <Input
                  size="small"
                  placeholder={t('users.form.documentLabel')}
                  value={item.label}
                  onChange={(event) => updateLabel(item.uid, event.target.value)}
                />
              </div>
            </List.Item>
          )}
        />
      ) : (
        <p className="text-sm text-slate-400">{t('users.form.noDocumentsSelected')}</p>
      )}
    </div>
  );
}
