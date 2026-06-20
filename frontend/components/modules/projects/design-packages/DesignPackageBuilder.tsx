'use client';

import { Form, Input, Modal } from 'antd';
import type { DesignPackage } from '@/lib/api/epc.types';
import {
  useCreateDesignPackage,
  useUpdateDesignPackage,
} from '@/lib/query/design-packages';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface PackageFormValues {
  name: string;
}

export default function DesignPackageBuilder({
  open,
  projectId,
  taskDisciplineId,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  projectId: string;
  taskDisciplineId: string;
  editing: DesignPackage | null;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactNode {
  const [form] = Form.useForm<PackageFormValues>();
  const createPackage = useCreateDesignPackage();
  const updatePackage = useUpdateDesignPackage();
  const messageApi = useAppMessage();
  const isSubmitting = createPackage.isPending || updatePackage.isPending;

  async function handleSubmit(values: PackageFormValues): Promise<void> {
    const name = values.name.trim();

    try {
      if (editing) {
        await updatePackage.mutateAsync({
          projectId,
          taskDisciplineId,
          packageId: editing.id,
          body: { name },
        });
        messageApi.success('Design package updated successfully');
      } else {
        await createPackage.mutateAsync({
          projectId,
          taskDisciplineId,
          body: { name },
        });
        messageApi.success('Design package created successfully');
      }

      onSaved();
      onClose();
    } catch (error) {
      notifyApiError(
        error,
        editing ? 'Failed to update design package' : 'Failed to create design package',
        messageApi,
      );
    }
  }

  return (
    <Modal
      open={open}
      title={editing ? 'Edit design package' : 'New design package'}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={editing ? 'Save changes' : 'Create package'}
      confirmLoading={isSubmitting}
      destroyOnHidden
      afterOpenChange={(visible: boolean) => {
        if (!visible) {
          return;
        }
        if (editing) {
          form.setFieldsValue({ name: editing.name });
          return;
        }
        form.resetFields();
      }}
    >
      <Form<PackageFormValues>
        form={form}
        layout="vertical"
        onFinish={(values: PackageFormValues) => void handleSubmit(values)}
      >
        <Form.Item
          label="Package name"
          name="name"
          rules={[{ required: true, message: 'Package name is required' }]}
        >
          <Input placeholder="e.g. Structural IFC package" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
