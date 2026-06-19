'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Select, Spin } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { ApiRequestError } from '@/lib/api/errors';
import type { ProjectTeamMember } from '@/lib/api/project-management.types';
import { useProjectTeam, useSetProjectTeam } from '@/lib/query/projects';
import { useUsersDirectory } from '@/lib/query/users';
import type { User } from '@/lib/api/types';

function formatUserLabel(user: User): string {
  return `${user.firstName} ${user.lastName} (${user.email})`;
}

function useUserNameLookup(): (userId: string) => string {
  const usersQuery = useUsersDirectory({ page: 1, limit: 100 });
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
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);

  const teamQuery = useProjectTeam(projectId);
  const usersQuery = useUsersDirectory({
    page: 1,
    limit: 100,
    sortBy: 'firstName',
    sortOrder: 'asc',
  });
  const setTeam = useSetProjectTeam();
  const resolveUserName = useUserNameLookup();

  const members = teamQuery.data ?? [];

  useEffect(() => {
    if (!dirty) {
      setSelectedUserIds(members.map((member) => member.userId));
    }
  }, [members, dirty]);

  const userOptions = useMemo(() => {
    const users = usersQuery.data?.data ?? [];
    return users
      .filter((user) => user.isActive)
      .map((user) => ({
        value: user.id,
        label: formatUserLabel(user),
      }));
  }, [usersQuery.data?.data]);

  const columns: ColumnsType<ProjectTeamMember> = [
    {
      title: 'Name',
      dataIndex: 'userId',
      key: 'userId',
      render: (userId: string) => resolveUserName(userId),
    },
  ];

  async function handleSaveTeam(): Promise<void> {
    await setTeam.mutateAsync({
      projectId,
      body: { userIds: selectedUserIds },
    });
    setDirty(false);
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

  return (
    <FormLayout
      title="Project team"
      description="Select users who can be assigned to tasks and disciplines on this project."
      extra={
        <Button
          type="primary"
          onClick={() => void handleSaveTeam()}
          loading={setTeam.isPending}
          disabled={apiUnavailable || !dirty}
        >
          Save team
        </Button>
      }
    >
      {apiUnavailable && (
        <Alert
          type="info"
          showIcon
          className="!mb-4"
          title="Team management will be available when the project API is connected."
        />
      )}

      <Select
        mode="multiple"
        allowClear
        showSearch
        className="mb-4 w-full max-w-2xl"
        placeholder="Select project team members"
        value={selectedUserIds}
        options={userOptions}
        loading={usersQuery.isLoading}
        disabled={apiUnavailable}
        onChange={(values: string[]) => {
          setSelectedUserIds(values);
          setDirty(true);
        }}
        filterOption={(input: string, option?: { label?: unknown }) =>
          String(option?.label ?? '')
            .toLowerCase()
            .includes(input.toLowerCase())
        }
      />

      {members.length === 0 ? (
        <Alert type="info" showIcon title="No team members saved yet." />
      ) : (
        <DataTable<ProjectTeamMember>
          rowKey="id"
          columns={columns}
          dataSource={members}
        />
      )}
    </FormLayout>
  );
}
