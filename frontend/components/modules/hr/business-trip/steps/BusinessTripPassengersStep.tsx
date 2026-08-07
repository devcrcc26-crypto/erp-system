'use client';

import { useMemo } from 'react';
import { Card, Checkbox, Col, Input, Row, Select, Space, Tag, Typography } from 'antd';
import type {
  BusinessTripSelectablePassenger,
  FlightVisaStatus,
} from '@/lib/api/business-trip.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { tokens } from '@/lib/theme/tokens';
import type { BusinessTripPassengerValues } from './business-trip-stepper.types';

/**
 * Step 3 — passengers (always international document fields).
 */
export default function BusinessTripPassengersStep({
  values,
  onChange,
  selectablePassengers,
  loading = false,
}: {
  values: BusinessTripPassengerValues[];
  onChange: (next: BusinessTripPassengerValues[]) => void;
  selectablePassengers: BusinessTripSelectablePassenger[];
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
    label: p.name + (p.position ? ` — ${p.position}` : ''),
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
            visaRequired: true,
          }
        );
      }),
    );
  }

  function updatePassenger(
    employeeId: string,
    patch: Partial<BusinessTripPassengerValues>,
  ): void {
    onChange(
      values.map((p) =>
        p.employeeId === employeeId ? { ...p, ...patch } : p,
      ),
    );
  }

  return (
    <div
      className="rounded-lg p-4"
      style={{
        border: `1px solid ${tokens.colorBorder}`,
        background: tokens.colorCardBg,
      }}
    >
      <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>
        {t('hr.form.passengers')}
      </Typography.Title>

      <div className="mb-4">
        <Typography.Text
          style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
        >
          {t('hr.form.selectPassengers')}{' '}
          <span style={{ color: tokens.colorRed600 }}>*</span>
        </Typography.Text>
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

      {values.length > 0 ? (
        <div className="mt-4 flex flex-col gap-3">
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {t('hr.form.passportNumber')}
          </Typography.Text>
          {values.map((passenger) => (
            <Card
              key={passenger.employeeId}
              size="small"
              title={
                <Space size={6}>
                  <Tag color="blue">{passenger.name}</Tag>
                </Space>
              }
            >
              <Row gutter={12}>
                <Col xs={24} sm={10}>
                  <div className="mb-2">
                    <Typography.Text
                      style={{ display: 'block', marginBottom: 4, fontSize: 13 }}
                    >
                      {t('hr.form.passportNumber')}{' '}
                      <span style={{ color: tokens.colorRed600 }}>*</span>
                    </Typography.Text>
                    <Input
                      size="small"
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
                  <div className="mb-2 flex items-center gap-1 pt-6">
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
                    <div className="mb-2">
                      <Typography.Text
                        style={{
                          display: 'block',
                          marginBottom: 4,
                          fontSize: 13,
                        }}
                      >
                        {t('hr.form.visaStatus')}
                      </Typography.Text>
                      <Select
                        size="small"
                        className="w-full"
                        options={visaStatusOptions}
                        value={passenger.visaStatus ?? 'NOT_APPLIED'}
                        onChange={(visaStatus: FlightVisaStatus) =>
                          updatePassenger(passenger.employeeId, { visaStatus })
                        }
                      />
                    </div>
                  </Col>
                ) : null}
              </Row>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
