'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Input, Skeleton, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import FormSchemaRenderer, {
  normalizeFormSchemaFields,
  validateFormSchemaFields,
  type FormSchemaErrors,
  type FormSchemaValues,
} from '@/components/form-renderer/FormSchemaRenderer';
import FormLayout, {
  PageLoadingSkeleton,
} from '@/components/ui/FormLayout/FormLayout';
import { useAppMessage } from '@/hooks/use-app-message';
import type { ApprovalCategorySummary } from '@/lib/api/approvals.types';
import { ApiRequestError } from '@/lib/api/errors';
import {
  useApprovalCategories,
  useSubmitApprovalRequest,
} from '@/lib/query/approvals';
import { tokens } from '@/lib/theme/tokens';
import { formatDisplayDate } from '@/lib/utils/date-format';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const CATEGORY_ROUTES: Record<string, string> = {
  LEAVE_REQUEST: '/approvals/new/leave-request',
  OVERTIME_APPLICATION: '/approvals/new/overtime',
  FLIGHT_APPLICATION: '/approvals/new/flight-application',
  BUSINESS_TRIP: '/approvals/new/business-trip',
  EXPENSE_CLAIM: '/approvals/new/expense-claim',
  PER_DIEM: '/approvals/new/per-diem',
  PURCHASE_REQUEST: '/approvals/new/purchase-request',
  MATERIAL_REQUISITION: '/approvals/new/material-requisition',
  CONSUMABLES_REQUISITION: '/approvals/new/consumables',
  VEHICLE_APPLICATION: '/approvals/new/vehicle-application',
  VEHICLE_REFUELING: '/approvals/new/vehicle-refueling',
};

/**
 * Two-step flow: pick a category, then fill and submit a dynamic form.
 * Leave / overtime categories route to their typed HR form pages.
 */
export default function NewApprovalRequestPageContent(): React.ReactNode {
  const router = useRouter();
  const messageApi = useAppMessage();
  const categoriesQuery = useApprovalCategories();
  const submitMutation = useSubmitApprovalRequest();

  const [selectedCategory, setSelectedCategory] =
    useState<ApprovalCategorySummary | null>(null);
  const [formValues, setFormValues] = useState<FormSchemaValues>({});
  const [title, setTitle] = useState('');
  const [errors, setErrors] = useState<FormSchemaErrors>({});

  const fields = useMemo(
    () => normalizeFormSchemaFields(selectedCategory?.formSchema),
    [selectedCategory?.formSchema],
  );

  const defaultTitle = useMemo(() => {
    if (!selectedCategory) {
      return '';
    }
    const today = formatDisplayDate(new Date());
    return `${selectedCategory.name} — ${today}`;
  }, [selectedCategory]);

  function handleSelectCategory(category: ApprovalCategorySummary): void {
    const typedRoute = CATEGORY_ROUTES[category.code];
    if (typedRoute) {
      router.push(typedRoute);
      return;
    }
    setSelectedCategory(category);
    setFormValues({});
    setErrors({});
    setTitle('');
  }

  function handleBackToCategories(): void {
    setSelectedCategory(null);
    setFormValues({});
    setErrors({});
    setTitle('');
  }

  async function handleSubmit(): Promise<void> {
    if (!selectedCategory) {
      return;
    }

    const nextErrors = validateFormSchemaFields(fields, formValues);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      messageApi.warning('Please fill in all required fields');
      return;
    }

    const resolvedTitle = title.trim() || defaultTitle;
    try {
      const created = await submitMutation.mutateAsync({
        categoryCode: selectedCategory.code,
        title: resolvedTitle,
        formData: formValues,
      });
      messageApi.success('Approval request submitted');
      router.push(`/approvals/${created.id}`);
    } catch (error) {
      notifyApiError(error, 'Failed to submit approval request', messageApi);
    }
  }

  if (categoriesQuery.isLoading && !categoriesQuery.data) {
    return <PageLoadingSkeleton />;
  }

  if (categoriesQuery.isError) {
    const message =
      categoriesQuery.error instanceof ApiRequestError
        ? categoriesQuery.error.message
        : 'Failed to load approval categories';
    return (
      <FormLayout
        title="New approval request"
        description="Choose a category and submit a request."
      >
        <Alert type="error" showIcon title={message} />
      </FormLayout>
    );
  }

  const categories = categoriesQuery.data ?? [];

  if (!selectedCategory) {
    return (
      <FormLayout
        title="New approval request"
        description="Select a category to continue."
        extra={
          <Button onClick={() => router.push('/approvals')}>Cancel</Button>
        }
      >
        {categories.length === 0 ? (
          <Alert
            type="info"
            showIcon
            message="No approval categories are available."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => handleSelectCategory(category)}
                className="rounded-[12px] border p-4 text-left transition-colors"
                style={{
                  borderColor: tokens.colorBorder,
                  background: tokens.colorCardBg,
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.borderColor = tokens.colorPrimary;
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.borderColor = tokens.colorBorder;
                }}
              >
                <div
                  className="text-[14px] font-medium"
                  style={{ color: tokens.colorTextPrimary }}
                >
                  {category.name}
                </div>
                <div
                  className="mt-1 text-[12px] leading-[1.5]"
                  style={{ color: tokens.colorTextSecondary }}
                >
                  {category.description || category.code}
                </div>
              </button>
            ))}
          </div>
        )}
      </FormLayout>
    );
  }

  return (
    <FormLayout
      title={selectedCategory.name}
      description={
        selectedCategory.description ||
        'Complete the form and submit for approval.'
      }
      extra={
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={handleBackToCategories}
        >
          Back to categories
        </Button>
      }
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        {submitMutation.isPending ? <Skeleton active paragraph={{ rows: 2 }} /> : null}

        <FormSchemaRenderer
          fields={fields}
          values={formValues}
          onChange={setFormValues}
          errors={errors}
          disabled={submitMutation.isPending}
        />

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="approval-request-title"
            className="text-[13px] font-medium"
            style={{ color: tokens.colorTextPrimary }}
          >
            Request title
          </label>
          <Input
            id="approval-request-title"
            placeholder={defaultTitle}
            value={title}
            disabled={submitMutation.isPending}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Leave blank to use “{defaultTitle}”.
          </Typography.Text>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            onClick={handleBackToCategories}
            disabled={submitMutation.isPending}
          >
            Back
          </Button>
          <Button
            type="primary"
            loading={submitMutation.isPending}
            onClick={() => void handleSubmit()}
          >
            Submit request
          </Button>
        </div>
      </div>
    </FormLayout>
  );
}
