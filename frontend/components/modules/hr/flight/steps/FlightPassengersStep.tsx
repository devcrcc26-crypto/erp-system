'use client';

import { Card, Checkbox, Col, Input, Row, Select, Space, Tag, Typography } from 'antd';
import type { FlightSelectablePassenger, FlightVisaStatus } from '@/lib/api/flight.types';
import { tokens } from '@/lib/theme/tokens';
import { FLIGHT_VISA_STATUS_OPTIONS } from '@/lib/utils/flight-display';
import type { FlightPassengerValues } from './flight-stepper.types';

/**
 * Step 2 — passenger selection and travel-document fields.
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
    <div
      className="rounded-lg p-4"
      style={{
        border: `1px solid ${tokens.colorBorder}`,
        background: tokens.colorCardBg,
      }}
    >
      <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>
        Passengers
      </Typography.Title>

      <div className="mb-4">
        <Typography.Text
          style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
        >
          Select Passengers{' '}
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
          placeholder="Search and select passengers"
          className="w-full"
        />
      </div>

      {isInternational && values.length > 0 ? (
        <div className="mt-4 flex flex-col gap-3">
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            International flight — please provide travel documents for each
            passenger.
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
                      Passport Number{' '}
                      <span style={{ color: tokens.colorRed600 }}>*</span>
                    </Typography.Text>
                    <Input
                      size="small"
                      placeholder="e.g. A12345678"
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
                      Visa Required
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
                        Visa Status
                      </Typography.Text>
                      <Select
                        size="small"
                        className="w-full"
                        options={FLIGHT_VISA_STATUS_OPTIONS}
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
