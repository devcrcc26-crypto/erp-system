'use client';

import { Form, Modal, Select } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import type { TaskDiscipline } from '@/lib/api/project-management.types';
import DisciplineSimpleFormFields from '@/components/modules/projects/disciplines/DisciplineSimpleFormFields';
import {
  type DisciplineSimpleFormValues,
  toDisciplineSimplePayload,
} from '@/components/modules/projects/disciplines/discipline-form.util';
import {
  useCreateTaskDiscipline,
  useTasks,
  useUpdateTaskDiscipline,
} from '@/lib/query/schedule';
import { orgKeys } from '@/lib/query/org';
import { isUuidLike } from '@/lib/utils/user-display';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface DisciplineDetailFormValues extends DisciplineSimpleFormValues {
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
  const messageApi = useAppMessage();
  const queryClient = useQueryClient();
  const createDiscipline = useCreateTaskDiscipline();
  const updateDiscipline = useUpdateTaskDiscipline();
  const tasksQuery = useTasks(projectId, { page: 1, limit: 100 }, open);
  const isSubmitting = createDiscipline.isPending || updateDiscipline.isPending;
  const isEditing = Boolean(discipline);
  const showTaskSelect = !isEditing && !taskId;
  const taskOptions = (tasksQuery.data?.data ?? []).map((task) => ({
    value: task.id,
    label: `${task.taskIdCode} - ${task.name}`,
  }));

  async function handleSubmit(values: DisciplineDetailFormValues): Promise<void> {
    const body = toDisciplineSimplePayload(values);
    const submitTaskId = isEditing ? taskId : (taskId ?? values.scheduleTaskId);

    if (!submitTaskId) {
      return;
    }

    const disciplineIdValid = isUuidLike(body.disciplineId);
    const leadUserIdValid = isUuidLike(body.disciplineLeadUserId);
    if (!disciplineIdValid || !leadUserIdValid) {
      const badField = !disciplineIdValid ? 'Discipline' : 'Discipline leader';
      console.error('[DisciplineDetailDrawer] invalid selection', {
        disciplineId: body.disciplineId,
        disciplineLeadUserId: body.disciplineLeadUserId,
      });
      messageApi.error(
        `${badField} selection looks out of date (not a valid id). Refreshing the list - please reselect and try again.`,
      );
      void queryClient.invalidateQueries({ queryKey: orgKeys.all });
      return;
    }

    try {
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
    } catch (error) {
      notifyApiError(
        error,
        discipline ? 'Failed to update discipline' : 'Failed to add discipline',
        messageApi,
      );
    }
  }

  return (
    <Modal
      open={open}
      title={discipline ? 'Edit discipline' : 'Add discipline'}
      centered
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={isEditing ? 'Save discipline' : 'Add discipline'}
      confirmLoading={isSubmitting}
      destroyOnHidden
      width={720}
      className="erp-responsive-modal"
      styles={{
        body: {
          paddingTop: 8,
          paddingBottom: 8,
          maxHeight: 'calc(100vh - 220px)',
          overflowY: 'auto',
        },
      }}
      afterOpenChange={(visible: boolean) => {
        if (visible) {
          if (discipline) {
            form.setFieldsValue({
              disciplineId: discipline.disciplineId ?? undefined,
              disciplineLeadUserId: discipline.disciplineLeadUserId ?? undefined,
            });
          } else {
            form.resetFields();
          }
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
        <DisciplineSimpleFormFields projectId={projectId} />
      </Form>
    </Modal>
  );
}
