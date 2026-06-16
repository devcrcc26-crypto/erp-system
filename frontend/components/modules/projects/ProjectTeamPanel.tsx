'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Spin,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import UserSelect from '@/components/ui/UserSelect/UserSelect';
import { ApiRequestError } from '@/lib/api/errors';
import type { ProjectTeamMember } from '@/lib/api/project-management.types';
import {
  useAddProjectTeamMember,
  useProjectTeam,
  useRemoveProjectTeamMember,
} from '@/lib/query/projects';
import { useUsers } from '@/lib/query/users';
import { formatProjectDate } from '@/lib/utils/project-display';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';

interface TeamMemberFormValues {
  userId: string;
  roleOnProject: string;
}

function useUserNameLookup(): (userId: string) => string {
  const usersQuery = useUsers({ page: 1, limit: 100 });
  const users = usersQuery.data?.data ?? [];

  return (userId: string) => {
    const user = users.find((item) => item.id === userId);
    if (!user) {
      return userId;
    }
    return `${user.firstName} ${user.lastName}`;
  };
}

export default function ProjectTeamPanel({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const [addOpen, setAddOpen] = useState(false);
  const [removingMember, setRemovingMember] =
    useState<ProjectTeamMember | null>(null);
  const [form] = Form.useForm<TeamMemberFormValues>();
  const teamQuery = useProjectTeam(projectId);
  const addMember = useAddProjectTeamMember();
  const removeMember = useRemoveProjectTeamMember();
  const resolveUserName = useUserNameLookup();

  const columns: ColumnsType<ProjectTeamMember> = [
    {
      title: 'Name',
      dataIndex: 'userId',
      key: 'userId',
      render: (userId: string) => resolveUserName(userId),
    },
    {
      title: 'Role on project',
      dataIndex: 'roleOnProject',
      key: 'roleOnProject',
    },
    {
      title: 'Assigned from',
      dataIndex: 'assignedFrom',
      key: 'assignedFrom',
      render: (value: string | null) => formatProjectDate(value),
    },
    {
      title: 'Assigned to',
      dataIndex: 'assignedTo',
      key: 'assignedTo',
      render: (value: string | null) => formatProjectDate(value),
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_value, record) => (
        <Button
          type="link"
          danger
          onClick={() => setRemovingMember(record)}
        >
          Remove
        </Button>
      ),
    },
  ];

  async function handleAddMember(values: TeamMemberFormValues): Promise<void> {
    await addMember.mutateAsync({
      projectId,
      body: {
        userId: values.userId,
        roleOnProject: values.roleOnProject.trim(),
      },
    });
    form.resetFields();
    setAddOpen(false);
  }

  async function handleRemoveMember(): Promise<void> {
    if (!removingMember) {
      return;
    }
    await removeMember.mutateAsync({
      projectId,
      memberId: removingMember.id,
    });
    setRemovingMember(null);
  }

  if (teamQuery.isLoading) {
    return (
      <div className="flex justify-center rounded-md bg-white p-12 shadow-sm">
        <Spin />
      </div>
    );
  }

  const apiUnavailable =
    teamQuery.isError &&
    teamQuery.error instanceof ApiRequestError &&
    (teamQuery.error.status === 404 || teamQuery.error.status === 0);

  const members = teamQuery.data ?? [];

  return (
    <>
      <FormLayout
        title="Project team"
        description="Assign users and roles for this project."
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setAddOpen(true)}
            disabled={apiUnavailable}
          >
            Add member
          </Button>
        }
      >
        {apiUnavailable && (
          <Alert
            type="info"
            showIcon
            className="!mb-4"
            message="Team management will be available when the project API is connected."
          />
        )}

        {members.length === 0 ? (
          <Alert
            type="info"
            showIcon
            message="No team members assigned yet."
          />
        ) : (
          <DataTable<ProjectTeamMember>
            rowKey="id"
            columns={columns}
            dataSource={members}
          />
        )}
      </FormLayout>

      <Modal
        open={addOpen}
        title="Add team member"
        onCancel={() => setAddOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={addMember.isPending}
        destroyOnHidden
      >
        <Form<TeamMemberFormValues>
          form={form}
          layout="vertical"
          onFinish={(values: TeamMemberFormValues) => void handleAddMember(values)}
        >
          <Form.Item
            label="User"
            name="userId"
            rules={[{ required: true, message: 'Select a user' }]}
          >
            <UserSelect />
          </Form.Item>
          <Form.Item
            label="Role on project"
            name="roleOnProject"
            rules={[{ required: true, message: 'Enter a project role' }]}
          >
            <Input placeholder="e.g. Site Engineer" />
          </Form.Item>
        </Form>
      </Modal>

      <ConfirmDialog
        open={Boolean(removingMember)}
        title="Remove team member"
        description="This user will no longer appear on the project team."
        confirmLabel="Remove"
        danger
        confirmLoading={removeMember.isPending}
        onConfirm={() => void handleRemoveMember()}
        onCancel={() => setRemovingMember(null)}
      />
    </>
  );
}
