'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert } from 'antd';
import {
  OnBehalfSection,
  useOnBehalf,
} from '@/components/shared/OnBehalfSelector';
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
import { hasDuplicatePassengerIds } from '@/lib/utils/travel-form-validation';
import { isRoundTripDurationValid } from '@/lib/utils/travel-trip-dates';
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
  originCountry: 'Ethiopia',
  originCity: '',
  destination: '',
  destinationCity: '',
  destinationCountry: 'Ethiopia',
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
 * Multi-step flight application form - same StepperForm chrome as Add Employee.
 */
export function FlightApplicationForm({
  onSuccess,
  submitLabel,
}: FlightApplicationFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const onBehalf = useOnBehalf('FLIGHT_APPLICATION');
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
          <div className="flex flex-col gap-4">
            <OnBehalfSection state={onBehalf} />
            <FlightTripDetailsStep
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
          if (tripDetails.isInternational && !tripDetails.originCountry.trim()) {
            errors.push(t('hr.validation.originCountryRequired'));
          }
          if (!tripDetails.originCity.trim()) {
            errors.push(t('hr.validation.originCityRequired'));
          }
          if (tripDetails.isInternational) {
            if (!tripDetails.destinationCountry?.trim()) {
              errors.push(t('hr.validation.destinationCountryRequired'));
            }
            if (
              !(
                tripDetails.destinationCity?.trim() ||
                tripDetails.destination.trim()
              )
            ) {
              errors.push(t('hr.validation.destinationCityRequired'));
            }
          } else if (
            !(
              tripDetails.destinationCity?.trim() ||
              tripDetails.destination.trim()
            )
          ) {
            errors.push(t('hr.validation.destinationRequired'));
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
          if (!tripDetails.purpose.trim()) {
            errors.push(t('hr.validation.purposeRequiredFlight'));
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
            messageApi.error(t('hr.validation.passengersRequired'));
            return false;
          }
          if (hasDuplicatePassengerIds(passengers)) {
            messageApi.error(t('hr.validation.duplicatePassengers'));
            return false;
          }
          if (tripDetails.isInternational) {
            const missing = passengers.filter(
              (p) => !p.passportNumber?.trim(),
            );
            if (missing.length > 0) {
              messageApi.error(
                t('hr.validation.passportRequiredFor', {
                  names: missing.map((p) => p.name).join(', '),
                }),
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
          <div className="flex flex-col gap-4">
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
      onBehalf,
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
      messageApi.error(t('hr.validation.departureDateRequired'));
      return;
    }
    try {
      const destinationCity = (
        tripDetails.destinationCity?.trim() || tripDetails.destination.trim()
      ).trim();
      const destinationCountry = tripDetails.isInternational
        ? tripDetails.destinationCountry?.trim() || ''
        : 'Ethiopia';
      const destination =
        tripDetails.isInternational && destinationCountry
          ? `${destinationCity}, ${destinationCountry}`
          : destinationCity;

      const created = await submitMutation.mutateAsync({
        ...onBehalf.payload,
        tripType: tripDetails.tripType,
        isInternational: tripDetails.isInternational,
        originCountry: tripDetails.isInternational
          ? tripDetails.originCountry.trim()
          : 'Ethiopia',
        originCity: tripDetails.originCity.trim(),
        destination,
        departureDate: tripDetails.departureDate.toISOString(),
        returnDate:
          tripDetails.tripType === 'ROUND_TRIP' && tripDetails.returnDate
            ? tripDetails.returnDate.toISOString()
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
      messageApi.success(t('hr.messages.flightApplicationSubmitted'));
      onSuccess?.(created);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToSubmitFlightApplication'),
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
              : t('hr.messages.failedToSubmitFlightApplication')
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
