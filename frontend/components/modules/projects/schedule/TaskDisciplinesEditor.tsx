'use client';

import { useMemo, useState } from 'react';
import { Button, Modal, Select } from 'antd';
import { CloseOutlined, PlusOutlined } from '@ant-design/icons';
import ProjectTeamUserSelect from '@/components/ui/ProjectTeamUserSelect/ProjectTeamUserSelect';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { USER_DISCIPLINE_DEFINITIONS } from '@/lib/constants/user-discipline';
import { useProjectTeam } from '@/lib/query/projects';
import { tokens } from '@/lib/theme/tokens';

const DISCIPLINE_NAME_OPTIONS = USER_DISCIPLINE_DEFINITIONS.map(
  (definition) => ({
    value: definition.label,
    label: definition.label,
  }),
);

export interface TaskDisciplineDraft {
  key: string;
  disciplineName: string;
  disciplineLeadUserId: string;
  isExisting?: boolean;
  packageCount?: number;
}

interface AddDisciplineFormState {
  disciplineName?: string;
  disciplineLeadUserId?: string;
}

export default function TaskDisciplinesEditor({
  projectId,
  disciplines,
  onChange,
}: {
  projectId: string;
  disciplines: TaskDisciplineDraft[];
  onChange: (next: TaskDisciplineDraft[]) => void;
}): React.ReactNode {
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<AddDisciplineFormState>({});
  const teamQuery = useProjectTeam(projectId);

  const leaderNameById = useMemo(
    () =>
      new Map(
        (teamQuery.data ?? [])
          .filter((member) => member.userName)
          .map((member) => [member.userId, member.userName as string]),
      ),
    [teamQuery.data],
  );

  function handleAdd(): void {
    if (!draft.disciplineName || !draft.disciplineLeadUserId) {
      return;
    }

    onChange([
      ...disciplines,
      {
        key: `new-${Date.now()}`,
        disciplineName: draft.disciplineName,
        disciplineLeadUserId: draft.disciplineLeadUserId,
      },
    ]);
    setDraft({});
    setAddOpen(false);
  }

  function handleRemove(key: string): void {
    onChange(disciplines.filter((entry) => entry.key !== key));
  }

  return (
    <FormLayout
      title="Disciplines"
      extra={
        <Button
          type="link"
          size="small"
          className="!px-0"
          icon={<PlusOutlined />}
          onClick={() => setAddOpen(true)}
        >
          Add
        </Button>
      }
    >
      {disciplines.length === 0 ? (
        <p className="text-[13px]" style={{ color: tokens.colorTextSecondary }}>
          No disciplines assigned yet. Add disciplines and leaders before saving.
        </p>
      ) : (
        <ul className="space-y-2">
          {disciplines.map((entry) => {
            const leaderName =
              leaderNameById.get(entry.disciplineLeadUserId) ?? 'Unknown';
            const canRemove = !entry.isExisting || (entry.packageCount ?? 0) === 0;

            return (
              <li
                key={entry.key}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                style={{ borderColor: tokens.colorBorder }}
              >
                <div className="min-w-0">
                  <span className="text-[13px] font-medium">
                    [{entry.disciplineName}]
                  </span>
                  <span
                    className="ml-2 text-[12px]"
                    style={{ color: tokens.colorTextSecondary }}
                  >
                    Leader: {leaderName}
                  </span>
                  {entry.isExisting && (entry.packageCount ?? 0) > 0 && (
                    <p
                      className="mt-0.5 text-[11px]"
                      style={{ color: tokens.colorTextTertiary }}
                    >
                      Has {entry.packageCount} package(s) — cannot remove
                    </p>
                  )}
                </div>
                {canRemove && (
                  <Button
                    type="text"
                    size="small"
                    aria-label="Remove discipline"
                    icon={<CloseOutlined />}
                    onClick={() => handleRemove(entry.key)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={addOpen}
        title="Add discipline"
        centered
        okText="Add"
        onCancel={() => {
          setAddOpen(false);
          setDraft({});
        }}
        onOk={handleAdd}
        okButtonProps={{
          disabled: !draft.disciplineName || !draft.disciplineLeadUserId,
        }}
        destroyOnHidden
        width={480}
      >
        <div className="space-y-4 py-2">
          <div>
            <label className="mb-1 block text-[13px] font-medium">
              Discipline name
            </label>
            <Select
              showSearch
              className="w-full"
              placeholder="Select discipline"
              options={DISCIPLINE_NAME_OPTIONS}
              value={draft.disciplineName}
              onChange={(value: string) =>
                setDraft((current) => ({ ...current, disciplineName: value }))
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium">
              Discipline leader
            </label>
            <ProjectTeamUserSelect
              projectId={projectId}
              value={draft.disciplineLeadUserId}
              onChange={(userId) =>
                setDraft((current) => ({
                  ...current,
                  disciplineLeadUserId: userId,
                }))
              }
            />
          </div>
        </div>
      </Modal>
    </FormLayout>
  );
}
