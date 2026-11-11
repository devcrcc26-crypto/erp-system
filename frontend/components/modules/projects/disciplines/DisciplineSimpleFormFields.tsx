'use client';

import { Form, Select } from 'antd';
import ProjectTeamUserSelect from '@/components/ui/ProjectTeamUserSelect/ProjectTeamUserSelect';
import { useEngineeringDisciplineOptions } from '@/lib/query/org';

export default function DisciplineSimpleFormFields({
  projectId,
  disciplineReadOnly = false,
}: {
  projectId: string;
  disciplineReadOnly?: boolean;
}): React.ReactNode {
  const { options, isLoading } = useEngineeringDisciplineOptions(true);

  return (
    <>
      <Form.Item
        label="Discipline"
        name="disciplineId"
        rules={[{ required: true, message: 'Discipline is required' }]}
      >
        <Select
          showSearch
          disabled={disciplineReadOnly}
          loading={isLoading}
          placeholder="Select discipline"
          options={options}
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
