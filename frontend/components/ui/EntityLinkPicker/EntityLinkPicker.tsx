// UI polish pass - styles only, no logic changes

'use client';

import { useState, type ChangeEvent } from 'react';
import {
  Alert,
  Button,
  Empty,
  Input,
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
import { layout } from '@/lib/theme/layout';

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
      className="erp-drawer-attachment"
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
        <ul className="erp-drawer-file-list">
          {value.map((link) => (
            <li
              key={`${link.entityType}-${link.entityId}`}
              className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <Space>
                <LinkOutlined className="text-[var(--color-text-tertiary)]" />
                <Tag variant="filled">{ENTITY_LINK_TYPE_LABELS[link.entityType]}</Tag>
                <span className="text-[12px] font-medium text-[var(--color-text-primary)]">
                  {link.label}
                </span>
                <span className={layout.drawerMutedText}>{link.entityId}</span>
              </Space>
              {!readOnly && (
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleRemove(link)}
                  aria-label={`Remove link ${link.label}`}
                />
              )}
            </li>
          ))}
        </ul>
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
        <div className={layout.drawerStack}>
          <div>
            <label className={`mb-1 block ${layout.drawerHeading}`}>
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
            <label className={`mb-1 block ${layout.drawerHeading}`}>
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
            <label className={`mb-1 block ${layout.drawerHeading}`}>
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
            title="Entity search will connect to the project API in the next phase."
          />
          {error && <Alert type="error" showIcon title={error} />}
        </div>
      </Modal>
    </FormLayout>
  );
}
