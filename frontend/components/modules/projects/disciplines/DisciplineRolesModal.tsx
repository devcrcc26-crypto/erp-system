'use client';

import { Form, Modal } from 'antd';
import type { TaskDiscipline } from '@/lib/api/project-management.types';
import { formatDisciplineLabel } from '@/lib/utils/discipline-display';
import DisciplineRolesFormFields from '@/components/modules/projects/disciplines/DisciplineRolesFormFields';
import {
  type DisciplineRolesFormValues,
  toDisciplineRolesFormValues,
  toDisciplineRolesPayload,
} from '@/components/modules/projects/disciplines/discipline-form.util';
import { useUpdateTaskDiscipline } from '@/lib/query/schedule';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';

export default function DisciplineRolesModal({
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
  onSaved?: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<DisciplineRolesFormValues>();
  const updateDiscipline = useUpdateTaskDiscipline();
  const messageApi = useAppMessage();

  async function handleSubmit(values: DisciplineRolesFormValues): Promise<void> {
    if (!discipline) {
      return;
    }

    try {
      await updateDiscipline.mutateAsync({
        projectId,
        taskId,
        disciplineId: discipline.id,
        body: toDisciplineRolesPayload(values),
      });
      messageApi.success('Discipline roles updated');
      onSaved?.();
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to update discipline roles', messageApi);
    }
  }

  return (
    <Modal
      open={open}
      title={
        discipline
          ? `Edit roles - ${formatDisciplineLabel(discipline.disciplineIndex)}`
          : 'Edit discipline roles'
      }
      centered
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Save roles"
      confirmLoading={updateDiscipline.isPending}
      destroyOnHidden
      width={720}
      className="erp-responsive-modal"
      afterOpenChange={(visible: boolean) => {
        if (visible && discipline) {
          form.setFieldsValue(toDisciplineRolesFormValues(discipline));
        }
      }}
    >
      <Form<DisciplineRolesFormValues>
        form={form}
        layout="vertical"
        className="erp-drawer-form"
        onFinish={(values: DisciplineRolesFormValues) => void handleSubmit(values)}
      >
        <DisciplineRolesFormFields projectId={projectId} />
      </Form>
    </Modal>
  );
}
