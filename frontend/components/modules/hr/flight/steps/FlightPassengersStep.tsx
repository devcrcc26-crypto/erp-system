'use client';

import { useMemo } from 'react';
import { Checkbox, Col, Input, Row, Select } from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import type {
  FlightSelectablePassenger,
  FlightVisaStatus,
} from '@/lib/api/flight.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { FlightPassengerValues } from './flight-stepper.types';

/**
 * Step 2 - passenger selection and travel-document fields.
 */
export default function FlightPassengersStep({
  values,
  onChange,
  isInternational,
  selectablePassengers,
  loading = false,
}: {
  values: FlightPassengerValues[];
  onChange: (next: FlightPassengerValues[]) => void;
  isInternational: boolean;
  selectablePassengers: FlightSelectablePassenger[];
  loading?: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();

  const visaStatusOptions = useMemo(
    () => [
      { value: 'NOT_APPLIED' as const, label: t('hr.visaStatus.NOT_APPLIED') },
      { value: 'APPLIED' as const, label: t('hr.visaStatus.APPLIED') },
      { value: 'APPROVED' as const, label: t('hr.visaStatus.APPROVED') },
    ],
    [t],
  );

  const options = selectablePassengers.map((p) => ({
    value: p.id,
    label: p.name + (p.position ? ` - ${p.position}` : ''),
  }));

  function handleSelect(employeeIds: string[]): void {
    const nameById = new Map(
      selectablePassengers.map((p) => [p.id, p.name] as const),
    );
    const prevById = new Map(values.map((p) => [p.employeeId, p] as const));
    onChange(
      employeeIds.map((id) => {
        const existing = prevById.get(id);
        return (
          existing ?? {
            employeeId: id,
            name: nameById.get(id) ?? id,
            visaRequired: false,
          }
        );
      }),
    );
  }

  function updatePassenger(
    employeeId: string,
    patch: Partial<FlightPassengerValues>,
  ): void {
    onChange(
      values.map((p) =>
        p.employeeId === employeeId ? { ...p, ...patch } : p,
      ),
    );
  }

  return (
    <FormLayout
      variant="pro"
      dense
      title={t('hr.form.passengers')}
      description={t('pages.hr.flight.passengersStepDescription')}
    >
      <div className="mb-0">
        <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
          {t('hr.form.selectPassengers')}{' '}
          <span className="text-[#DC2626]">*</span>
        </label>
        <Select
          mode="multiple"
          allowClear
          showSearch
          optionFilterProp="label"
          loading={loading}
          options={options}
          value={values.map((p) => p.employeeId)}
          onChange={handleSelect}
          placeholder={t('hr.placeholder.selectPassengers')}
          className="w-full"
        />
      </div>

      {isInternational && values.length > 0 ? (
        <div className="mt-5 flex flex-col gap-3">
          <p className="m-0 text-[13px] text-[var(--color-text-secondary)]">
            {t('pages.hr.flight.internationalPassengerHint')}
          </p>
          {values.map((passenger) => (
            <div
              key={passenger.employeeId}
              className="overflow-hidden rounded-[10px] border border-[#e8ebef] bg-[#fbfcfd]"
            >
              <div className="border-b border-[#eef1f4] bg-white px-3 py-2.5 sm:px-4">
                <span className="erp-users-role-tag">{passenger.name}</span>
              </div>
              <div className="px-3 py-3 sm:px-4">
                <Row gutter={[12, 0]}>
                  <Col xs={24} sm={10}>
                    <div className="mb-2 sm:mb-0">
                      <label className="mb-1.5 block text-[13px] text-[var(--color-text-primary)]">
                        {t('hr.form.passportNumber')}{' '}
                        <span className="text-[#DC2626]">*</span>
                      </label>
                      <Input
                        placeholder={t('hr.form.passportNumber')}
                        maxLength={20}
                        value={passenger.passportNumber ?? ''}
                        onChange={(e) =>
                          updatePassenger(passenger.employeeId, {
                            passportNumber: e.target.value,
                          })
                        }
                      />
                    </div>
                  </Col>
                  <Col xs={24} sm={7}>
                    <div className="mb-2 flex items-center gap-1 sm:mb-0 sm:pt-7">
                      <Checkbox
                        checked={passenger.visaRequired}
                        onChange={(e) =>
                          updatePassenger(passenger.employeeId, {
                            visaRequired: e.target.checked,
                            visaStatus: e.target.checked
                              ? passenger.visaStatus
                              : undefined,
                          })
                        }
                      >
                        {t('hr.form.visaRequired')}
                      </Checkbox>
                    </div>
                  </Col>
                  {passenger.visaRequired ? (
                    <Col xs={24} sm={7}>
                      <div>
                        <label className="mb-1.5 block text-[13px] text-[var(--color-text-primary)]">
                          {t('hr.form.visaStatus')}
                        </label>
                        <Select
                          className="w-full"
                          options={visaStatusOptions}
                          value={passenger.visaStatus ?? 'NOT_APPLIED'}
                          onChange={(visaStatus: FlightVisaStatus) =>
                            updatePassenger(passenger.employeeId, {
                              visaStatus,
                            })
                          }
                        />
                      </div>
                    </Col>
                  ) : null}
                </Row>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </FormLayout>
  );
}
