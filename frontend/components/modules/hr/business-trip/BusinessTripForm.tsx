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
import { isRoundTripDurationValid } from '@/lib/utils/travel-trip-dates';
import { ApiRequestError } from '@/lib/api/errors';
import type { BusinessTripDetail } from '@/lib/api/business-trip.types';
import {
  useBusinessTripSelectablePassengers,
  useSubmitBusinessTrip,
} from '@/lib/query/business-trip';
import { useCurrentUser } from '@/lib/query/profile';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

export interface BusinessTripFormProps {
  onSuccess?: (created: BusinessTripDetail) => void;
  submitLabel?: string;
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
  hostContact: '',
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
}: BusinessTripFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const onBehalf = useOnBehalf('BUSINESS_TRIP');
  const messageApi = useAppMessage();
  const currentUser = useCurrentUser();
  const passengersQuery = useBusinessTripSelectablePassengers();
  const submitMutation = useSubmitBusinessTrip();

  const [tripDetails, setTripDetails] =
    useState<BusinessTripDetailsValues>(INITIAL_TRIP);
  const [purposeBudget, setPurposeBudget] =
    useState<BusinessTripPurposeBudgetValues>(INITIAL_PURPOSE);
  const [passengers, setPassengers] = useState<BusinessTripPassengerValues[]>(
    [],
  );
  const [additional, setAdditional] =
    useState<BusinessTripAdditionalValues>(INITIAL_ADDITIONAL);
  const [seededSelf, setSeededSelf] = useState(false);

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
  const resolvedSubmitLabel =
    submitLabel ?? t('hr.buttons.submitBusinessTrip');

  const steps = useMemo(
    () => [
      {
        title: t('hr.form.tripDetails'),
        content: (
          <div className="flex flex-col gap-4">
            <OnBehalfSection state={onBehalf} />
            <BusinessTripDetailsStep
              values={tripDetails}
              onChange={setTripDetails}
            />
          </div>
        ),
        validate: (): boolean => {
          const errors: string[] = [];
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
            for (const error of errors) {
              messageApi.error(error);
            }
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
          if (!purposeBudget.purpose.trim()) {
            messageApi.error(t('hr.validation.purposeRequiredFlight'));
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
            />
            <BusinessTripSummary
              tripDetails={tripDetails}
              purposeBudget={purposeBudget}
              passengers={passengers}
              additional={additional}
            />
          </div>
        ),
      },
    ],
    [
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
      const created = await submitMutation.mutateAsync({
        ...onBehalf.payload,
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
        hostContact: purposeBudget.hostContact.trim() || undefined,
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
        files: additional.files,
      });
      messageApi.success(t('hr.messages.businessTripSubmitted'));
      onSuccess?.(created);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToSubmitBusinessTrip'),
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
          title={
            submitMutation.error instanceof ApiRequestError
              ? submitMutation.error.message
              : t('hr.messages.failedToSubmitBusinessTrip')
          }
        />
      ) : null}
      <StepperForm
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
