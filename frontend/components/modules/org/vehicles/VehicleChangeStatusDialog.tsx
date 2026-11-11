'use client';

import { useMemo } from 'react';
import { Form, Radio } from 'antd';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { VehicleStatus } from '@/lib/api/company-vehicle.types';
import {
  formatVehicleStatus,
  vehicleStatusChangeSelectOptions,
  vehicleStatusVariant,
} from '@/lib/utils/company-vehicle-display';
import { tokens } from '@/lib/theme/tokens';

export default function VehicleChangeStatusDialog({
  open,
  plateNumber,
  currentStatus,
  pendingStatus,
  confirmLoading = false,
  onPendingStatusChange,
  onConfirm,
  onCancel,
  className = 'erp-hr-travel-modal',
}: {
  open: boolean;
  plateNumber: string;
  currentStatus: VehicleStatus;
  pendingStatus: VehicleStatus | undefined;
  confirmLoading?: boolean;
  onPendingStatusChange: (status: VehicleStatus) => void;
  onConfirm: () => void;
  onCancel: () => void;
  className?: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();

  const statusOptions = useMemo(
    () => vehicleStatusChangeSelectOptions(t),
    [t],
  );

  const confirmDisabled =
    !pendingStatus || pendingStatus === currentStatus || confirmLoading;

  return (
    <ConfirmDialog
      className={className}
      open={open}
      title={t('vehicles.changeStatusTitle')}
      description={t('vehicles.changeStatusDescription', { plate: plateNumber })}
      confirmLabel={t('vehicles.updateStatus')}
      cancelLabel={t('common.cancel')}
      confirmLoading={confirmLoading}
      confirmDisabled={confirmDisabled}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <div className="mt-3 flex flex-col gap-4">
        <div
          className="rounded-xl border border-slate-200 px-3 py-3"
          style={{
            borderColor: tokens.colorBorder,
            background: tokens.colorSurfaceSecondary,
          }}
        >
          <p
            className="mb-1 text-xs font-medium uppercase tracking-wide"
            style={{ color: tokens.colorTextTertiary }}
          >
            {t('vehicles.statusDialog.currentLabel')}
          </p>
          <StatusBadge
            label={formatVehicleStatus(currentStatus, t)}
            variant={vehicleStatusVariant(currentStatus)}
          />
        </div>

        <Form layout="vertical" requiredMark={false}>
          <Form.Item
            label={t('vehicles.statusDialog.selectLabel')}
            className="mb-0"
          >
            <Radio.Group
              value={pendingStatus}
              onChange={(event) =>
                onPendingStatusChange(event.target.value as VehicleStatus)
              }
              disabled={confirmLoading}
              className="w-full"
            >
              <div className="flex w-full flex-col gap-2">
                {statusOptions.map((option) => {
                  const selected = pendingStatus === option.value;
                  return (
                    <label
                      key={option.value}
                      className="m-0 flex w-full cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3 py-3"
                      style={{
                        borderColor: selected
                          ? tokens.colorPrimary
                          : tokens.colorBorder,
                        background: selected
                          ? tokens.colorPrimaryLight
                          : tokens.colorCardBg,
                      }}
                    >
                      <Radio value={option.value} className="m-0" />
                      <div className="min-w-0 flex-1">
                        <div className="mb-1">
                          <StatusBadge
                            label={option.label}
                            variant={vehicleStatusVariant(option.value)}
                          />
                        </div>
                        <p
                          className="m-0 text-xs leading-snug"
                          style={{ color: tokens.colorTextSecondary }}
                        >
                          {t(
                            `vehicles.statusDialog.optionHint.${option.value}`,
                          )}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </Radio.Group>
          </Form.Item>
        </Form>

        <p
          className="m-0 text-xs leading-relaxed"
          style={{ color: tokens.colorTextTertiary }}
        >
          {t('vehicles.statusDialog.operationalHint')}
        </p>
      </div>
    </ConfirmDialog>
  );
}
