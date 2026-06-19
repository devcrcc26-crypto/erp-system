'use client';

import { useMemo } from 'react';
import { Form, Modal, Select } from 'antd';
import type { TaskDiscipline } from '@/lib/api/project-management.types';
import DisciplineFormFields, {
  setDisciplineFormValues,
} from '@/components/modules/projects/disciplines/DisciplineFormFields';
import {
  type DisciplineFormValues,
  toDisciplinePayload,
} from '@/components/modules/projects/disciplines/discipline-form.util';
import {
  useCreateTaskDiscipline,
  useTasks,
  useUpdateTaskDiscipline,
} from '@/lib/query/schedule';
import { useUsersDirectory } from '@/lib/query/users';

interface DisciplineDetailFormValues extends DisciplineFormValues {
  scheduleTaskId?: string;
}

export default function DisciplineDetailDrawer({
  open,
  projectId,
  taskId,
  discipline,
  onClose,
  onSaved,
}: {
  open: boolean;
  projectId: string;
  /** When omitted on create, the user picks a schedule task in the form. */
  taskId?: string;
  discipline: TaskDiscipline | null;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<DisciplineDetailFormValues>();
  const createDiscipline = useCreateTaskDiscipline();
  const updateDiscipline = useUpdateTaskDiscipline();
  const tasksQuery = useTasks(projectId, { page: 1, limit: 100 }, open);
  const usersQuery = useUsersDirectory(
    { page: 1, limit: 100 },
    { enabled: open },
  );
  const isSubmitting = createDiscipline.isPending || updateDiscipline.isPending;
  const isEditing = Boolean(discipline);
  const showTaskSelect = !isEditing && !taskId;
  const selectedTaskId = Form.useWatch('scheduleTaskId', form);

  const taskOptions = (tasksQuery.data?.data ?? []).map((task) => ({
    value: task.id,
    label: `${task.taskIdCode} — ${task.name}`,
  }));

  const resolvedTaskId = isEditing
    ? taskId
    : (taskId ?? selectedTaskId);

  const instituteChiefLabel = useMemo(() => {
    if (isEditing && discipline?.instituteChiefEngineer) {
      return discipline.instituteChiefEngineer;
    }

    const tasks = tasksQuery.data?.data ?? [];
    const task = tasks.find((row) => row.id === resolvedTaskId);
    if (!task?.instituteChiefUserId) {
      return null;
    }

    const user = (usersQuery.data?.data ?? []).find(
      (row) => row.id === task.instituteChiefUserId,
    );
    if (!user) {
      return task.instituteChiefUserId;
    }
    return `${user.firstName} ${user.lastName}`;
  }, [
    discipline?.instituteChiefEngineer,
    isEditing,
    resolvedTaskId,
    tasksQuery.data?.data,
    usersQuery.data?.data,
  ]);

  async function handleSubmit(values: DisciplineDetailFormValues): Promise<void> {
    const body = toDisciplinePayload(values);
    const submitTaskId = isEditing ? taskId : (taskId ?? values.scheduleTaskId);

    if (!submitTaskId) {
      return;
    }

    if (discipline) {
      await updateDiscipline.mutateAsync({
        projectId,
        taskId: submitTaskId,
        disciplineId: discipline.id,
        body,
      });
    } else {
      await createDiscipline.mutateAsync({ projectId, taskId: submitTaskId, body });
    }

    onSaved();
    onClose();
  }

  return (
    <Modal
      open={open}
      title={discipline ? 'Edit discipline' : 'Add discipline'}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={isSubmitting}
      destroyOnHidden
      size={720}
      styles={{ body: { paddingTop: 8, paddingBottom: 8 } }}
      afterOpenChange={(visible: boolean) => {
        if (visible) {
          setDisciplineFormValues(form, discipline);
          if (showTaskSelect) {
            form.setFieldValue('scheduleTaskId', undefined);
          }
        }
      }}
    >
      <Form<DisciplineDetailFormValues>
        form={form}
        layout="vertical"
        className="erp-drawer-form"
        onFinish={(values: DisciplineDetailFormValues) => void handleSubmit(values)}
      >
        {showTaskSelect && (
          <Form.Item
            label="Schedule task"
            name="scheduleTaskId"
            rules={[{ required: true, message: 'Select a schedule task' }]}
          >
            <Select
              showSearch
              placeholder="Link discipline to a task"
              loading={tasksQuery.isLoading}
              options={taskOptions}
              optionFilterProp="label"
            />
          </Form.Item>
        )}
        <DisciplineFormFields
          projectId={projectId}
          instituteChiefLabel={instituteChiefLabel}
        />
      </Form>
    </Modal>
  );
}
