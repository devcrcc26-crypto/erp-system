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
  InputNumber,
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
  BusinessTripDetail,
  FlightTicketClass,
  FlightTripType,
  FlightVisaStatus,
} from '@/lib/api/business-trip.types';
import {
  useBusinessTripSelectablePassengers,
  useSubmitBusinessTrip,
} from '@/lib/query/business-trip';
import { useCurrentUser } from '@/lib/query/profile';
import { tokens } from '@/lib/theme/tokens';
import {
  BUSINESS_TRIP_TICKET_CLASS_OPTIONS,
  BUSINESS_TRIP_VISA_STATUS_OPTIONS,
  formatEtb,
} from '@/lib/utils/business-trip-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface PassengerDetail {
  passportNumber?: string;
  visaRequired: boolean;
  visaStatus?: FlightVisaStatus;
}

interface BusinessTripFormValues {
  tripType: FlightTripType;
  origin: string;
  destinationCountry: string;
  destinationCity: string;
  departureDate: Dayjs;
  returnDate?: Dayjs;
  purpose: string;
  hostOrganization?: string;
  hostContact?: string;
  expectedOutcomes?: string;
  itinerary?: string;
  ticketClass: FlightTicketClass;
  estimatedFlightCost?: number | null;
  estimatedAccommodationCost?: number | null;
  estimatedPerDiem?: number | null;
  estimatedOtherCost?: number | null;
  accommodationRequired: boolean;
  accommodationDetails?: string;
  perDiemRequired: boolean;
  notes?: string;
  passengerIds: string[];
}

export interface BusinessTripFormProps {
  onSuccess?: (created: BusinessTripDetail) => void;
  submitLabel?: string;
  embedded?: boolean;
}

/**
 * Reusable business trip form.
 * When embedded=true the FormLayout chrome is omitted (e.g. inside a modal).
 */
export function BusinessTripForm({
  onSuccess,
  submitLabel = 'Submit Business Trip',
  embedded = false,
}: BusinessTripFormProps): React.ReactNode {
  const messageApi = useAppMessage();
  const [form] = Form.useForm<BusinessTripFormValues>();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [passengerDetails, setPassengerDetails] = useState<
    Record<string, PassengerDetail>
  >({});

  const currentUser = useCurrentUser();
  const passengersQuery = useBusinessTripSelectablePassengers();
  const submitMutation = useSubmitBusinessTrip();

  const tripType = Form.useWatch('tripType', form) as FlightTripType | undefined;
  const passengerIds =
    (Form.useWatch('passengerIds', form) as string[] | undefined) ?? [];
  const accommodationRequired = Form.useWatch('accommodationRequired', form) as
    | boolean
    | undefined;

  const estimatedFlightCost = Form.useWatch('estimatedFlightCost', form) as
    | number
    | null
    | undefined;
  const estimatedAccommodationCost = Form.useWatch(
    'estimatedAccommodationCost',
    form,
  ) as number | null | undefined;
  const estimatedPerDiem = Form.useWatch('estimatedPerDiem', form) as
    | number
    | null
    | undefined;
  const estimatedOtherCost = Form.useWatch('estimatedOtherCost', form) as
    | number
    | null
    | undefined;

  const estimatedTotal =
    (Number(estimatedFlightCost) || 0) +
    (Number(estimatedAccommodationCost) || 0) +
    (Number(estimatedPerDiem) || 0) +
    (Number(estimatedOtherCost) || 0);

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
        accommodationRequired: true,
        perDiemRequired: true,
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
        next[id] = prev[id] ?? { visaRequired: true };
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
      [employeeId]: {
        ...(prev[employeeId] ?? { visaRequired: true }),
        ...patch,
      },
    }));
  }

  async function handleSubmit(values: BusinessTripFormValues): Promise<void> {
    const missingPassport = values.passengerIds.find((id) => {
      const detail = passengerDetails[id];
      return !detail?.passportNumber?.trim();
    });
    if (missingPassport) {
      messageApi.error('Passport number is required for all passengers');
      return;
    }

    try {
      const created = await submitMutation.mutateAsync({
        tripType: values.tripType,
        origin: values.origin.trim(),
        destinationCountry: values.destinationCountry.trim(),
        destinationCity: values.destinationCity.trim(),
        departureDate: values.departureDate.format('YYYY-MM-DD'),
        returnDate:
          values.tripType === 'ROUND_TRIP' && values.returnDate
            ? values.returnDate.format('YYYY-MM-DD')
            : undefined,
        purpose: values.purpose.trim(),
        hostOrganization: values.hostOrganization?.trim() || undefined,
        hostContact: values.hostContact?.trim() || undefined,
        expectedOutcomes: values.expectedOutcomes?.trim() || undefined,
        itinerary: values.itinerary?.trim() || undefined,
        ticketClass: values.ticketClass,
        estimatedFlightCost:
          values.estimatedFlightCost != null
            ? Number(values.estimatedFlightCost)
            : undefined,
        estimatedAccommodationCost:
          values.estimatedAccommodationCost != null
            ? Number(values.estimatedAccommodationCost)
            : undefined,
        estimatedPerDiem:
          values.estimatedPerDiem != null
            ? Number(values.estimatedPerDiem)
            : undefined,
        estimatedOtherCost:
          values.estimatedOtherCost != null
            ? Number(values.estimatedOtherCost)
            : undefined,
        accommodationRequired: values.accommodationRequired ?? true,
        accommodationDetails:
          values.accommodationRequired
            ? values.accommodationDetails?.trim() || undefined
            : undefined,
        perDiemRequired: values.perDiemRequired ?? true,
        notes: values.notes?.trim() || undefined,
        passengers: values.passengerIds.map((id) => {
          const detail = passengerDetails[id] ?? { visaRequired: true };
          return {
            employeeId: id,
            passportNumber: detail.passportNumber?.trim() || undefined,
            visaRequired: detail.visaRequired,
            visaStatus: detail.visaRequired ? detail.visaStatus : undefined,
          };
        }),
        files: selectedFiles,
      });
      messageApi.success('Business trip submitted');
      onSuccess?.(created);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to submit business trip', messageApi);
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

          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item
                name="origin"
                label="Origin"
                rules={[
                  { required: true, message: 'Enter origin city / airport' },
                ]}
              >
                <Input placeholder="e.g. Addis Ababa (ADD)" maxLength={100} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item
                name="destinationCountry"
                label="Destination Country"
                rules={[
                  { required: true, message: 'Enter destination country' },
                ]}
              >
                <Input placeholder="e.g. Kenya" maxLength={100} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item
                name="destinationCity"
                label="Destination City"
                rules={[{ required: true, message: 'Enter destination city' }]}
              >
                <Input placeholder="e.g. Nairobi" maxLength={100} />
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
                    {
                      required: true,
                      message: 'Select return date for round trip',
                    },
                  ]}
                >
                  <DatePicker className="w-full" />
                </Form.Item>
              </Col>
            ) : null}
          </Row>

          <Form.Item
            name="ticketClass"
            label="Ticket Class"
            rules={[{ required: true, message: 'Select ticket class' }]}
          >
            <Select
              options={BUSINESS_TRIP_TICKET_CLASS_OPTIONS}
              placeholder="Select class"
            />
          </Form.Item>
        </div>

        {/* ── Section 2: Trip Purpose ────────────────────────────────── */}
        <div
          className="mb-6 rounded-lg p-4"
          style={{
            border: `1px solid ${tokens.colorBorder}`,
            background: tokens.colorCardBg,
          }}
        >
          <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>
            Trip Purpose
          </Typography.Title>

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

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="hostOrganization" label="Host Organization">
                <Input
                  placeholder="Organization hosting the visit"
                  maxLength={200}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="hostContact" label="Host Contact">
                <Input
                  placeholder="Contact name / phone / email"
                  maxLength={200}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="expectedOutcomes" label="Expected Outcomes">
            <Input.TextArea
              rows={3}
              maxLength={2000}
              showCount
              placeholder="What outcomes are expected from this trip?"
            />
          </Form.Item>

          <Form.Item name="itinerary" label="Itinerary">
            <Input.TextArea
              rows={3}
              maxLength={2000}
              showCount
              placeholder="Outline the planned itinerary"
            />
          </Form.Item>
        </div>

        {/* ── Section 3: Budget Estimate ─────────────────────────────── */}
        <div
          className="mb-6 rounded-lg p-4"
          style={{
            border: `1px solid ${tokens.colorBorder}`,
            background: tokens.colorCardBg,
          }}
        >
          <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>
            Budget Estimate
          </Typography.Title>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="estimatedFlightCost" label="Estimated Flight Cost">
                <InputNumber
                  className="w-full"
                  min={0}
                  prefix="ETB"
                  placeholder="0"
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="estimatedAccommodationCost"
                label="Estimated Accommodation Cost"
              >
                <InputNumber
                  className="w-full"
                  min={0}
                  prefix="ETB"
                  placeholder="0"
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="estimatedPerDiem" label="Estimated Per Diem">
                <InputNumber
                  className="w-full"
                  min={0}
                  prefix="ETB"
                  placeholder="0"
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="estimatedOtherCost" label="Estimated Other Cost">
                <InputNumber
                  className="w-full"
                  min={0}
                  prefix="ETB"
                  placeholder="0"
                />
              </Form.Item>
            </Col>
          </Row>

          <div
            className="rounded-md px-4 py-3"
            style={{
              background: tokens.colorPrimaryLight,
              border: `1px solid ${tokens.colorBorder}`,
            }}
          >
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              Estimated Total
            </Typography.Text>
            <Typography.Title level={4} style={{ margin: '4px 0 0' }}>
              {formatEtb(estimatedTotal)}
            </Typography.Title>
          </div>
        </div>

        {/* ── Section 4: Passengers ──────────────────────────────────── */}
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

          {passengerIds.length > 0 ? (
            <div className="mt-4 flex flex-col gap-3">
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                International travel — please provide travel documents for each
                passenger. Passport number is required.
              </Typography.Text>
              {passengerIds.map((employeeId) => {
                const detail = passengerDetails[employeeId] ?? {
                  visaRequired: true,
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
                            style={{
                              display: 'block',
                              marginBottom: 4,
                              fontSize: 13,
                            }}
                          >
                            Passport Number{' '}
                            <span style={{ color: tokens.colorRed600 }}>*</span>
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
                              options={BUSINESS_TRIP_VISA_STATUS_OPTIONS}
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

        {/* ── Section 5: Accommodation ───────────────────────────────── */}
        <div
          className="mb-6 rounded-lg p-4"
          style={{
            border: `1px solid ${tokens.colorBorder}`,
            background: tokens.colorCardBg,
          }}
        >
          <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>
            Accommodation
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

        {/* ── Section 6: Attachments ─────────────────────────────────── */}
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
            Upload invitation letter, visa documents, itinerary etc.
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
      title="New Business Trip"
      description="Complete the form below to submit a business trip for approval."
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

export default BusinessTripForm;
