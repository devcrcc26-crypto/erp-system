'use client';

import { Form, Input, Modal } from 'antd';
import type { DesignPackage } from '@/lib/api/epc.types';
import {
  useCreateDesignPackage,
  useUpdateDesignPackage,
} from '@/lib/query/design-packages';

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
  const isSubmitting = createPackage.isPending || updatePackage.isPending;

  async function handleSubmit(values: PackageFormValues): Promise<void> {
    const name = values.name.trim();

    if (editing) {
      await updatePackage.mutateAsync({
        projectId,
        taskDisciplineId,
        packageId: editing.id,
        body: { name },
      });
    } else {
      await createPackage.mutateAsync({
        projectId,
        taskDisciplineId,
        body: { name },
      });
    }

    onSaved();
    onClose();
  }

  return (
    <Modal
      open={open}
      title={editing ? 'Edit design package' : 'New design package'}
      onCancel={onClose}
      onOk={() => form.submit()}
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
