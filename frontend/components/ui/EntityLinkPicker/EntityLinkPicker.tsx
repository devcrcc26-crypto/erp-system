'use client';

import { useState, type ChangeEvent } from 'react';
import {
  Alert,
  Button,
  Empty,
  Input,
  List,
  Modal,
  Select,
  Space,
  Tag,
} from 'antd';
import { DeleteOutlined, LinkOutlined, PlusOutlined } from '@ant-design/icons';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import {
  ENTITY_LINK_TYPE_LABELS,
  type EntityLink,
  type EntityLinkType,
} from '@/lib/api/documents.types';

/**
 * Manage polymorphic links between drawings and PM entities.
 * Search API wiring will be added with the project-management backend.
 */
export default function EntityLinkPicker({
  value = [],
  onChange,
  allowedTypes = ['drawing', 'rfi', 'submittal', 'issue', 'punch_item'],
  readOnly = false,
  title = 'Linked records',
  description = 'Associate related drawings, RFIs, submittals, issues, or punch items.',
}: {
  value?: EntityLink[];
  onChange?: (links: EntityLink[]) => void;
  allowedTypes?: EntityLinkType[];
  readOnly?: boolean;
  title?: string;
  description?: string;
}): React.ReactNode {
  const [modalOpen, setModalOpen] = useState(false);
  const [entityType, setEntityType] = useState<EntityLinkType>(allowedTypes[0]);
  const [entityId, setEntityId] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleAdd(): void {
    setError(null);

    if (!entityId.trim()) {
      setError('Reference ID is required.');
      return;
    }

    if (!label.trim()) {
      setError('Display label is required.');
      return;
    }

    const duplicate = value.some(
      (link) =>
        link.entityType === entityType && link.entityId === entityId.trim(),
    );

    if (duplicate) {
      setError('This link already exists.');
      return;
    }

    onChange?.([
      ...value,
      {
        entityType,
        entityId: entityId.trim(),
        label: label.trim(),
      },
    ]);

    setEntityId('');
    setLabel('');
    setModalOpen(false);
  }

  function handleRemove(link: EntityLink): void {
    onChange?.(
      value.filter(
        (item) =>
          !(
            item.entityType === link.entityType &&
            item.entityId === link.entityId
          ),
      ),
    );
  }

  return (
    <FormLayout
      title={title}
      description={description}
      extra={
        !readOnly ? (
          <Button icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Add link
          </Button>
        ) : undefined
      }
    >
      {value.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No linked records yet."
        />
      ) : (
        <List
          dataSource={value}
          renderItem={(link) => (
            <List.Item
              actions={
                readOnly
                  ? undefined
                  : [
                      <Button
                        key="remove"
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleRemove(link)}
                        aria-label={`Remove link ${link.label}`}
                      />,
                    ]
              }
            >
              <Space>
                <LinkOutlined className="text-slate-400" />
                <Tag>{ENTITY_LINK_TYPE_LABELS[link.entityType]}</Tag>
                <span className="font-medium text-slate-900">{link.label}</span>
                <span className="text-xs text-slate-500">{link.entityId}</span>
              </Space>
            </List.Item>
          )}
        />
      )}

      <Modal
        open={modalOpen}
        title="Add linked record"
        onCancel={() => {
          setModalOpen(false);
          setError(null);
        }}
        onOk={handleAdd}
        okText="Add link"
        destroyOnHidden
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Record type
            </label>
            <Select
              className="w-full"
              value={entityType}
              onChange={setEntityType}
              options={allowedTypes.map((type) => ({
                value: type,
                label: ENTITY_LINK_TYPE_LABELS[type],
              }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Reference ID
            </label>
            <Input
              value={entityId}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setEntityId(event.target.value)
              }
              placeholder="e.g. RFI-001 or drawing UUID"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Display label
            </label>
            <Input
              value={label}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setLabel(event.target.value)
              }
              placeholder="e.g. Structural RFI - Level 3 slab"
            />
          </div>
          <Alert
            type="info"
            showIcon
            message="Entity search will connect to the project API in the next phase."
          />
          {error && <Alert type="error" showIcon message={error} />}
        </div>
      </Modal>
    </FormLayout>
  );
}
