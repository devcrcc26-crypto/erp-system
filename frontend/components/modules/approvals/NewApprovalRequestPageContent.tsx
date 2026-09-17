'use client';

import { useMemo, useState } from 'react';
import { Button, Input, Skeleton, Spin, Typography } from 'antd';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import FormSchemaRenderer, {
  normalizeFormSchemaFields,
  validateFormSchemaFields,
  type FormSchemaErrors,
  type FormSchemaValues,
} from '@/components/form-renderer/FormSchemaRenderer';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import FormPageFooter from '@/components/ui/FormPageFooter/FormPageFooter';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import type { ApprovalCategorySummary } from '@/lib/api/approvals.types';
import {
  useApprovalCategories,
  useSubmitApprovalRequest,
} from '@/lib/query/approvals';
import { tokens } from '@/lib/theme/tokens';
import {
  formatApprovalCategoryDescription,
  formatApprovalCategoryName,
} from '@/lib/utils/approval-category-display';
import { formatDisplayDate } from '@/lib/utils/date-format';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
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
  EXIT_PERMIT: '/approvals/new/equipment-and-materials-exit-permit',
  CONSUMABLES_REQUISITION: '/approvals/new/consumables',
  VEHICLE_APPLICATION: '/approvals/new/vehicle-application',
  VEHICLE_REFUELING: '/approvals/new/vehicle-refueling',
  INSPECTION_REPAIR: '/approvals/new/inspection-repair',
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
    const categoryName = formatApprovalCategoryName(
      selectedCategory.code,
      t,
      selectedCategory.name,
    );
    return `${categoryName} — ${today}`;
  }, [selectedCategory, t]);

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
      <div className="erp-pro-list-page erp-users-page erp-approvals-new-page flex justify-center p-12">
        <Spin />
      </div>
    );
  }

  if (categoriesQuery.isError) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-approvals-new-page">
        <ErpNotice
          tone="error"
          title={getFriendlyApiErrorMessage(
            categoriesQuery.error,
            t('pages.approvals.failedToLoadCategories'),
            t,
          )}
        />
      </div>
    );
  }

  const categories = categoriesQuery.data ?? [];

  if (!selectedCategory) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-approvals-new-page flex flex-col gap-4">
        <div className="flex shrink-0 items-center justify-end">
          <Button onClick={() => router.push('/approvals')}>
            {t('common.cancel')}
          </Button>
        </div>

        {categories.length === 0 ? (
          <ErpNotice
            tone="info"
            title={t('pages.approvals.noCategories')}
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => handleSelectCategory(category)}
                className="overflow-hidden rounded-xl border border-[#e8ebef] bg-white p-4 text-left shadow-sm transition-colors hover:border-[#f47b20] hover:bg-[#fef0e6]"
              >
                <div
                  className="text-sm font-semibold"
                  style={{ color: tokens.colorTextPrimary }}
                >
                  {formatApprovalCategoryName(
                    category.code,
                    t,
                    category.name,
                  )}
                </div>
                <div
                  className="mt-1 text-xs leading-relaxed"
                  style={{ color: tokens.colorTextSecondary }}
                >
                  {formatApprovalCategoryDescription(
                    category.code,
                    t,
                    category.description,
                  ) || category.code}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-approvals-new-page flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={handleBackToCategories}
        >
          {t('pages.approvals.backToCategories')}
        </Button>
      </div>

      {submitMutation.isPending ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : null}

      <div className="erp-pro-card overflow-hidden">
        <div className="erp-employee-section">
          <div className="erp-employee-section-header">
            <h3 className="erp-employee-section-title m-0">
              {formatApprovalCategoryName(
                selectedCategory.code,
                t,
                selectedCategory.name,
              )}
            </h3>
          </div>
          <div className="erp-employee-section-body">
            <p className="erp-users-cell-sub m-0 mb-4">
              {formatApprovalCategoryDescription(
                selectedCategory.code,
                t,
                selectedCategory.description,
              ) || t('pages.approvals.dynamicFormDescription')}
            </p>
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
                {t('pages.approvals.requestTitleHint', {
                  default: defaultTitle,
                })}
              </Typography.Text>
            </div>
          </div>
        </div>
      </div>

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
