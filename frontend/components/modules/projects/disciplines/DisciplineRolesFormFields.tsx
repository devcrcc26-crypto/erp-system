'use client';

import { Form } from 'antd';
import ProjectTeamUserSelect from '@/components/ui/ProjectTeamUserSelect/ProjectTeamUserSelect';

export default function DisciplineRolesFormFields({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
        <Form.Item label="Designer" name="designerUserId">
          <ProjectTeamUserSelect projectId={projectId} />
        </Form.Item>
        <Form.Item label="Supporting designer" name="supportingDesignerUserId">
          <ProjectTeamUserSelect projectId={projectId} />
        </Form.Item>
      </div>
      <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
        <Form.Item label="Discipline owner" name="ownerUserId">
          <ProjectTeamUserSelect projectId={projectId} />
        </Form.Item>
        <Form.Item label="Reviewer" name="reviewerUserId">
          <ProjectTeamUserSelect projectId={projectId} />
        </Form.Item>
      </div>
      <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
        <Form.Item label="Dept chief engineer" name="chiefUserId">
          <ProjectTeamUserSelect projectId={projectId} />
        </Form.Item>
        <Form.Item label="Institute chief" name="instituteChiefUserId">
          <ProjectTeamUserSelect projectId={projectId} />
        </Form.Item>
      </div>
    </>
  );
}
