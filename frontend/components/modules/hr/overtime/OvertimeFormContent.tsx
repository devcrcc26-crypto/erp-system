'use client';

import { useEffect } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  TimePicker,
} from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { useAppMessage } from '@/hooks/use-app-message';
import { ApiRequestError } from '@/lib/api/errors';
import type { OvertimeCompensation } from '@/lib/api/overtime.types';
import { useSubmitOvertimeRequest } from '@/lib/query/overtime';
import { useProjects } from '@/lib/query/projects';
import {
  OVERTIME_COMPENSATION_OPTIONS,
  calculateOvertimeHours,
} from '@/lib/utils/overtime-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface OvertimeFormValues {
  date: Dayjs;
  startTime: Dayjs;
  endTime: Dayjs;
  hours: number;
  reason: string;
  projectId?: string;
  compensationType?: OvertimeCompensation;
}

/**
 * Standalone overtime request form under Approvals → New Request (no HR layout).
 */
export default function OvertimeFormContent(): React.ReactNode {
  const router = useRouter();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<OvertimeFormValues>();
  const submitMutation = useSubmitOvertimeRequest();
  const projectsQuery = useProjects({ page: 1, limit: 100 }, true);

  const startTime = Form.useWatch('startTime', form) as Dayjs | undefined;
  const endTime = Form.useWatch('endTime', form) as Dayjs | undefined;

  useEffect(() => {
    form.setFieldsValue({
      date: dayjs(),
      hours: 1,
    });
  }, [form]);

  useEffect(() => {
    if (!startTime || !endTime) {
      return;
    }
    const hours = calculateOvertimeHours(
      startTime.format('HH:mm'),
      endTime.format('HH:mm'),
    );
    if (hours !== undefined) {
      form.setFieldValue('hours', hours);
    }
  }, [startTime, endTime, form]);

  async function handleSubmit(values: OvertimeFormValues): Promise<void> {
    try {
      const created = await submitMutation.mutateAsync({
        date: values.date.format('YYYY-MM-DD'),
        startTime: values.startTime.format('HH:mm'),
        endTime: values.endTime.format('HH:mm'),
        hours: values.hours,
        reason: values.reason.trim(),
        projectId: values.projectId,
        compensationType: values.compensationType,
      });
      messageApi.success('Overtime request submitted');
      if (created.approvalRequestId) {
        router.push(`/approvals/${created.approvalRequestId}`);
      } else {
        router.push('/approvals/new');
      }
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to submit overtime request', messageApi);
    }
  }

  return (
    <FormLayout
      title="New Overtime Request"
      description="Up to 4 hours needs Discipline Lead and HR; longer overtime escalates to General Manager."
      extra={
        <Space>
          <Button onClick={() => router.push('/approvals/new')}>Cancel</Button>
          <Button
            type="primary"
            loading={submitMutation.isPending}
            onClick={() => form.submit()}
          >
            Submit
          </Button>
        </Space>
      }
    >
      {submitMutation.isError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          title={
            submitMutation.error instanceof ApiRequestError
              ? submitMutation.error.message
              : 'Submit failed'
          }
        />
      ) : null}

      <div className="mx-auto w-full max-w-xl">
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => void handleSubmit(values)}
        >
          <Form.Item
            name="date"
            label="Date"
            rules={[{ required: true, message: 'Select a date' }]}
          >
            <DatePicker className="w-full" />
          </Form.Item>

          <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 sm:gap-4">
            <Form.Item
              name="startTime"
              label="Start Time"
              rules={[{ required: true, message: 'Select start time' }]}
            >
              <TimePicker className="w-full" format="HH:mm" minuteStep={15} />
            </Form.Item>
            <Form.Item
              name="endTime"
              label="End Time"
              rules={[{ required: true, message: 'Select end time' }]}
            >
              <TimePicker className="w-full" format="HH:mm" minuteStep={15} />
            </Form.Item>
          </div>

          <Form.Item
            name="hours"
            label="Hours"
            extra="Auto-calculated from start and end time."
            rules={[
              { required: true, message: 'Hours required' },
              { type: 'number', min: 0.5, message: 'Minimum 0.5 hour' },
            ]}
          >
            <InputNumber
              className="w-full"
              min={0.5}
              step={0.5}
              precision={1}
              readOnly
            />
          </Form.Item>

          <Form.Item
            name="reason"
            label="Reason"
            rules={[{ required: true, message: 'Reason is required' }]}
          >
            <Input.TextArea rows={4} maxLength={4000} showCount />
          </Form.Item>

          <Form.Item name="projectId" label="Project (optional)">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Link to a project"
              loading={projectsQuery.isLoading}
              options={(projectsQuery.data?.data ?? []).map((project) => ({
                value: project.id,
                label: `${project.projectCode} — ${project.name}`,
              }))}
            />
          </Form.Item>

          <Form.Item name="compensationType" label="Compensation Type">
            <Select
              allowClear
              placeholder="Select compensation"
              options={OVERTIME_COMPENSATION_OPTIONS}
            />
          </Form.Item>
        </Form>
      </div>
    </FormLayout>
  );
}
