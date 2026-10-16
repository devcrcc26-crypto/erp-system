'use client';

import { Descriptions } from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useFullUsersDirectory } from '@/lib/query/users';
import {
  formatFuelType,
  formatVehicleType,
  toDriverSelectOptions,
} from '@/lib/utils/company-vehicle-display';
import type { AddVehicleFormValues } from './add-vehicle.types';

interface AddVehicleReviewStepProps {
  values: AddVehicleFormValues;
  mode?: 'create' | 'edit';
  photoFileName?: string;
}

export default function AddVehicleReviewStep({
  values,
  mode = 'create',
  photoFileName,
}: AddVehicleReviewStepProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const usersQuery = useFullUsersDirectory();
  const driverOptions = toDriverSelectOptions(
    usersQuery.data ?? [],
    values.assignedDriverId ? [values.assignedDriverId] : [],
  );
  const driverLabel =
    driverOptions.find((option) => option.value === values.assignedDriverId)
      ?.label ?? '-';

  return (
    <FormLayout
      variant="pro"
      title={t('vehicles.steps.review')}
      description={
        mode === 'edit'
          ? t('vehicles.form.reviewEditHelp')
          : t('vehicles.form.reviewCreateHelp')
      }
    >
      <Descriptions
        column={1}
        bordered
        size="small"
        styles={{
          root: { borderRadius: 2, overflow: 'hidden' },
        }}
      >
        <Descriptions.Item label={t('hr.table.plateNumber')}>
          {values.plateNumber}
        </Descriptions.Item>
        <Descriptions.Item label={t('vehicles.form.vehicleType')}>
          {formatVehicleType(values.vehicleType, t)}
        </Descriptions.Item>
        <Descriptions.Item label={t('vehicles.form.fuelType')}>
          {values.fuelType
            ? formatFuelType(values.fuelType, t)
            : '-'}
        </Descriptions.Item>
        <Descriptions.Item label={t('hr.table.make')}>
          {values.make}
        </Descriptions.Item>
        <Descriptions.Item label={t('hr.table.model')}>
          {values.model}
        </Descriptions.Item>
        <Descriptions.Item label={t('hr.table.year')}>
          {values.year}
        </Descriptions.Item>
        <Descriptions.Item label={t('vehicles.form.color')}>
          {values.color?.trim() || '-'}
        </Descriptions.Item>
        <Descriptions.Item label={t('hr.table.assignedDriver')}>
          {driverLabel}
        </Descriptions.Item>
        <Descriptions.Item label={t('vehicles.form.activeVehicle')}>
          {values.isActive === false
            ? t('common.inactive')
            : t('common.active')}
        </Descriptions.Item>
        <Descriptions.Item label={t('vehicles.form.notes')}>
          {values.notes?.trim() || '-'}
        </Descriptions.Item>
        <Descriptions.Item label={t('vehicles.form.photo')}>
          {photoFileName ?? '-'}
        </Descriptions.Item>
      </Descriptions>
    </FormLayout>
  );
}
