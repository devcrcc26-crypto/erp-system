'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert } from 'antd';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import FlightAdditionalStep from '@/components/modules/hr/flight/steps/FlightAdditionalStep';
import FlightPassengersStep from '@/components/modules/hr/flight/steps/FlightPassengersStep';
import FlightSummary from '@/components/modules/hr/flight/steps/FlightSummary';
import FlightTripDetailsStep from '@/components/modules/hr/flight/steps/FlightTripDetailsStep';
import type {
  FlightAdditionalValues,
  FlightPassengerValues,
  FlightTripDetailsValues,
} from '@/components/modules/hr/flight/steps/flight-stepper.types';
import { useAppMessage } from '@/hooks/use-app-message';
import { ApiRequestError } from '@/lib/api/errors';
import type { FlightApplicationDetail } from '@/lib/api/flight.types';
import {
  useSelectablePassengers,
  useSubmitFlightApplication,
} from '@/lib/query/flight';
import { useCurrentUser } from '@/lib/query/profile';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

export interface FlightApplicationFormProps {
  onSuccess?: (created: FlightApplicationDetail) => void;
  submitLabel?: string;
}

const INITIAL_TRIP: FlightTripDetailsValues = {
  tripType: 'ONE_WAY',
  isInternational: false,
  originCountry: '',
  originCity: '',
  destination: '',
  departureDate: null,
  returnDate: null,
  purpose: '',
  ticketClass: 'ECONOMY',
};

const INITIAL_ADDITIONAL: FlightAdditionalValues = {
  accommodationRequired: false,
  accommodationDetails: '',
  perDiemRequired: false,
  notes: '',
  files: [],
};

/**
 * Multi-step flight application form (trip → passengers → review & submit).
 */
export function FlightApplicationForm({
  onSuccess,
  submitLabel,
}: FlightApplicationFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const currentUser = useCurrentUser();
  const passengersQuery = useSelectablePassengers();
  const submitMutation = useSubmitFlightApplication();

  const [tripDetails, setTripDetails] =
    useState<FlightTripDetailsValues>(INITIAL_TRIP);
  const [passengers, setPassengers] = useState<FlightPassengerValues[]>([]);
  const [additional, setAdditional] =
    useState<FlightAdditionalValues>(INITIAL_ADDITIONAL);
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
          visaRequired: false,
        },
      ]);
    }
    setSeededSelf(true);
  }, [currentUser.data, passengersQuery.data, seededSelf]);

  const selectablePassengers = passengersQuery.data ?? [];
  const resolvedSubmitLabel =
    submitLabel ?? t('hr.buttons.submitApplication');

  const steps = useMemo(
    () => [
      {
        title: t('hr.form.tripDetails'),
        content: (
          <FlightTripDetailsStep
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
          if (!tripDetails.destination.trim()) {
            errors.push('Destination is required');
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
          if (!tripDetails.purpose.trim()) {
            errors.push('Purpose is required');
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
        title: t('hr.form.passengers'),
        content: (
          <FlightPassengersStep
            values={passengers}
            onChange={setPassengers}
            isInternational={tripDetails.isInternational}
            selectablePassengers={selectablePassengers}
            loading={passengersQuery.isLoading}
          />
        ),
        validate: (): boolean => {
          if (passengers.length === 0) {
            messageApi.error('At least one passenger is required');
            return false;
          }
          if (tripDetails.isInternational) {
            const missing = passengers.filter(
              (p) => !p.passportNumber?.trim(),
            );
            if (missing.length > 0) {
              messageApi.error(
                `Passport number required for: ${missing
                  .map((p) => p.name)
                  .join(', ')}`,
              );
              return false;
            }
          }
          return true;
        },
      },
      {
        title: t('hr.form.reviewSubmit'),
        content: (
          <div className="flex flex-col gap-6">
            <FlightAdditionalStep
              values={additional}
              onChange={setAdditional}
              disabled={submitMutation.isPending}
            />
            <FlightSummary
              tripDetails={tripDetails}
              passengers={passengers}
              additional={additional}
            />
          </div>
        ),
      },
    ],
    [
      tripDetails,
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
        isInternational: tripDetails.isInternational,
        originCountry: tripDetails.originCountry.trim(),
        originCity: tripDetails.originCity.trim(),
        destination: tripDetails.destination.trim(),
        departureDate: tripDetails.departureDate.format('YYYY-MM-DD'),
        returnDate:
          tripDetails.tripType === 'ROUND_TRIP' && tripDetails.returnDate
            ? tripDetails.returnDate.format('YYYY-MM-DD')
            : undefined,
        purpose: tripDetails.purpose.trim(),
        ticketClass: tripDetails.ticketClass,
        accommodationRequired: additional.accommodationRequired,
        accommodationDetails: additional.accommodationRequired
          ? additional.accommodationDetails.trim() || undefined
          : undefined,
        perDiemRequired: additional.perDiemRequired,
        notes: additional.notes.trim() || undefined,
        passengers: passengers.map((p) => ({
          employeeId: p.employeeId,
          passportNumber: p.passportNumber?.trim() || undefined,
          visaRequired: tripDetails.isInternational
            ? p.visaRequired
            : false,
          visaStatus:
            tripDetails.isInternational && p.visaRequired
              ? p.visaStatus
              : undefined,
        })),
        files: additional.files,
      });
      messageApi.success('Flight application submitted');
      onSuccess?.(created);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to submit flight application', messageApi);
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

export default FlightApplicationForm;
