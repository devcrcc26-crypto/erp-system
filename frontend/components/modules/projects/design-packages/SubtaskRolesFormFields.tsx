'use client';

import { Form } from 'antd';
import ProjectTeamUserSelect from '@/components/ui/ProjectTeamUserSelect/ProjectTeamUserSelect';

export default function SubtaskRolesFormFields({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
        <Form.Item label="Designer (设计)" name="designerUserId">
          <ProjectTeamUserSelect projectId={projectId} />
        </Form.Item>
        <Form.Item label="Supporting designer" name="supportingDesignerUserId">
          <ProjectTeamUserSelect projectId={projectId} />
        </Form.Item>
      </div>
      <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
        <Form.Item label="Discipline owner" name="disciplineOwnerUserId">
          <ProjectTeamUserSelect projectId={projectId} />
        </Form.Item>
        <Form.Item label="Reviewer (复核)" name="reviewerUserId">
          <ProjectTeamUserSelect projectId={projectId} />
        </Form.Item>
      </div>
      <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
        <Form.Item label="Disciplinary leader (专册)" name="disciplinaryLeaderUserId">
          <ProjectTeamUserSelect projectId={projectId} />
        </Form.Item>
        <Form.Item
          label="(Deputy) Chief Engineer of The Department (院审)"
          name="deptDeputyChiefUserId"
        >
          <ProjectTeamUserSelect projectId={projectId} />
        </Form.Item>
      </div>
      <div className="grid gap-4 md:grid-cols-2 md:gap-x-4">
        <Form.Item
          label="Chief Engineer of The Institute (司审)"
          name="instituteChiefUserId"
        >
          <ProjectTeamUserSelect projectId={projectId} />
        </Form.Item>
      </div>
    </>
  );
}
