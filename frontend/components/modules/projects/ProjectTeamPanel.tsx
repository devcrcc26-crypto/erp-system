// UI polish pass - styles only, no logic changes

'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Select } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import { ApiRequestError } from '@/lib/api/errors';
import type { ProjectTeamMember } from '@/lib/api/project-management.types';
import { useProjectTeam, useSetProjectTeam } from '@/lib/query/projects';
import { USER_DIRECTORY_PAGE_LIMIT, useUsersDirectory } from '@/lib/query/users';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { displayUserLabel, formatUserName, formatUserPickerLabel, formatUserRoleNames } from '@/lib/utils/user-display';

const EMPTY_TEAM: ProjectTeamMember[] = [];

function sameIdSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
}

function useUserDirectoryLookup(): (
  userId: string,
) => { name: string; roles: string } {
  const usersQuery = useUsersDirectory({ page: 1, limit: USER_DIRECTORY_PAGE_LIMIT });
  const users = usersQuery.data?.data ?? [];

  return (userId: string) => {
    const user = users.find((item) => item.id === userId);
    if (!user) {
      return { name: displayUserLabel(userId), roles: '-' };
    }
    return {
      name: formatUserName(user),
      roles: formatUserRoleNames(user),
    };
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
  const messageApi = useAppMessage();
  const resolveUser = useUserDirectoryLookup();

  const members = teamQuery.data ?? EMPTY_TEAM;

  useEffect(() => {
    if (dirty) {
      return;
    }
    const ids = teamQuery.data
      ? [...new Set(teamQuery.data.map((member) => member.userId))]
      : [];
    setSelectedUserIds((prev) => (sameIdSet(prev, ids) ? prev : ids));
  }, [teamQuery.data, dirty]);

  const userOptions = useMemo(() => {
    const users = usersQuery.data?.data ?? [];
    const seen = new Set<string>();
    return users
      .filter((user) => user.isActive)
      .filter((user) => {
        if (seen.has(user.id)) {
          return false;
        }
        seen.add(user.id);
        return true;
      })
      .map((user) => ({
        value: user.id,
        label: formatUserPickerLabel(user),
      }));
  }, [usersQuery.data?.data]);

  const columns: ColumnsType<ProjectTeamMember> = [
    {
      title: 'Name',
      dataIndex: 'userId',
      key: 'userId',
      render: (userId: string, record: ProjectTeamMember) =>
        record.userName ?? resolveUser(userId).name,
    },
    {
      title: 'Role',
      dataIndex: 'userId',
      key: 'role',
      render: (userId: string) => resolveUser(userId).roles,
    },
  ];

  async function handleSaveTeam(): Promise<void> {
    const uniqueUserIds = [...new Set(selectedUserIds)];
    try {
      await setTeam.mutateAsync({
        projectId,
        body: { userIds: uniqueUserIds },
      });
      messageApi.success('Team updated successfully');
      setDirty(false);
    } catch (error) {
      notifyApiError(error, 'Failed to update team', messageApi);
    }
  }

  if (teamQuery.isLoading) {
    return <PageLoadingSkeleton />;
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
        value={[...new Set(selectedUserIds)]}
        options={userOptions}
        loading={usersQuery.isLoading}
        disabled={apiUnavailable}
        onChange={(values: string[]) => {
          setSelectedUserIds([...new Set(values)]);
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
