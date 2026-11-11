'use client';

import { useEffect, useState } from 'react';
import { Button, Form, Modal, Steps } from 'antd';
import type { TaskDiscipline } from '@/lib/api/project-management.types';
import DisciplineSimpleFormFields from '@/components/modules/projects/disciplines/DisciplineSimpleFormFields';
import DisciplineRolesFormFields from '@/components/modules/projects/disciplines/DisciplineRolesFormFields';
import {
  type DisciplineFormValues,
  toDisciplineFormValues,
  toDisciplinePayload,
} from '@/components/modules/projects/disciplines/discipline-form.util';
import { useUpdateTaskDiscipline } from '@/lib/query/schedule';
import { resolveDisciplineDisplayLabel } from '@/lib/utils/discipline-number';
import { wizardModalProps } from '@/lib/theme/layout';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';

export default function DisciplineBuilder({
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
  const [step, setStep] = useState(0);
  const updateDiscipline = useUpdateTaskDiscipline();
  const messageApi = useAppMessage();
  const isSubmitting = updateDiscipline.isPending;

  useEffect(() => {
    if (!open) {
      setStep(0);
      return;
    }
    if (discipline) {
      form.setFieldsValue(toDisciplineFormValues(discipline));
    }
  }, [discipline, form, open]);

  async function handleSubmit(): Promise<void> {
    if (!discipline) {
      return;
    }

    const values = form.getFieldsValue(true) as DisciplineFormValues;

    try {
      await updateDiscipline.mutateAsync({
        projectId,
        taskId,
        disciplineId: discipline.id,
        body: toDisciplinePayload(values),
      });
      messageApi.success('Discipline updated successfully');
      onSaved();
      onClose();
    } catch (error) {
      notifyApiError(error, 'Failed to update discipline', messageApi);
    }
  }

  async function handleNext(): Promise<void> {
    try {
      await form.validateFields(['disciplineId', 'disciplineLeadUserId']);
      setStep(1);
    } catch {
      // validation messages shown by ant form
    }
  }

  function renderFooter(): React.ReactNode {
    if (step === 0) {
      return (
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" onClick={() => void handleNext()}>
            Next: assign roles
          </Button>
        </div>
      );
    }

    return (
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={() => setStep(0)}>Back</Button>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          type="primary"
          loading={isSubmitting}
          onClick={() => void handleSubmit()}
        >
          Save changes
        </Button>
      </div>
    );
  }

  return (
    <Modal
      {...wizardModalProps}
      open={open}
      title={
        discipline
          ? `Edit discipline - ${resolveDisciplineDisplayLabel(discipline)}`
          : 'Edit discipline'
      }
      onCancel={onClose}
      footer={renderFooter()}
    >
      <Steps
        size="small"
        current={step}
        className="mb-6"
        items={[
          { title: 'Discipline details' },
          { title: 'Assign roles' },
        ]}
      />

      <Form<DisciplineFormValues>
        form={form}
        layout="vertical"
        preserve
        className="erp-drawer-form"
      >
        {step === 0 ? (
          <DisciplineSimpleFormFields
            projectId={projectId}
            disciplineReadOnly
          />
        ) : null}

        {step === 1 ? (
          <DisciplineRolesFormFields projectId={projectId} />
        ) : null}
      </Form>
    </Modal>
  );
}
