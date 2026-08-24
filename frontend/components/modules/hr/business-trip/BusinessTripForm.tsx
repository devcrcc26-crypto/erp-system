'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert } from 'antd';
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
  originCountry: '',
  originCity: '',
  destinationCountry: '',
  destinationCity: '',
  departureDate: null,
  returnDate: null,
  ticketClass: 'ECONOMY',
};

const INITIAL_PURPOSE: BusinessTripPurposeBudgetValues = {
  purpose: '',
  hostOrganization: '',
  hostContact: '',
  expectedOutcomes: '',
  itinerary: '',
  estimatedFlightCost: null,
  estimatedAccommodationCost: null,
  estimatedPerDiem: null,
  estimatedOtherCost: null,
};

const INITIAL_ADDITIONAL: BusinessTripAdditionalValues = {
  accommodationRequired: true,
  accommodationDetails: '',
  perDiemRequired: true,
  notes: '',
  files: [],
};

/**
 * Multi-step business trip form (details → purpose/budget → passengers → review).
 */
export function BusinessTripForm({
  onSuccess,
  submitLabel,
}: BusinessTripFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
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
          <BusinessTripDetailsStep
            values={tripDetails}
            onChange={setTripDetails}
          />
        ),
        validate: (): boolean => {
          const errors: string[] = [];
          if (!tripDetails.originCountry.trim()) {
            errors.push('Origin country is required');
          }
          if (!tripDetails.originCity.trim()) {
            errors.push('Origin city is required');
          }
          if (!tripDetails.destinationCountry.trim()) {
            errors.push('Destination country is required');
          }
          if (!tripDetails.destinationCity.trim()) {
            errors.push('Destination city is required');
          }
          if (!tripDetails.departureDate) {
            errors.push('Departure date is required');
          }
          if (
            tripDetails.tripType === 'ROUND_TRIP' &&
            !tripDetails.returnDate
          ) {
            errors.push('Return date is required for round trips');
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
            messageApi.error('Purpose is required');
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
            messageApi.error('At least one passenger is required');
            return false;
          }
          const missing = passengers.filter((p) => !p.passportNumber?.trim());
          if (missing.length > 0) {
            messageApi.error(
              `Passport number required for: ${missing
                .map((p) => p.name)
                .join(', ')}`,
            );
            return false;
          }
          return true;
        },
      },
      {
        title: t('hr.form.reviewSubmit'),
        content: (
          <div className="flex flex-col gap-6">
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
      messageApi.error('Departure date is required');
      return;
    }
    try {
      const created = await submitMutation.mutateAsync({
        tripType: tripDetails.tripType,
        originCountry: tripDetails.originCountry.trim(),
        originCity: tripDetails.originCity.trim(),
        destinationCountry: tripDetails.destinationCountry.trim(),
        destinationCity: tripDetails.destinationCity.trim(),
        departureDate: tripDetails.departureDate.format('YYYY-MM-DD'),
        returnDate:
          tripDetails.tripType === 'ROUND_TRIP' && tripDetails.returnDate
            ? tripDetails.returnDate.format('YYYY-MM-DD')
            : undefined,
        purpose: purposeBudget.purpose.trim(),
        hostOrganization: purposeBudget.hostOrganization.trim() || undefined,
        hostContact: purposeBudget.hostContact.trim() || undefined,
        expectedOutcomes: purposeBudget.expectedOutcomes.trim() || undefined,
        itinerary: purposeBudget.itinerary.trim() || undefined,
        ticketClass: tripDetails.ticketClass,
        estimatedFlightCost:
          purposeBudget.estimatedFlightCost != null
            ? Number(purposeBudget.estimatedFlightCost)
            : undefined,
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
        accommodationRequired: additional.accommodationRequired,
        accommodationDetails: additional.accommodationRequired
          ? additional.accommodationDetails.trim() || undefined
          : undefined,
        perDiemRequired: additional.perDiemRequired,
        notes: additional.notes.trim() || undefined,
        passengers: passengers.map((p) => ({
          employeeId: p.employeeId,
          passportNumber: p.passportNumber?.trim() || undefined,
          visaRequired: p.visaRequired,
          visaStatus: p.visaRequired ? p.visaStatus : undefined,
        })),
        files: additional.files,
      });
      messageApi.success('Business trip submitted');
      onSuccess?.(created);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to submit business trip', messageApi);
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {submitMutation.isError ? (
        <Alert
          type="error"
          showIcon
          className="mx-0 mt-0"
          message={
            submitMutation.error instanceof ApiRequestError
              ? submitMutation.error.message
              : 'Submit failed'
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
