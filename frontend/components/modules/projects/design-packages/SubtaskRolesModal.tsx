'use client';

import { useEffect } from 'react';
import { Form, Modal } from 'antd';
import type { DesignPackage } from '@/lib/api/epc.types';
import SubtaskRolesFormFields from '@/components/modules/projects/design-packages/SubtaskRolesFormFields';
import {
  type SubtaskRolesFormValues,
  mergeSubtaskRolesWithDisciplineDefaults,
  toSubtaskRolesFormValues,
  toSubtaskRolesPayload,
} from '@/components/modules/projects/design-packages/subtask-roles-form.util';
import { useUpdateDesignPackage } from '@/lib/query/design-packages';
import { useProjectDiscipline } from '@/lib/query/disciplines';
import { useAuthStore } from '@/stores/auth.store';
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
  const currentUserId = useAuthStore((state) => state.user?.id);
  const disciplineQuery = useProjectDiscipline(
    projectId,
    taskDisciplineId,
    open,
  );

  useEffect(() => {
    if (!open || !subtask) {
      return;
    }
    const values = toSubtaskRolesFormValues(subtask);
    if (!disciplineQuery.data) {
      form.setFieldsValue(values);
      return;
    }
    form.setFieldsValue(
      mergeSubtaskRolesWithDisciplineDefaults(
        values,
        disciplineQuery.data,
        currentUserId,
      ),
    );
  }, [open, subtask, disciplineQuery.data, currentUserId, form]);

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
      title={subtask ? `Edit roles - ${subtask.name}` : 'Edit subtask roles'}
      centered
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Save roles"
      confirmLoading={updateSubtask.isPending}
      destroyOnHidden
      width={720}
      className="erp-responsive-modal"
      styles={{ body: { overflow: 'visible' } }}
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
          initialSiteRepType={
            subtask
              ? (toSubtaskRolesFormValues(subtask).siteRepType ?? 'EXTERNAL')
              : 'EXTERNAL'
          }
        />
      </Form>
    </Modal>
  );
}
