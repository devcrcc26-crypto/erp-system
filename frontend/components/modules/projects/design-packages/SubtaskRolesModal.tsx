'use client';

import { Form, Modal } from 'antd';
import type { DesignPackage } from '@/lib/api/epc.types';
import SubtaskRolesFormFields from '@/components/modules/projects/design-packages/SubtaskRolesFormFields';
import {
  type SubtaskRolesFormValues,
  toSubtaskRolesFormValues,
  toSubtaskRolesPayload,
} from '@/components/modules/projects/design-packages/subtask-roles-form.util';
import { useUpdateDesignPackage } from '@/lib/query/design-packages';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';

export default function SubtaskRolesModal({
  open,
  projectId,
  taskDisciplineId,
  subtask,
  onClose,
  onSaved,
}: {
  open: boolean;
  projectId: string;
  taskDisciplineId: string;
  subtask: DesignPackage | null;
  onClose: () => void;
  onSaved?: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<SubtaskRolesFormValues>();
  const updateSubtask = useUpdateDesignPackage();
  const messageApi = useAppMessage();

  async function handleSubmit(values: SubtaskRolesFormValues): Promise<void> {
    if (!subtask) {
      return;
    }

    try {
      await updateSubtask.mutateAsync({
        projectId,
        taskDisciplineId,
        packageId: subtask.id,
        body: toSubtaskRolesPayload(values),
      });
      messageApi.success('Subtask roles updated');
      onSaved?.();
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to update subtask roles', messageApi);
    }
  }

  return (
    <Modal
      open={open}
      title={subtask ? `Edit roles — ${subtask.name}` : 'Edit subtask roles'}
      centered
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Save roles"
      confirmLoading={updateSubtask.isPending}
      destroyOnHidden
      width={720}
      className="erp-responsive-modal"
      styles={{ body: { overflow: 'visible' } }}
      afterOpenChange={(visible: boolean) => {
        if (visible && subtask) {
          form.setFieldsValue(toSubtaskRolesFormValues(subtask));
        }
      }}
    >
      <Form<SubtaskRolesFormValues>
        form={form}
        layout="vertical"
        className="erp-drawer-form"
        onFinish={(values: SubtaskRolesFormValues) => void handleSubmit(values)}
      >
        <SubtaskRolesFormFields
          projectId={projectId}
          reviewLevel={subtask?.reviewLevel}
        />
      </Form>
    </Modal>
  );
}
