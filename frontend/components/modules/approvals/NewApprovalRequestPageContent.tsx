'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Input, Skeleton, Spin, Typography } from 'antd';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import FormSchemaRenderer, {
  normalizeFormSchemaFields,
  validateFormSchemaFields,
  type FormSchemaErrors,
  type FormSchemaValues,
} from '@/components/form-renderer/FormSchemaRenderer';
import { SectionCard } from '@/components/modules/hr/shared/hr-page-chrome';
import FormPageFooter from '@/components/ui/FormPageFooter/FormPageFooter';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
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
  OFFICIAL_SEAL_USAGE: '/approvals/new/official-seal',
  PROJECT_SEAL_USAGE: '/approvals/new/project-seal',
};

/**
 * Two-step flow: pick a category, then fill and submit a dynamic form.
 */
export default function NewApprovalRequestPageContent(): React.ReactNode {
  const router = useRouter();
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const categoriesQuery = useApprovalCategories();
  const submitMutation = useSubmitApprovalRequest();

  const [selectedCategory, setSelectedCategory] =
    useState<ApprovalCategorySummary | null>(null);
  const [formValues, setFormValues] = useState<FormSchemaValues>({});
  const [title, setTitle] = useState('');
  const [errors, setErrors] = useState<FormSchemaErrors>({});

  useSetHeaderExtra(null);

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
      messageApi.warning(t('pages.approvals.fillRequiredFields'));
      return;
    }

    const resolvedTitle = title.trim() || defaultTitle;
    try {
      const created = await submitMutation.mutateAsync({
        categoryCode: selectedCategory.code,
        title: resolvedTitle,
        formData: formValues,
      });
      messageApi.success(t('pages.approvals.requestSubmitted'));
      router.push(`/approvals/${created.id}`);
    } catch (error) {
      notifyApiError(error, t('pages.approvals.failedToSubmit'), messageApi);
    }
  }

  if (categoriesQuery.isLoading && !categoriesQuery.data) {
    return (
      <div className="flex justify-center p-12">
        <Spin />
      </div>
    );
  }

  if (categoriesQuery.isError) {
    const message =
      categoriesQuery.error instanceof ApiRequestError
        ? categoriesQuery.error.message
        : t('pages.approvals.failedToLoadCategories');
    return (
      <div className="flex flex-col gap-4">
        <Alert type="error" showIcon title={message} />
      </div>
    );
  }

  const categories = categoriesQuery.data ?? [];

  if (!selectedCategory) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1
              className="m-0 text-xl font-semibold tracking-tight"
              style={{
                color: tokens.colorTextPrimary,
                fontFamily: tokens.fontFamily,
              }}
            >
              {t('pages.approvals.new')}
            </h1>
            <p
              className="mb-0 mt-1 text-sm"
              style={{ color: tokens.colorTextSecondary }}
            >
              {t('pages.approvals.newDescription')}
            </p>
          </div>
          <Button
            onClick={() => router.push('/approvals')}
            style={{ borderRadius: 0 }}
          >
            {t('common.cancel')}
          </Button>
        </div>

        {categories.length === 0 ? (
          <Alert
            type="info"
            showIcon
            title={t('pages.approvals.noCategories')}
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => handleSelectCategory(category)}
                className="overflow-hidden rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-4 text-left transition-colors hover:border-[var(--color-primary)] hover:bg-[#F8F7F4]"
              >
                <div
                  className="text-sm font-semibold"
                  style={{ color: tokens.colorTextPrimary }}
                >
                  {category.name}
                </div>
                <div
                  className="mt-1 text-xs leading-relaxed"
                  style={{ color: tokens.colorTextSecondary }}
                >
                  {category.description || category.code}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1
            className="m-0 text-xl font-semibold tracking-tight"
            style={{
              color: tokens.colorTextPrimary,
              fontFamily: tokens.fontFamily,
            }}
          >
            {selectedCategory.name}
          </h1>
          <p
            className="mb-0 mt-1 text-sm"
            style={{ color: tokens.colorTextSecondary }}
          >
            {selectedCategory.description ||
              t('pages.approvals.dynamicFormDescription')}
          </p>
        </div>
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={handleBackToCategories}
          style={{ borderRadius: 0 }}
        >
          {t('pages.approvals.backToCategories')}
        </Button>
      </div>

      {submitMutation.isPending ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : null}

      <SectionCard
        title={t('pages.approvals.formSection')}
        bodyClassName="px-3 py-4 sm:px-5"
      >
        <FormSchemaRenderer
          fields={fields}
          values={formValues}
          onChange={setFormValues}
          errors={errors}
          disabled={submitMutation.isPending}
        />

        <div className="mt-4 flex flex-col gap-1.5">
          <label
            htmlFor="approval-request-title"
            className="text-sm font-medium"
            style={{ color: tokens.colorTextPrimary }}
          >
            {t('pages.approvals.requestTitle')}
          </label>
          <Input
            id="approval-request-title"
            placeholder={defaultTitle}
            value={title}
            disabled={submitMutation.isPending}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t('pages.approvals.requestTitleHint', { default: defaultTitle })}
          </Typography.Text>
        </div>
      </SectionCard>

      <FormPageFooter
        submitLabel={t('pages.approvals.submitRequest')}
        onSubmit={() => void handleSubmit()}
        isSubmitting={submitMutation.isPending}
        secondaryLabel={t('pages.approvals.backToCategories')}
        onSecondary={handleBackToCategories}
        secondaryDisabled={submitMutation.isPending}
      />
    </div>
  );
}
