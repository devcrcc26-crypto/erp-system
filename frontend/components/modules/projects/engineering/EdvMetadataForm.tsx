'use client';

import { Form, Input, Select } from 'antd';
import type { EngineeringDocumentType } from '@/lib/api/epc.types';

const DOCUMENT_TYPES: { value: EngineeringDocumentType; label: string }[] = [
  { value: 'DRAWING', label: 'Drawing' },
  { value: 'REPORT', label: 'Report' },
  { value: 'CALCULATION', label: 'Calculation' },
  { value: 'SPECIFICATION', label: 'Specification' },
  { value: 'PROGRAMME_SCHEDULE', label: 'Programme / Schedule' },
  { value: 'OTHER', label: 'Other' },
];

export interface EdvMetadataFormValues {
  documentType: EngineeringDocumentType;
  title: string;
  documentNumber?: string;
  drawingNumber?: string;
  sheetNumber?: string;
  scale?: string;
  reportNumber?: string;
  calculationRef?: string;
  specSection?: string;
  scheduleRef?: string;
  notes?: string;
}

export function buildMetadataFromForm(
  documentType: EngineeringDocumentType,
  values: EdvMetadataFormValues,
): Record<string, unknown> {
  const base: Record<string, unknown> = {};
  if (values.notes?.trim()) {
    base.notes = values.notes.trim();
  }

  switch (documentType) {
    case 'DRAWING':
      return {
        ...base,
        drawingNumber: values.drawingNumber?.trim(),
        sheetNumber: values.sheetNumber?.trim(),
        scale: values.scale?.trim(),
      };
    case 'REPORT':
      return { ...base, reportNumber: values.reportNumber?.trim() };
    case 'CALCULATION':
      return { ...base, calculationRef: values.calculationRef?.trim() };
    case 'SPECIFICATION':
      return { ...base, specSection: values.specSection?.trim() };
    case 'PROGRAMME_SCHEDULE':
      return { ...base, scheduleRef: values.scheduleRef?.trim() };
    default:
      return base;
  }
}

export default function EdvMetadataForm({
  documentType,
}: {
  documentType: EngineeringDocumentType;
}): React.ReactNode {
  return (
    <>
      <Form.Item
        label="Document type"
        name="documentType"
        rules={[{ required: true, message: 'Document type is required' }]}
      >
        <Select options={DOCUMENT_TYPES} />
      </Form.Item>
      <Form.Item
        label="Title"
        name="title"
        rules={[{ required: true, message: 'Title is required' }]}
      >
        <Input placeholder="Document title" />
      </Form.Item>
      <Form.Item label="Document number" name="documentNumber">
        <Input placeholder="Optional - auto-numbered if blank" />
      </Form.Item>

      {documentType === 'DRAWING' && (
        <div className="grid gap-4 md:grid-cols-3">
          <Form.Item label="Drawing number" name="drawingNumber">
            <Input />
          </Form.Item>
          <Form.Item label="Sheet" name="sheetNumber">
            <Input />
          </Form.Item>
          <Form.Item label="Scale" name="scale">
            <Input />
          </Form.Item>
        </div>
      )}

      {documentType === 'REPORT' && (
        <Form.Item label="Report number" name="reportNumber">
          <Input />
        </Form.Item>
      )}

      {documentType === 'CALCULATION' && (
        <Form.Item label="Calculation reference" name="calculationRef">
          <Input />
        </Form.Item>
      )}

      {documentType === 'SPECIFICATION' && (
        <Form.Item label="Spec section" name="specSection">
          <Input />
        </Form.Item>
      )}

      {documentType === 'PROGRAMME_SCHEDULE' && (
        <Form.Item label="Schedule reference" name="scheduleRef">
          <Input />
        </Form.Item>
      )}

      <Form.Item label="Notes" name="notes">
        <Input.TextArea rows={2} />
      </Form.Item>
    </>
  );
}

export { DOCUMENT_TYPES };
