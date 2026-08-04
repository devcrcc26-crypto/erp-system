'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Form,
  Input,
  Radio,
  Row,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import type { Dayjs } from 'dayjs';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import { useAppMessage } from '@/hooks/use-app-message';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  FlightApplicationDetail,
  FlightTicketClass,
  FlightTripType,
  FlightVisaStatus,
} from '@/lib/api/flight.types';
import {
  useSelectablePassengers,
  useSubmitFlightApplication,
} from '@/lib/query/flight';
import { useCurrentUser } from '@/lib/query/profile';
import { tokens } from '@/lib/theme/tokens';
import {
  FLIGHT_TICKET_CLASS_OPTIONS,
  FLIGHT_VISA_STATUS_OPTIONS,
} from '@/lib/utils/flight-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface PassengerDetail {
  passportNumber?: string;
  visaRequired: boolean;
  visaStatus?: FlightVisaStatus;
}

interface FlightFormValues {
  tripType: FlightTripType;
  isInternational: boolean;
  origin: string;
  destination: string;
  departureDate: Dayjs;
  returnDate?: Dayjs;
  purpose: string;
  ticketClass: FlightTicketClass;
  accommodationRequired: boolean;
  accommodationDetails?: string;
  perDiemRequired: boolean;
  notes?: string;
  passengerIds: string[];
}

export interface FlightApplicationFormProps {
  onSuccess?: (created: FlightApplicationDetail) => void;
  submitLabel?: string;
  embedded?: boolean;
}

/**
 * Reusable flight application form.
 * When embedded=true the FormLayout chrome is omitted (e.g. inside a modal).
 */
export function FlightApplicationForm({
  onSuccess,
  submitLabel = 'Submit Application',
  embedded = false,
}: FlightApplicationFormProps): React.ReactNode {
  const messageApi = useAppMessage();
  const [form] = Form.useForm<FlightFormValues>();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [passengerDetails, setPassengerDetails] = useState<
    Record<string, PassengerDetail>
  >({});

  const currentUser = useCurrentUser();
  const passengersQuery = useSelectablePassengers();
  const submitMutation = useSubmitFlightApplication();

  const tripType = Form.useWatch('tripType', form) as FlightTripType | undefined;
  const isInternational = Form.useWatch('isInternational', form) as
    | boolean
    | undefined;
  const passengerIds = (Form.useWatch('passengerIds', form) as string[] | undefined) ?? [];
  const accommodationRequired = Form.useWatch('accommodationRequired', form) as
    | boolean
    | undefined;

  const passengerOptions = useMemo(
    () =>
      (passengersQuery.data ?? []).map((p) => ({
        value: p.id,
        label: p.name + (p.position ? ` — ${p.position}` : ''),
      })),
    [passengersQuery.data],
  );

  useEffect(() => {
    if (currentUser.data?.id) {
      form.setFieldsValue({
        tripType: 'ONE_WAY',
        ticketClass: 'ECONOMY',
        isInternational: false,
        accommodationRequired: false,
        perDiemRequired: false,
        passengerIds: [currentUser.data.id],
      });
    }
  }, [currentUser.data, form]);

  useEffect(() => {
    if (passengerIds.length === 0) {
      return;
    }
    setPassengerDetails((prev) => {
      const next: Record<string, PassengerDetail> = {};
      for (const id of passengerIds) {
        next[id] = prev[id] ?? { visaRequired: false };
      }
      return next;
    });
  }, [passengerIds]);

  function updatePassengerDetail(
    employeeId: string,
    patch: Partial<PassengerDetail>,
  ): void {
    setPassengerDetails((prev) => ({
      ...prev,
      [employeeId]: { ...(prev[employeeId] ?? { visaRequired: false }), ...patch },
    }));
  }

  async function handleSubmit(values: FlightFormValues): Promise<void> {
    try {
      const created = await submitMutation.mutateAsync({
        tripType: values.tripType,
        isInternational: values.isInternational ?? false,
        origin: values.origin.trim(),
        destination: values.destination.trim(),
        departureDate: values.departureDate.format('YYYY-MM-DD'),
        returnDate:
          values.tripType === 'ROUND_TRIP' && values.returnDate
            ? values.returnDate.format('YYYY-MM-DD')
            : undefined,
        purpose: values.purpose.trim(),
        ticketClass: values.ticketClass,
        accommodationRequired: values.accommodationRequired ?? false,
        accommodationDetails:
          values.accommodationRequired
            ? values.accommodationDetails?.trim() || undefined
            : undefined,
        perDiemRequired: values.perDiemRequired ?? false,
        notes: values.notes?.trim() || undefined,
        passengers: values.passengerIds.map((id) => {
          const detail = passengerDetails[id] ?? { visaRequired: false };
          return {
            employeeId: id,
            passportNumber: detail.passportNumber?.trim() || undefined,
            visaRequired: isInternational ? detail.visaRequired : false,
            visaStatus:
              isInternational && detail.visaRequired
                ? detail.visaStatus
                : undefined,
          };
        }),
        files: selectedFiles,
      });
      messageApi.success('Flight application submitted');
      onSuccess?.(created);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to submit flight application', messageApi);
    }
  }

  const selectedPassengerNames: Record<string, string> = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of passengersQuery.data ?? []) {
      map[p.id] = p.name;
    }
    return map;
  }, [passengersQuery.data]);

  const formContent = (
    <>
      {submitMutation.isError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            submitMutation.error instanceof ApiRequestError
              ? submitMutation.error.message
              : 'Submit failed'
          }
        />
      ) : null}

      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => void handleSubmit(values)}
      >
        {/* ── Section 1: Trip Details ─────────────────────────────────── */}
        <div
          className="mb-6 rounded-lg p-4"
          style={{
            border: `1px solid ${tokens.colorBorder}`,
            background: tokens.colorCardBg,
          }}
        >
          <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>
            Trip Details
          </Typography.Title>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="tripType"
                label="Trip Type"
                rules={[{ required: true, message: 'Select trip type' }]}
              >
                <Radio.Group>
                  <Radio value="ONE_WAY">One Way</Radio>
                  <Radio value="ROUND_TRIP">Round Trip</Radio>
                </Radio.Group>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="isInternational" valuePropName="checked">
                <Checkbox>International flight</Checkbox>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="origin"
                label="Origin"
                rules={[
                  { required: true, message: 'Enter origin city / airport' },
                ]}
              >
                <Input placeholder="e.g. Dubai (DXB)" maxLength={100} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="destination"
                label="Destination"
                rules={[
                  { required: true, message: 'Enter destination city / airport' },
                ]}
              >
                <Input placeholder="e.g. Riyadh (RUH)" maxLength={100} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={tripType === 'ROUND_TRIP' ? 12 : 24}>
              <Form.Item
                name="departureDate"
                label="Departure Date"
                rules={[{ required: true, message: 'Select departure date' }]}
              >
                <DatePicker className="w-full" />
              </Form.Item>
            </Col>
            {tripType === 'ROUND_TRIP' ? (
              <Col xs={24} sm={12}>
                <Form.Item
                  name="returnDate"
                  label="Return Date"
                  rules={[
                    { required: true, message: 'Select return date for round trip' },
                  ]}
                >
                  <DatePicker className="w-full" />
                </Form.Item>
              </Col>
            ) : null}
          </Row>

          <Form.Item
            name="purpose"
            label="Purpose of Travel"
            rules={[{ required: true, message: 'Enter the purpose of travel' }]}
          >
            <Input.TextArea
              rows={3}
              maxLength={2000}
              showCount
              placeholder="Describe the business reason for travel"
            />
          </Form.Item>

          <Form.Item
            name="ticketClass"
            label="Ticket Class"
            rules={[{ required: true, message: 'Select ticket class' }]}
          >
            <Select options={FLIGHT_TICKET_CLASS_OPTIONS} placeholder="Select class" />
          </Form.Item>
        </div>

        {/* ── Section 2: Passengers ──────────────────────────────────── */}
        <div
          className="mb-6 rounded-lg p-4"
          style={{
            border: `1px solid ${tokens.colorBorder}`,
            background: tokens.colorCardBg,
          }}
        >
          <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>
            Passengers
          </Typography.Title>

          <Form.Item
            name="passengerIds"
            label="Select Passengers"
            rules={[
              {
                required: true,
                type: 'array',
                min: 1,
                message: 'Add at least one passenger',
              },
            ]}
          >
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              loading={passengersQuery.isLoading}
              options={passengerOptions}
              placeholder="Search and select passengers"
              className="w-full"
            />
          </Form.Item>

          {isInternational && passengerIds.length > 0 ? (
            <div className="mt-4 flex flex-col gap-3">
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                International flight — please provide travel documents for each
                passenger.
              </Typography.Text>
              {passengerIds.map((employeeId) => {
                const detail = passengerDetails[employeeId] ?? {
                  visaRequired: false,
                };
                const name = selectedPassengerNames[employeeId] ?? employeeId;
                return (
                  <Card
                    key={employeeId}
                    size="small"
                    title={
                      <Space size={6}>
                        <Tag color="blue">{name}</Tag>
                      </Space>
                    }
                  >
                    <Row gutter={12}>
                      <Col xs={24} sm={10}>
                        <div className="mb-2">
                          <Typography.Text
                            style={{ display: 'block', marginBottom: 4, fontSize: 13 }}
                          >
                            Passport Number
                          </Typography.Text>
                          <Input
                            size="small"
                            placeholder="e.g. A12345678"
                            maxLength={20}
                            value={detail.passportNumber ?? ''}
                            onChange={(e) =>
                              updatePassengerDetail(employeeId, {
                                passportNumber: e.target.value,
                              })
                            }
                          />
                        </div>
                      </Col>
                      <Col xs={24} sm={7}>
                        <div className="mb-2 flex items-center gap-1 pt-6">
                          <Checkbox
                            checked={detail.visaRequired}
                            onChange={(e) =>
                              updatePassengerDetail(employeeId, {
                                visaRequired: e.target.checked,
                                visaStatus: e.target.checked
                                  ? detail.visaStatus
                                  : undefined,
                              })
                            }
                          >
                            Visa Required
                          </Checkbox>
                        </div>
                      </Col>
                      {detail.visaRequired ? (
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
                              value={detail.visaStatus ?? 'NOT_APPLIED'}
                              onChange={(value: FlightVisaStatus) =>
                                updatePassengerDetail(employeeId, {
                                  visaStatus: value,
                                })
                              }
                            />
                          </div>
                        </Col>
                      ) : null}
                    </Row>
                  </Card>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* ── Section 3: Additional Options ─────────────────────────── */}
        <div
          className="mb-6 rounded-lg p-4"
          style={{
            border: `1px solid ${tokens.colorBorder}`,
            background: tokens.colorCardBg,
          }}
        >
          <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>
            Additional Options
          </Typography.Title>

          <Form.Item name="accommodationRequired" valuePropName="checked">
            <Checkbox>Accommodation required</Checkbox>
          </Form.Item>

          {accommodationRequired ? (
            <Form.Item name="accommodationDetails" label="Accommodation Details">
              <Input.TextArea
                rows={3}
                maxLength={1000}
                showCount
                placeholder="Hotel name, check-in/out dates, preferences…"
              />
            </Form.Item>
          ) : null}

          <Form.Item name="perDiemRequired" valuePropName="checked">
            <Checkbox>Per diem required</Checkbox>
          </Form.Item>

          <Form.Item name="notes" label="Notes (optional)">
            <Input.TextArea
              rows={3}
              maxLength={2000}
              showCount
              placeholder="Any other information for the approver"
            />
          </Form.Item>
        </div>

        {/* ── Section 4: Attachments ─────────────────────────────────── */}
        <div
          className="mb-6 rounded-lg p-4"
          style={{
            border: `1px solid ${tokens.colorBorder}`,
            background: tokens.colorCardBg,
          }}
        >
          <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 8 }}>
            Supporting Attachments
          </Typography.Title>
          <Typography.Paragraph
            type="secondary"
            style={{ marginBottom: 12, fontSize: 13 }}
          >
            Upload supporting documents such as itinerary, invitation letters, or
            visa copies.
          </Typography.Paragraph>
          <FileUploadInput
            files={selectedFiles}
            onChange={setSelectedFiles}
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            multiple
            disabled={submitMutation.isPending}
          />
        </div>
      </Form>
    </>
  );

  if (embedded) {
    return (
      <div>
        {formContent}
        <div className="flex justify-end gap-2">
          <Button
            type="primary"
            loading={submitMutation.isPending}
            onClick={() => form.submit()}
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <FormLayout
      title="New Flight Application"
      description="Complete the form below to submit a flight application for approval."
      extra={
        <Button
          type="primary"
          loading={submitMutation.isPending}
          onClick={() => form.submit()}
        >
          {submitLabel}
        </Button>
      }
    >
      <div className="w-full">{formContent}</div>
    </FormLayout>
  );
}

export default FlightApplicationForm;
