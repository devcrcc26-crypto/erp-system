'use client';

import { Form, Modal } from 'antd';
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
  useUpdateTaskDiscipline,
} from '@/lib/query/schedule';

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
  taskId: string;
  discipline: TaskDiscipline | null;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<DisciplineFormValues>();
  const createDiscipline = useCreateTaskDiscipline();
  const updateDiscipline = useUpdateTaskDiscipline();
  const isSubmitting = createDiscipline.isPending || updateDiscipline.isPending;

  async function handleSubmit(values: DisciplineFormValues): Promise<void> {
    const body = toDisciplinePayload(values);

    if (discipline) {
      await updateDiscipline.mutateAsync({
        projectId,
        taskId,
        disciplineId: discipline.id,
        body,
      });
    } else {
      await createDiscipline.mutateAsync({ projectId, taskId, body });
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
      afterOpenChange={(visible: boolean) => {
        if (visible) {
          setDisciplineFormValues(form, discipline);
        }
      }}
    >
      <Form<DisciplineFormValues>
        form={form}
        layout="vertical"
        onFinish={(values: DisciplineFormValues) => void handleSubmit(values)}
      >
        <DisciplineFormFields />
      </Form>
    </Modal>
  );
}
