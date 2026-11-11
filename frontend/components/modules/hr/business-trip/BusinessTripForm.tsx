'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert } from 'antd';
import {
  OnBehalfSection,
  useOnBehalf,
} from '@/components/shared/OnBehalfSelector';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import BusinessTripAdditionalStep from '@/components/modules/hr/business-trip/steps/BusinessTripAdditionalStep';
import BusinessTripDetailsStep from '@/components/modules/hr/business-trip/steps/BusinessTripDetailsStep';
import BusinessTripPassengersStep from '@/components/modules/hr/business-trip/steps/BusinessTripPassengersStep';
import BusinessTripPurposeBudgetStep from '@/components/modules/hr/business-trip/steps/BusinessTripPurposeBudgetStep';
import BusinessTripSummary from '@/components/modules/hr/business-trip/steps/BusinessTripSummary';
import type {
  BusinessTripAdditionalValues,
  BusinessTripDetailsValues,
  BusinessTripPassengerValues,
  BusinessTripPurposeBudgetValues,
} from '@/components/modules/hr/business-trip/steps/business-trip-stepper.types';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  hasDuplicatePassengerIds,
  notifyFormValidationErrors,
} from '@/lib/utils/travel-form-validation';
import { isRoundTripDurationValid } from '@/lib/utils/travel-trip-dates';
import dayjs from 'dayjs';
import type {
  BusinessTripDetail,
  UpdateBusinessTripPayload,
} from '@/lib/api/business-trip.types';
import {
  useBusinessTripSelectablePassengers,
  useSubmitBusinessTrip,
  useUpdateBusinessTrip,
} from '@/lib/query/business-trip';
import { formatUserName } from '@/lib/utils/user-display';
import { useCurrentUser } from '@/lib/query/profile';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

export interface BusinessTripFormProps {
  /** Leave form — shown in stepper footer beside Back. */
  onCancel?: () => void;
  cancelLabel?: string;
  onSuccess?: (created: BusinessTripDetail) => void;
  submitLabel?: string;
  /** Edit mode: the employee's own DRAFT / RETURNED trip, prefilled. */
  initialRecord?: BusinessTripDetail;
}

/** Step values from a saved trip. */
function businessTripValuesFrom(record: BusinessTripDetail): {
  tripDetails: BusinessTripDetailsValues;
  purposeBudget: BusinessTripPurposeBudgetValues;
  passengers: BusinessTripPassengerValues[];
  additional: BusinessTripAdditionalValues;
} {
  return {
    tripDetails: {
      tripType: record.tripType,
      originCountry: record.originCountry,
      originCity: record.originCity,
      destinationCountry: record.destinationCountry,
      destinationCity: record.destinationCity,
      departureDate: dayjs(record.departureDate),
      returnDate: record.returnDate ? dayjs(record.returnDate) : null,
    },
    purposeBudget: {
      purpose: record.purpose,
      hostOrganization: record.hostOrganization ?? '',
      hostContactName: record.hostContactName ?? '',
      hostContactPhone: record.hostContactPhone ?? '',
      hostContactEmail: record.hostContactEmail ?? '',
      expectedOutcomes: record.expectedOutcomes ?? '',
      itinerary: record.itinerary ?? '',
      estimatedAccommodationCost: record.estimatedAccommodationCost ?? null,
      estimatedPerDiem: record.estimatedPerDiem ?? null,
      estimatedOtherCost: record.estimatedOtherCost ?? null,
    },
    passengers: record.passengers.map((passenger) => ({
      employeeId: passenger.employeeId,
      name: passenger.employee
        ? formatUserName(passenger.employee)
        : passenger.employeeId,
      passportNumber: passenger.passportNumber ?? undefined,
      visaRequired: passenger.visaRequired,
      visaStatus: passenger.visaStatus ?? undefined,
    })),
    additional: { notes: record.notes ?? '', files: [] },
  };
}

const INITIAL_TRIP: BusinessTripDetailsValues = {
  tripType: 'ONE_WAY',
  originCountry: 'Ethiopia',
  originCity: '',
  destinationCountry: '',
  destinationCity: '',
  departureDate: null,
  returnDate: null,
};

const INITIAL_PURPOSE: BusinessTripPurposeBudgetValues = {
  purpose: '',
  hostOrganization: '',
  hostContactName: '',
  hostContactPhone: '',
  hostContactEmail: '',
  expectedOutcomes: '',
  itinerary: '',
  estimatedAccommodationCost: null,
  estimatedPerDiem: null,
  estimatedOtherCost: null,
};

const INITIAL_ADDITIONAL: BusinessTripAdditionalValues = {
  notes: '',
  files: [],
};

/**
 * Multi-step business trip form - same StepperForm chrome as Add Employee.
 */
export function BusinessTripForm({
  onSuccess,
  submitLabel,
  initialRecord,
  onCancel,
  cancelLabel,
}: BusinessTripFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const onBehalf = useOnBehalf('BUSINESS_TRIP');
  const messageApi = useAppMessage();
  const currentUser = useCurrentUser();
  const passengersQuery = useBusinessTripSelectablePassengers();
  const createMutation = useSubmitBusinessTrip();
  const updateMutation = useUpdateBusinessTrip(initialRecord?.id ?? '');
  const submitMutation = initialRecord ? updateMutation : createMutation;
  const [initial] = useState(() =>
    initialRecord ? businessTripValuesFrom(initialRecord) : null,
  );

  const [tripDetails, setTripDetails] = useState<BusinessTripDetailsValues>(
    initial?.tripDetails ?? INITIAL_TRIP,
  );
  const [purposeBudget, setPurposeBudget] =
    useState<BusinessTripPurposeBudgetValues>(
      initial?.purposeBudget ?? INITIAL_PURPOSE,
    );
  const [passengers, setPassengers] = useState<BusinessTripPassengerValues[]>(
    initial?.passengers ?? [],
  );
  const [additional, setAdditional] = useState<BusinessTripAdditionalValues>(
    initial?.additional ?? INITIAL_ADDITIONAL,
  );
  // Edit mode keeps the saved passengers instead of seeding the user.
  const [seededSelf, setSeededSelf] = useState(Boolean(initial));

  useEffect(() => {
    if (seededSelf || !currentUser.data?.id || !passengersQuery.data) {
      return;
    }
    const self = passengersQuery.data.find((p) => p.id === currentUser.data?.id);
    if (self) {
      setPassengers([
        {
          employeeId: self.id,
          name: self.name,
          visaRequired: true,
        },
      ]);
    }
    setSeededSelf(true);
  }, [currentUser.data, passengersQuery.data, seededSelf]);

  const selectablePassengers = passengersQuery.data ?? [];
  const resolvedSubmitLabel = initialRecord
    ? t('pages.approvals.edit.saveChanges')
    : submitLabel ?? t('hr.buttons.submitBusinessTrip');

  const steps = useMemo(
    () => [
      {
        title: t('hr.form.tripDetails'),
        content: (
          <div className="flex flex-col gap-4">
            {initialRecord ? null : <OnBehalfSection state={onBehalf} />}
            <BusinessTripDetailsStep
              values={tripDetails}
              onChange={setTripDetails}
            />
          </div>
        ),
        validate: (): boolean => {
          const errors: string[] = [];
          if (onBehalf.targetRequired) {
            errors.push(t('hr.validation.onBehalfEmployeeRequired'));
          }
          if (!tripDetails.originCountry.trim()) {
            errors.push(t('hr.validation.originCountryRequired'));
          }
          if (!tripDetails.originCity.trim()) {
            errors.push(t('hr.validation.originCityRequired'));
          }
          if (!tripDetails.destinationCountry.trim()) {
            errors.push(t('hr.validation.destinationCountryRequired'));
          }
          if (!tripDetails.destinationCity.trim()) {
            errors.push(t('hr.validation.destinationCityRequired'));
          }
          if (!tripDetails.departureDate) {
            errors.push(t('hr.validation.departureDateRequired'));
          }
          if (
            tripDetails.tripType === 'ROUND_TRIP' &&
            !tripDetails.returnDate
          ) {
            errors.push(t('hr.validation.returnDateRequired'));
          }
          if (
            tripDetails.tripType === 'ROUND_TRIP' &&
            tripDetails.departureDate &&
            tripDetails.returnDate?.isBefore(tripDetails.departureDate)
          ) {
            errors.push(t('hr.validation.returnAfterDeparture'));
          }
          if (
            tripDetails.tripType === 'ROUND_TRIP' &&
            tripDetails.departureDate &&
            tripDetails.returnDate &&
            !isRoundTripDurationValid(
              tripDetails.departureDate,
              tripDetails.returnDate,
            )
          ) {
            errors.push(t('hr.validation.roundTripMinDuration'));
          }
          if (errors.length > 0) {
            notifyFormValidationErrors(messageApi, errors);
            return false;
          }
          return true;
        },
      },
      {
        title: t('hr.form.purposeBudget'),
        content: (
          <BusinessTripPurposeBudgetStep
            values={purposeBudget}
            onChange={setPurposeBudget}
          />
        ),
        validate: (): boolean => {
          const errors: string[] = [];
          if (!purposeBudget.purpose.trim()) {
            errors.push(t('hr.validation.purposeRequiredFlight'));
          }
          const email = purposeBudget.hostContactEmail.trim();
          if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            errors.push(t('hr.validation.hostContactEmailInvalid'));
          }
          if (errors.length > 0) {
            notifyFormValidationErrors(messageApi, errors);
            return false;
          }
          return true;
        },
      },
      {
        title: t('hr.form.passengers'),
        content: (
          <BusinessTripPassengersStep
            values={passengers}
            onChange={setPassengers}
            selectablePassengers={selectablePassengers}
            loading={passengersQuery.isLoading}
          />
        ),
        validate: (): boolean => {
          if (passengers.length === 0) {
            messageApi.error(t('hr.validation.passengersRequired'));
            return false;
          }
          if (hasDuplicatePassengerIds(passengers)) {
            messageApi.error(t('hr.validation.duplicatePassengers'));
            return false;
          }
          const missing = passengers.filter((p) => !p.passportNumber?.trim());
          if (missing.length > 0) {
            messageApi.error(
              t('hr.validation.passportRequiredFor', {
                names: missing.map((p) => p.name).join(', '),
              }),
            );
            return false;
          }
          return true;
        },
      },
      {
        title: t('hr.form.reviewSubmit'),
        content: (
          <div className="flex flex-col gap-4">
            <BusinessTripAdditionalStep
              values={additional}
              onChange={setAdditional}
              disabled={submitMutation.isPending}
              hideAttachments={Boolean(initialRecord)}
            />
            <BusinessTripSummary
              tripDetails={tripDetails}
              purposeBudget={purposeBudget}
              passengers={passengers}
              additional={additional}
            />
          </div>
        ),
        validate: (): boolean => {
          if (onBehalf.targetRequired) {
            messageApi.error(t('hr.validation.onBehalfEmployeeRequired'));
            return false;
          }
          if (
            tripDetails.tripType === 'ROUND_TRIP' &&
            tripDetails.departureDate &&
            tripDetails.returnDate &&
            !isRoundTripDurationValid(
              tripDetails.departureDate,
              tripDetails.returnDate,
            )
          ) {
            messageApi.error(t('hr.validation.roundTripMinDuration'));
            return false;
          }
          if (hasDuplicatePassengerIds(passengers)) {
            messageApi.error(t('hr.validation.duplicatePassengers'));
            return false;
          }
          return true;
        },
      },
    ],
    [
      initialRecord,
      onBehalf,
      tripDetails,
      purposeBudget,
      passengers,
      additional,
      selectablePassengers,
      passengersQuery.isLoading,
      submitMutation.isPending,
      messageApi,
      t,
    ],
  );

  async function handleSubmit(): Promise<void> {
    if (!tripDetails.departureDate) {
      messageApi.error(t('hr.validation.departureDateRequired'));
      return;
    }
    try {
      const payload = {
        tripType: tripDetails.tripType,
        originCountry: tripDetails.originCountry.trim(),
        originCity: tripDetails.originCity.trim(),
        destinationCountry: tripDetails.destinationCountry.trim(),
        destinationCity: tripDetails.destinationCity.trim(),
        departureDate: tripDetails.departureDate.toISOString(),
        returnDate:
          tripDetails.tripType === 'ROUND_TRIP' && tripDetails.returnDate
            ? tripDetails.returnDate.toISOString()
            : undefined,
        purpose: purposeBudget.purpose.trim(),
        hostOrganization: purposeBudget.hostOrganization.trim() || undefined,
        hostContactName: purposeBudget.hostContactName.trim() || undefined,
        hostContactPhone: purposeBudget.hostContactPhone.trim() || undefined,
        hostContactEmail: purposeBudget.hostContactEmail.trim() || undefined,
        expectedOutcomes: purposeBudget.expectedOutcomes.trim() || undefined,
        itinerary: purposeBudget.itinerary.trim() || undefined,
        estimatedAccommodationCost:
          purposeBudget.estimatedAccommodationCost != null
            ? Number(purposeBudget.estimatedAccommodationCost)
            : undefined,
        estimatedPerDiem:
          purposeBudget.estimatedPerDiem != null
            ? Number(purposeBudget.estimatedPerDiem)
            : undefined,
        estimatedOtherCost:
          purposeBudget.estimatedOtherCost != null
            ? Number(purposeBudget.estimatedOtherCost)
            : undefined,
        notes: additional.notes.trim() || undefined,
        passengers: passengers.map((p) => ({
          employeeId: p.employeeId,
          passportNumber: p.passportNumber?.trim() || undefined,
          visaRequired: p.visaRequired,
          visaStatus: p.visaRequired ? p.visaStatus : undefined,
        })),
      } satisfies UpdateBusinessTripPayload;
      if (initialRecord) {
        const saved = await updateMutation.mutateAsync(payload);
        messageApi.success(t('pages.approvals.edit.saved'));
        onSuccess?.(saved);
        return;
      }
      const created = await createMutation.mutateAsync({
        ...onBehalf.payload,
        ...payload,
        files: additional.files,
      });
      messageApi.success(t('hr.messages.businessTripSubmitted'));
      onSuccess?.(created);
    } catch (error: unknown) {
      notifyApiError(
        error,
        initialRecord
          ? t('pages.approvals.edit.failed')
          : t('hr.messages.failedToSubmitBusinessTrip'),
        messageApi,
      );
    }
  }

  return (
    <div className="flex min-h-0 w-full flex-col">
      {submitMutation.isError ? (
        <Alert
          type="error"
          showIcon
          className="mb-4"
          title={getFriendlyApiErrorMessage(
            submitMutation.error,
            t('hr.messages.failedToSubmitBusinessTrip'),
            t,
          )}
        />
      ) : null}
      <StepperForm
        onCancel={onCancel}
        cancelLabel={cancelLabel}
        steps={steps}
        onSubmit={handleSubmit}
        submitLabel={resolvedSubmitLabel}
        isSubmitting={submitMutation.isPending}
        contentVariant="sections"
        compact
      />
    </div>
  );
}

export default BusinessTripForm;
