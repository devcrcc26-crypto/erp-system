'use client';

import { useMemo } from 'react';
import { Select } from 'antd';
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

  const lockedEntries = disciplines.filter(
    (entry) => entry.isExisting && (entry.packageCount ?? 0) > 0,
  );

  function handleSelectionChange(nextUserIds: string[]): void {
    const currentUserIds = disciplines.map((entry) => entry.disciplineLeadUserId);
    const removedIds = currentUserIds.filter((id) => !nextUserIds.includes(id));

    const blockedRemoval = removedIds.some((id) => {
      const entry = disciplines.find((d) => d.disciplineLeadUserId === id);
      return Boolean(entry?.isExisting) && (entry?.packageCount ?? 0) > 0;
    });

    if (blockedRemoval) {
      messageApi.error(
        'Cannot remove a discipline leader who already has packages under their discipline.',
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
        <ul className="mt-2 space-y-1">
          {lockedEntries.map((entry) => (
            <li
              key={entry.key}
              className="text-[11px]"
              style={{ color: tokens.colorTextTertiary }}
            >
              [{entry.disciplineName}] has {entry.packageCount} package(s) —
              cannot remove
            </li>
          ))}
        </ul>
      )}
    </FormLayout>
  );
}
