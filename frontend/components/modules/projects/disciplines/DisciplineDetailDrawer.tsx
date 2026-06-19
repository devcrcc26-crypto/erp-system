'use client';

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
  const isSubmitting = createDiscipline.isPending || updateDiscipline.isPending;
  const isEditing = Boolean(discipline);
  const showTaskSelect = !isEditing && !taskId;

  const taskOptions = (tasksQuery.data?.data ?? []).map((task) => ({
    value: task.id,
    label: `${task.taskIdCode} — ${task.name}`,
  }));

  async function handleSubmit(values: DisciplineDetailFormValues): Promise<void> {
    const body = toDisciplinePayload(values);
    const resolvedTaskId = isEditing ? taskId : (taskId ?? values.scheduleTaskId);

    if (!resolvedTaskId) {
      return;
    }

    if (discipline) {
      await updateDiscipline.mutateAsync({
        projectId,
        taskId: resolvedTaskId,
        disciplineId: discipline.id,
        body,
      });
    } else {
      await createDiscipline.mutateAsync({ projectId, taskId: resolvedTaskId, body });
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
        <DisciplineFormFields />
      </Form>
    </Modal>
  );
}
