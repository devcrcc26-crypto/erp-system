'use client';

import { useMemo } from 'react';
import { Input, Select } from 'antd';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useBusinessTrips } from '@/lib/query/business-trip';
import { useEmployeeSiteAssignments } from '@/lib/query/site-assignment';
import { formatDisplayDate } from '@/lib/utils/date-format';
import type { FlightAdditionalValues } from './flight-stepper.types';

/**
 * Step 3 - accommodation / per diem / notes / attachments / optional links.
 */
export default function FlightAdditionalStep({
  values,
  onChange,
  disabled = false,
  effectiveEmployeeId,
  hideAttachments = false,
}: {
  values: FlightAdditionalValues;
  onChange: (next: FlightAdditionalValues) => void;
  disabled?: boolean;
  effectiveEmployeeId?: string;
  /** Edit mode: attachments are added from the request page, not the form. */
  hideAttachments?: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const tripsQuery = useBusinessTrips({ status: 'APPROVED', limit: 50 }, true);
  const siteAssignmentsQuery = useEmployeeSiteAssignments(
    effectiveEmployeeId,
    Boolean(effectiveEmployeeId),
  );

  const approvedSiteAssignments = useMemo(
    () =>
      (siteAssignmentsQuery.data ?? []).filter(
        (row) => row.status === 'APPROVED',
      ),
    [siteAssignmentsQuery.data],
  );

  const businessTripOptions = useMemo(
    () =>
      (tripsQuery.data?.data ?? [])
        .filter((trip) => trip.submittedBy === effectiveEmployeeId)
        .map((trip) => ({
          value: trip.id,
          label: `${trip.tripNumber} - ${trip.destinationCity}`,
        })),
    [tripsQuery.data?.data, effectiveEmployeeId],
  );

  const siteAssignmentOptions = useMemo(
    () =>
      approvedSiteAssignments.map((row) => ({
        value: row.id,
        label: `${row.requestNumber} - ${row.siteName} (${formatDisplayDate(String(row.startDate).slice(0, 10))} – ${formatDisplayDate(String(row.endDate).slice(0, 10))})`,
      })),
    [approvedSiteAssignments],
  );

  function patch(partial: Partial<FlightAdditionalValues>): void {
    onChange({ ...values, ...partial });
  }

  function handleBusinessTripChange(val: string | null | undefined): void {
    const tripId = val ?? '';
    patch({
      linkedBusinessTripId: tripId || undefined,
      ...(tripId ? { siteAssignmentId: undefined } : {}),
    });
  }

  function handleSiteAssignmentChange(val: string | null | undefined): void {
    const assignmentId = val ?? '';
    patch({
      siteAssignmentId: assignmentId || undefined,
      ...(assignmentId ? { linkedBusinessTripId: undefined } : {}),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <FormLayout
        variant="pro"
        dense
        title={t('hr.section.additionalOptions')}
        description={t('pages.hr.flight.additionalStepDescription')}
      >
        <div className="mb-0">
          <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
            {t('hr.form.notes')}
          </label>
          <Input.TextArea
            rows={3}
            maxLength={2000}
            showCount
            value={values.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            placeholder={t('hr.placeholder.enterNotes')}
            disabled={disabled}
          />
        </div>
      </FormLayout>

      <FormLayout
        variant="pro"
        dense
        title={t('hr.section.linkTo')}
        description={t('hr.messages.flightLinkToHint')}
      >
        <div className="mb-4">
          <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
            {t('hr.labels.businessTrip')}
          </label>
          <Select
            allowClear
            className="w-full"
            disabled={disabled || !effectiveEmployeeId}
            loading={tripsQuery.isLoading}
            placeholder={t('hr.placeholder.selectBusinessTrip')}
            options={businessTripOptions}
            value={values.linkedBusinessTripId}
            onChange={handleBusinessTripChange}
          />
        </div>
        <div className="mb-0">
          <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
            {t('hr.form.linkedSiteAssignment')}
          </label>
          <Select
            allowClear
            className="w-full"
            disabled={disabled || !effectiveEmployeeId}
            loading={siteAssignmentsQuery.isLoading}
            placeholder={t('hr.placeholder.selectSiteAssignment')}
            options={siteAssignmentOptions}
            value={values.siteAssignmentId}
            onChange={handleSiteAssignmentChange}
          />
        </div>
      </FormLayout>

      {hideAttachments ? null : (
        <FormLayout
          variant="pro"
          dense
          title={t('hr.labels.supportingAttachments')}
          description={t('hr.form.supportingDocuments')}
        >
          <FileUploadInput
            files={values.files}
            onChange={(files) => patch({ files })}
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            multiple
            disabled={disabled}
          />
        </FormLayout>
      )}
    </div>
  );
}
