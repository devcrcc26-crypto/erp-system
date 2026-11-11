'use client';

import { useMemo } from 'react';
import { Select, Tag } from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { useFullUsersDirectory } from '@/lib/query/users';
import { useAppMessage } from '@/hooks/use-app-message';
import { formatUserPickerLabel } from '@/lib/utils/user-display';
import { tokens } from '@/lib/theme/tokens';

export interface TaskDisciplineDraft {
  key: string;
  disciplineId: string;
  disciplineName: string;
  disciplineLeadUserId: string;
  isExisting?: boolean;
  packageCount?: number;
}

export default function TaskDisciplinesEditor({
  disciplines,
  onChange,
}: {
  disciplines: TaskDisciplineDraft[];
  onChange: (next: TaskDisciplineDraft[]) => void;
}): React.ReactNode {
  const messageApi = useAppMessage();
  const usersQuery = useFullUsersDirectory();

  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);

  const userById = useMemo(
    () => new Map(users.map((user) => [user.id, user])),
    [users],
  );

  const eligibleEmployees = useMemo(
    () =>
      users.filter(
        (user) => user.engineeringDisciplineId !== null && user.isActive,
      ),
    [users],
  );

  const selectedUserIds = useMemo(
    () => disciplines.map((entry) => entry.disciplineLeadUserId),
    [disciplines],
  );

  const options = useMemo(() => {
    const base = eligibleEmployees.map((user) => ({
      value: user.id,
      label: formatUserPickerLabel(user),
    }));

    for (const id of selectedUserIds) {
      if (!base.some((option) => option.value === id)) {
        const user = userById.get(id);
        const fallback = disciplines.find(
          (entry) => entry.disciplineLeadUserId === id,
        )?.disciplineName;
        base.push({
          value: id,
          label: user ? formatUserPickerLabel(user) : fallback || 'Unknown user',
        });
      }
    }

    return base;
  }, [eligibleEmployees, selectedUserIds, userById, disciplines]);

  const lockedLeaderUserIds = useMemo(
    () =>
      new Set(
        disciplines
          .filter((entry) => entry.isExisting)
          .map((entry) => entry.disciplineLeadUserId),
      ),
    [disciplines],
  );

  const lockedEntries = disciplines.filter((entry) => entry.isExisting);

  function handleSelectionChange(nextUserIds: string[]): void {
    const currentUserIds = disciplines.map((entry) => entry.disciplineLeadUserId);
    const removedIds = currentUserIds.filter((id) => !nextUserIds.includes(id));

    const blockedRemoval = removedIds.some((id) => lockedLeaderUserIds.has(id));

    if (blockedRemoval) {
      messageApi.error(
        'Cannot remove an assigned discipline leader. Change roles on subtask roles instead.',
      );
      return;
    }

    const addedIds = nextUserIds.filter((id) => !currentUserIds.includes(id));
    const keptDrafts = disciplines.filter((entry) =>
      nextUserIds.includes(entry.disciplineLeadUserId),
    );

    const newDrafts: TaskDisciplineDraft[] = [];
    for (const id of addedIds) {
      const user = userById.get(id);
      if (!user?.engineeringDisciplineId) {
        continue;
      }
      newDrafts.push({
        key: `new-${id}`,
        disciplineId: user.engineeringDisciplineId,
        disciplineName: user.engineeringDiscipline?.name ?? '',
        disciplineLeadUserId: id,
      });
    }

    onChange([...keptDrafts, ...newDrafts]);
  }

  return (
    <FormLayout title="Disciplines">
      <Select
        mode="multiple"
        showSearch
        className="w-full"
        loading={usersQuery.isLoading}
        placeholder="Select discipline leaders"
        options={options}
        optionFilterProp="label"
        value={selectedUserIds}
        onChange={handleSelectionChange}
        tagRender={({ label, value, closable, onClose }) => {
          const isLocked = lockedLeaderUserIds.has(String(value));
          return (
            <Tag
              closable={!isLocked && closable}
              onClose={onClose}
              className="mr-1"
            >
              {label}
            </Tag>
          );
        }}
        notFoundContent={usersQuery.isLoading ? 'Loading…' : 'No eligible employees found'}
      />
      {disciplines.length === 0 && (
        <p
          className="mt-2 text-[13px]"
          style={{ color: tokens.colorTextSecondary }}
        >
          No disciplines assigned yet. Select discipline leaders above.
        </p>
      )}
      {lockedEntries.length > 0 && (
        <p
          className="mt-2 text-[11px]"
          style={{ color: tokens.colorTextTertiary }}
        >
          Assigned discipline leaders cannot be removed. To change who performs
          work on a subtask, use subtask roles.
        </p>
      )}
    </FormLayout>
  );
}
