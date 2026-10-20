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
import {
  hasDuplicatePassengerIds,
  notifyFormValidationErrors,
} from '@/lib/utils/travel-form-validation';
import { isRoundTripDurationValid } from '@/lib/utils/travel-trip-dates';
import type { FlightApplicationDetail } from '@/lib/api/flight.types';
import {
  useSelectablePassengers,
  useSubmitFlightApplication,
} from '@/lib/query/flight';
import { useBusinessTrips } from '@/lib/query/business-trip';
import { useEmployeeSiteAssignments } from '@/lib/query/site-assignment';
import { useCurrentUser } from '@/lib/query/profile';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
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
  const approvedTripsQuery = useBusinessTrips(
    { status: 'APPROVED', limit: 50 },
    true,
  );
  const siteAssignmentsQuery = useEmployeeSiteAssignments(
    onBehalf.effectiveEmployeeId,
    Boolean(onBehalf.effectiveEmployeeId),
  );

  const [tripDetails, setTripDetails] =
    useState<FlightTripDetailsValues>(INITIAL_TRIP);
  const [passengers, setPassengers] = useState<FlightPassengerValues[]>([]);
  const [additional, setAdditional] =
    useState<FlightAdditionalValues>(INITIAL_ADDITIONAL);
  const [seededSelf, setSeededSelf] = useState(false);

  const linkedBusinessTripLabel = useMemo(() => {
    if (!additional.linkedBusinessTripId) {
      return undefined;
    }
    const trip = approvedTripsQuery.data?.data.find(
      (row) => row.id === additional.linkedBusinessTripId,
    );
    return trip
      ? `${trip.tripNumber} - ${trip.destinationCity}`
      : additional.linkedBusinessTripId;
  }, [additional.linkedBusinessTripId, approvedTripsQuery.data?.data]);

  const linkedSiteAssignmentLabel = useMemo(() => {
    if (!additional.siteAssignmentId) {
      return undefined;
    }
    const row = (siteAssignmentsQuery.data ?? []).find(
      (assignment) => assignment.id === additional.siteAssignmentId,
    );
    return row
      ? `${row.requestNumber} - ${row.siteName}`
      : additional.siteAssignmentId;
  }, [additional.siteAssignmentId, siteAssignmentsQuery.data]);

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
            notifyFormValidationErrors(messageApi, errors);
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
              effectiveEmployeeId={onBehalf.effectiveEmployeeId}
            />
            <FlightSummary
              tripDetails={tripDetails}
              passengers={passengers}
              additional={additional}
              linkedBusinessTripLabel={linkedBusinessTripLabel}
              linkedSiteAssignmentLabel={linkedSiteAssignmentLabel}
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
      linkedBusinessTripLabel,
      linkedSiteAssignmentLabel,
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
        notes: additional.notes.trim() || undefined,
        linkedBusinessTripId: additional.linkedBusinessTripId,
        siteAssignmentId: additional.siteAssignmentId,
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
          title={getFriendlyApiErrorMessage(
            submitMutation.error,
            t('hr.messages.failedToSubmitFlightApplication'),
            t,
          )}
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
