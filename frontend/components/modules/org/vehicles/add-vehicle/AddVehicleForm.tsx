'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Form, Input, InputNumber, Select, Skeleton, Switch, Typography } from 'antd';
import { ImageIcon, Paperclip } from 'lucide-react';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import AddVehicleReviewStep from '@/components/modules/org/vehicles/add-vehicle/AddVehicleReviewStep';
import VehiclePhoto from '@/components/modules/org/vehicles/VehiclePhoto';
import {
  ADD_VEHICLE_STEP_FIELDS,
  type AddVehicleFormValues,
} from '@/components/modules/org/vehicles/add-vehicle/add-vehicle.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';
import { ApiRequestError } from '@/lib/api/errors';
import {
  useCompanyVehicle,
  useCreateCompanyVehicle,
  useUpdateCompanyVehicle,
  useUploadCompanyVehiclePhoto,
} from '@/lib/query/company-vehicle';
import { useFullUsersDirectory } from '@/lib/query/users';
import {
  fuelTypeSelectOptions,
  toDriverSelectOptions,
  vehicleTypeSelectOptions,
} from '@/lib/utils/company-vehicle-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { tokens } from '@/lib/theme/tokens';

export interface AddVehicleFormProps {
  /** Leave form — shown in stepper footer beside Back. */
  onCancel?: () => void;
  cancelLabel?: string;
  vehicleId?: string;
  onSuccess: (vehicleId: string) => void;
}

export default function AddVehicleForm({
  vehicleId,
  onSuccess,
  onCancel,
  cancelLabel,
}: AddVehicleFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<AddVehicleFormValues>();
  const [error, setError] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEdit = Boolean(vehicleId);

  const vehicleQuery = useCompanyVehicle(vehicleId ?? '', isEdit);
  const usersQuery = useFullUsersDirectory();
  const createMutation = useCreateCompanyVehicle();
  const updateMutation = useUpdateCompanyVehicle(vehicleId ?? '');
  const uploadPhotoMutation = useUploadCompanyVehiclePhoto();

  const formValues = Form.useWatch([], form) as AddVehicleFormValues | undefined;

  const vehicleTypeOptions = useMemo(
    () => vehicleTypeSelectOptions(t),
    [t],
  );
  const fuelTypeOptions = useMemo(() => fuelTypeSelectOptions(t), [t]);
  const driverOptions = useMemo(
    () =>
      toDriverSelectOptions(
        usersQuery.data ?? [],
        vehicleQuery.data?.assignedDriverId
          ? [vehicleQuery.data.assignedDriverId]
          : [],
      ),
    [usersQuery.data, vehicleQuery.data?.assignedDriverId],
  );

  useEffect(() => {
    if (!isEdit || !vehicleQuery.data) {
      return;
    }
    const vehicle = vehicleQuery.data;
    form.setFieldsValue({
      plateNumber: vehicle.plateNumber,
      vehicleType: vehicle.vehicleType,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      fuelType: vehicle.fuelType,
      color: vehicle.color ?? undefined,
      assignedDriverId: vehicle.assignedDriverId ?? undefined,
      notes: vehicle.notes ?? undefined,
      isActive: vehicle.isActive,
    });
  }, [form, isEdit, vehicleQuery.data]);

  async function validateFields(
    fields: readonly string[],
  ): Promise<boolean> {
    try {
      await form.validateFields([...fields]);
      return true;
    } catch {
      return false;
    }
  }

  async function handleSubmit(): Promise<void> {
    setError(null);
    try {
      const values = await form.validateFields();
      const payload: AddVehicleFormValues = {
        ...values,
        color: values.color?.trim() || undefined,
        notes: values.notes?.trim() || undefined,
        assignedDriverId: values.assignedDriverId || undefined,
        isActive: values.isActive ?? true,
      };

      if (isEdit && vehicleId) {
        const updated = await updateMutation.mutateAsync(payload);
        if (photoFile) {
          await uploadPhotoMutation.mutateAsync({
            vehicleId,
            file: photoFile,
          });
        }
        onSuccess(vehicleId);
        return;
      }

      const created = await createMutation.mutateAsync(payload);
      if (photoFile) {
        await uploadPhotoMutation.mutateAsync({
          vehicleId: created.id,
          file: photoFile,
        });
      }
      onSuccess(created.id);
    } catch (submitError: unknown) {
      if (
        submitError &&
        typeof submitError === 'object' &&
        'errorFields' in submitError
      ) {
        return;
      }
      const message =
        submitError instanceof ApiRequestError
          ? submitError.message
          : isEdit
            ? t('vehicles.updateError')
            : t('vehicles.createError');
      setError(message);
      notifyApiError(submitError, message, messageApi);
    }
  }

  if (isEdit && vehicleQuery.isLoading) {
    return <Skeleton active paragraph={{ rows: 8 }} />;
  }

  if (isEdit && vehicleQuery.isError) {
    return (
      <Alert
        type="error"
        showIcon
        title={
          vehicleQuery.error instanceof ApiRequestError
            ? vehicleQuery.error.message
            : t('vehicles.loadError')
        }
      />
    );
  }

  const reviewValues = formValues ?? form.getFieldsValue();

  return (
    <Form
      form={form}
      layout="vertical"
      autoComplete="off"
      preserve
      initialValues={{ isActive: true }}
    >
      {error ? (
        <Alert
          type="error"
          showIcon
          title={error}
          closable
          onClose={() => setError(null)}
          className="mb-4"
        />
      ) : null}

      <StepperForm
        onCancel={onCancel}
        cancelLabel={cancelLabel}
        contentVariant="sections"
        isSubmitting={
          createMutation.isPending ||
          updateMutation.isPending ||
          uploadPhotoMutation.isPending
        }
        submitLabel={
          isEdit ? t('vehicles.updateVehicle') : t('vehicles.createVehicle')
        }
        onSubmit={handleSubmit}
        onReset={() => form.resetFields()}
        steps={[
          {
            title: t('vehicles.steps.identity'),
            validate: () =>
              validateFields(ADD_VEHICLE_STEP_FIELDS.identity),
            content: (
              <FormLayout
                variant="pro"
                title={t('vehicles.steps.identity')}
                description={t('vehicles.form.identityHelp')}
              >
                <div className="erp-form-grid-2">
                  <Form.Item
                    name="plateNumber"
                    label={t('hr.table.plateNumber')}
                    rules={[
                      {
                        required: true,
                        message: t('hr.validation.required'),
                      },
                    ]}
                  >
                    <Input
                      maxLength={20}
                      placeholder={t('vehicles.placeholder.plateNumber')}
                    />
                  </Form.Item>
                  <Form.Item
                    name="vehicleType"
                    label={t('vehicles.form.vehicleType')}
                    rules={[
                      {
                        required: true,
                        message: t('hr.validation.required'),
                      },
                    ]}
                  >
                    <Select
                      options={vehicleTypeOptions}
                      placeholder={t('vehicles.placeholder.vehicleType')}
                    />
                  </Form.Item>
                </div>
                <Form.Item name="fuelType" label={t('vehicles.form.fuelType')}>
                  <Select
                    allowClear
                    options={fuelTypeOptions}
                    placeholder={t('vehicles.placeholder.fuelType')}
                  />
                </Form.Item>
              </FormLayout>
            ),
          },
          {
            title: t('vehicles.steps.specifications'),
            validate: () =>
              validateFields(ADD_VEHICLE_STEP_FIELDS.specifications),
            content: (
              <FormLayout
                variant="pro"
                title={t('vehicles.steps.specifications')}
                description={t('vehicles.form.specificationsHelp')}
              >
                <div className="erp-form-grid-2">
                  <Form.Item
                    name="make"
                    label={t('hr.table.make')}
                    rules={[
                      {
                        required: true,
                        message: t('hr.validation.required'),
                      },
                    ]}
                  >
                    <Input
                      maxLength={100}
                      placeholder={t('vehicles.placeholder.make')}
                    />
                  </Form.Item>
                  <Form.Item
                    name="model"
                    label={t('hr.table.model')}
                    rules={[
                      {
                        required: true,
                        message: t('hr.validation.required'),
                      },
                    ]}
                  >
                    <Input
                      maxLength={100}
                      placeholder={t('vehicles.placeholder.model')}
                    />
                  </Form.Item>
                </div>
                <div className="erp-form-grid-2">
                  <Form.Item
                    name="year"
                    label={t('hr.table.year')}
                    rules={[
                      {
                        required: true,
                        message: t('hr.validation.required'),
                      },
                    ]}
                  >
                    <InputNumber
                      min={1980}
                      max={2100}
                      className="w-full"
                      placeholder={t('vehicles.placeholder.year')}
                    />
                  </Form.Item>
                  <Form.Item name="color" label={t('vehicles.form.color')}>
                    <Input
                      maxLength={50}
                      placeholder={t('vehicles.placeholder.color')}
                    />
                  </Form.Item>
                </div>
              </FormLayout>
            ),
          },
          {
            title: t('vehicles.steps.assignment'),
            content: (
              <FormLayout
                variant="pro"
                title={t('vehicles.steps.assignment')}
                description={t('vehicles.form.assignmentHelp')}
              >
                <Form.Item
                  name="assignedDriverId"
                  label={t('hr.table.assignedDriver')}
                >
                  <Select
                    showSearch
                    allowClear
                    placeholder={t('vehicles.placeholder.assignedDriver')}
                    loading={usersQuery.isLoading}
                    notFoundContent={
                      usersQuery.isLoading
                        ? t('common.loading')
                        : t('vehicles.noDriversFound')
                    }
                    filterOption={(input, option) =>
                      String(option?.label ?? '')
                        .toLowerCase()
                        .includes(input.toLowerCase())
                    }
                    options={driverOptions}
                  />
                </Form.Item>
                <Form.Item
                  name="isActive"
                  label={t('vehicles.form.activeVehicle')}
                  valuePropName="checked"
                >
                  <Switch />
                </Form.Item>
                <Form.Item name="notes" label={t('vehicles.form.notes')}>
                  <Input.TextArea
                    rows={4}
                    maxLength={2000}
                    showCount
                    placeholder={t('vehicles.placeholder.notes')}
                  />
                </Form.Item>
              </FormLayout>
            ),
          },
          {
            title: t('vehicles.steps.photo'),
            content: (
              <FormLayout
                variant="pro"
                title={t('vehicles.steps.photo')}
                description={t('vehicles.form.photoStepHelp')}
              >
                {isEdit && vehicleId && vehicleQuery.data?.photoDocumentId ? (
                  <div className="mb-4">
                    <VehiclePhoto
                      vehicleId={vehicleId}
                      photoDocumentId={vehicleQuery.data.photoDocumentId}
                      plateNumber={vehicleQuery.data.plateNumber}
                      canEdit
                      variant="panel"
                    />
                    <Typography.Paragraph
                      type="secondary"
                      className="!mb-3 !mt-4"
                      style={{ fontSize: 13 }}
                    >
                      {t('vehicles.form.photoReplaceHint')}
                    </Typography.Paragraph>
                  </div>
                ) : null}

                <Typography.Paragraph
                  type="secondary"
                  style={{ marginBottom: 12, fontSize: 13 }}
                >
                  {t('vehicles.form.photoOptionalHint')}
                </Typography.Paragraph>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  disabled={
                    createMutation.isPending ||
                    updateMutation.isPending ||
                    uploadPhotoMutation.isPending
                  }
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setPhotoFile(file);
                    event.target.value = '';
                  }}
                />

                <Button
                  type="default"
                  icon={<Paperclip size={14} />}
                  disabled={
                    createMutation.isPending ||
                    updateMutation.isPending ||
                    uploadPhotoMutation.isPending
                  }
                  onClick={() => fileInputRef.current?.click()}
                  style={{ marginBottom: 12 }}
                >
                  {t('vehicles.uploadPhoto')}
                </Button>

                {photoFile ? (
                  <div
                    className="flex items-center gap-3 rounded-lg border px-3 py-3"
                    style={{
                      borderColor: tokens.colorBorder,
                      background: tokens.colorCardBg,
                    }}
                  >
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg"
                      style={{
                        background: tokens.colorTeal50,
                        color: tokens.colorTeal400,
                        border: `1px solid ${tokens.colorPrimary}33`,
                      }}
                    >
                      <ImageIcon size={22} strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className="m-0 truncate text-sm font-medium"
                        style={{ color: tokens.colorTextPrimary }}
                        title={photoFile.name}
                      >
                        {photoFile.name}
                      </p>
                      <p
                        className="m-0 mt-0.5 text-xs"
                        style={{ color: tokens.colorTextTertiary }}
                      >
                        IMAGE · {(photoFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <Button
                      type="link"
                      size="small"
                      onClick={() => setPhotoFile(null)}
                    >
                      {t('common.delete')}
                    </Button>
                  </div>
                ) : null}
              </FormLayout>
            ),
          },
          {
            title: t('vehicles.steps.review'),
            content: (
              <AddVehicleReviewStep
                values={reviewValues}
                mode={isEdit ? 'edit' : 'create'}
                photoFileName={photoFile?.name}
              />
            ),
          },
        ]}
      />
    </Form>
  );
}
