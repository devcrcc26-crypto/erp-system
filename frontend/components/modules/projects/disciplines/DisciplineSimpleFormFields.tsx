'use client';

import { Form, Select } from 'antd';
import ProjectTeamUserSelect from '@/components/ui/ProjectTeamUserSelect/ProjectTeamUserSelect';
import { USER_DISCIPLINE_DEFINITIONS } from '@/lib/constants/user-discipline';

const DISCIPLINE_NAME_OPTIONS = USER_DISCIPLINE_DEFINITIONS.map(
  (definition) => ({
    value: definition.label,
    label: definition.label,
  }),
);

export default function DisciplineSimpleFormFields({
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
        <Select
          showSearch
          placeholder="Select discipline"
          options={DISCIPLINE_NAME_OPTIONS}
          optionFilterProp="label"
        />
      </Form.Item>
      <Form.Item
        label="Discipline leader"
        name="disciplineLeadUserId"
        rules={[{ required: true, message: 'Discipline leader is required' }]}
      >
        <ProjectTeamUserSelect projectId={projectId} />
      </Form.Item>
    </>
  );
}
