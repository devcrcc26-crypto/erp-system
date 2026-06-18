'use client';

import { DatePicker, Form, Input } from 'antd';
import type { TaskDiscipline } from '@/lib/api/project-management.types';
import {
  type DisciplineFormValues,
  toDisciplineFormValues,
} from '@/components/modules/projects/disciplines/discipline-form.util';

export default function DisciplineFormFields(): React.ReactNode {
  return (
    <>
      <Form.Item
        label="Discipline name"
        name="disciplineName"
        rules={[{ required: true, message: 'Discipline name is required' }]}
      >
        <Input placeholder="e.g. Structural" />
      </Form.Item>
      <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
        <Form.Item label="Designer" name="designerName">
          <Input />
        </Form.Item>
        <Form.Item label="Reviewer" name="reviewerName">
          <Input />
        </Form.Item>
      </div>
      <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
        <Form.Item label="Disciplinary leader" name="disciplinaryLeader">
          <Input />
        </Form.Item>
        <Form.Item label="Dept chief engineer" name="deptChiefEngineer">
          <Input />
        </Form.Item>
      </div>
      <Form.Item label="Institute chief engineer" name="instituteChiefEngineer">
        <Input />
      </Form.Item>
      <div className="grid gap-4 md:grid-cols-3 md:gap-x-4">
        <Form.Item label="Actual completion" name="actualCompletionTime">
          <DatePicker className="w-full" showTime />
        </Form.Item>
        <Form.Item label="Dept review time" name="deptReviewTime">
          <DatePicker className="w-full" showTime />
        </Form.Item>
        <Form.Item label="Institute review time" name="instituteReviewTime">
          <DatePicker className="w-full" showTime />
        </Form.Item>
      </div>
    </>
  );
}

export function setDisciplineFormValues(
  form: ReturnType<typeof Form.useForm<DisciplineFormValues>>[0],
  discipline: TaskDiscipline | null,
): void {
  if (discipline) {
    form.setFieldsValue(toDisciplineFormValues(discipline));
    return;
  }
  form.resetFields();
}
