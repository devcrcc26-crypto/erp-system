'use client';

import { DatePicker, Form, Input } from 'antd';
import type { TaskDiscipline } from '@/lib/api/project-management.types';
import ProjectTeamUserSelect from '@/components/ui/ProjectTeamUserSelect/ProjectTeamUserSelect';
import {
  type DisciplineFormValues,
  toDisciplineFormValues,
} from '@/components/modules/projects/disciplines/discipline-form.util';

export default function DisciplineFormFields({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
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
        <Form.Item label="Discipline owner" name="ownerUserId">
          <ProjectTeamUserSelect projectId={projectId} />
        </Form.Item>
        <Form.Item label="Designer" name="designerUserId">
          <ProjectTeamUserSelect projectId={projectId} />
        </Form.Item>
      </div>
      <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
        <Form.Item label="Reviewer" name="reviewerUserId">
          <ProjectTeamUserSelect projectId={projectId} />
        </Form.Item>
        <Form.Item label="Disciplinary leader" name="disciplineLeadUserId">
          <ProjectTeamUserSelect projectId={projectId} />
        </Form.Item>
      </div>
      <Form.Item label="Dept chief engineer" name="chiefUserId">
        <ProjectTeamUserSelect projectId={projectId} />
      </Form.Item>
      <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
        <Form.Item label="Institute chief" name="instituteChiefUserId">
          <ProjectTeamUserSelect projectId={projectId} />
        </Form.Item>
        <Form.Item label="Supporting designer" name="supportingDesignerUserId">
          <ProjectTeamUserSelect projectId={projectId} />
        </Form.Item>
      </div>
      <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
        <Form.Item label="Actual completion" name="actualCompletionTime">
          <DatePicker className="w-full" showTime />
        </Form.Item>
        <Form.Item label="Dept review time" name="deptReviewTime">
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
