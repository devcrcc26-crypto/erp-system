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
import dayjs from 'dayjs';
import type {
  FlightApplicationDetail,
  UpdateFlightApplicationPayload,
} from '@/lib/api/flight.types';
import {
  useSelectablePassengers,
  useSubmitFlightApplication,
  useUpdateFlightApplication,
} from '@/lib/query/flight';
import { formatUserName } from '@/lib/utils/user-display';
import { useBusinessTrips } from '@/lib/query/business-trip';
import { useEmployeeSiteAssignments } from '@/lib/query/site-assignment';
import { useCurrentUser } from '@/lib/query/profile';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

export interface FlightApplicationFormProps {
  /** Leave form — shown in stepper footer beside Back. */
  onCancel?: () => void;
  cancelLabel?: string;
  onSuccess?: (created: FlightApplicationDetail) => void;
  submitLabel?: string;
  /** Edit mode: the employee's own DRAFT / RETURNED application, prefilled. */
  initialRecord?: FlightApplicationDetail;
}

/** Step values from a saved application (international destination is "City, Country"). */
function flightValuesFrom(record: FlightApplicationDetail): {
  tripDetails: FlightTripDetailsValues;
  passengers: FlightPassengerValues[];
  additional: FlightAdditionalValues;
} {
  const parts = record.destination.split(',').map((part) => part.trim());
  const destinationCountry =
    record.isInternational && parts.length > 1 ? parts.pop() : 'Ethiopia';
  const destinationCity = parts.join(', ');
  return {
    tripDetails: {
      tripType: record.tripType,
      isInternational: record.isInternational,
      originCountry: record.originCountry,
      originCity: record.originCity,
      destination: destinationCity,
      destinationCity,
      destinationCountry,
      departureDate: dayjs(record.departureDate),
      returnDate: record.returnDate ? dayjs(record.returnDate) : null,
      purpose: record.purpose,
      ticketClass: record.ticketClass,
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
    additional: {
      notes: record.notes ?? '',
      linkedBusinessTripId: record.linkedBusinessTripId ?? undefined,
      siteAssignmentId: record.siteAssignmentId ?? undefined,
      files: [],
    },
  };
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
  initialRecord,
  onCancel,
  cancelLabel,
}: FlightApplicationFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const onBehalf = useOnBehalf('FLIGHT_APPLICATION');
  const messageApi = useAppMessage();
  const currentUser = useCurrentUser();
  const passengersQuery = useSelectablePassengers();
  const createMutation = useSubmitFlightApplication();
  const updateMutation = useUpdateFlightApplication(initialRecord?.id ?? '');
  const submitMutation = initialRecord ? updateMutation : createMutation;
  const [initial] = useState(() =>
    initialRecord ? flightValuesFrom(initialRecord) : null,
  );
  const approvedTripsQuery = useBusinessTrips(
    { status: 'APPROVED', limit: 50 },
    true,
  );
  const siteAssignmentsQuery = useEmployeeSiteAssignments(
    onBehalf.effectiveEmployeeId,
    Boolean(onBehalf.effectiveEmployeeId),
  );

  const [tripDetails, setTripDetails] = useState<FlightTripDetailsValues>(
    initial?.tripDetails ?? INITIAL_TRIP,
  );
  const [passengers, setPassengers] = useState<FlightPassengerValues[]>(
    initial?.passengers ?? [],
  );
  const [additional, setAdditional] = useState<FlightAdditionalValues>(
    initial?.additional ?? INITIAL_ADDITIONAL,
  );
  // Edit mode keeps the saved passengers instead of seeding the user.
  const [seededSelf, setSeededSelf] = useState(Boolean(initial));

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
  const resolvedSubmitLabel = initialRecord
    ? t('pages.approvals.edit.saveChanges')
    : submitLabel ?? t('hr.buttons.submitApplication');

  const steps = useMemo(
    () => [
      {
        title: t('hr.form.tripDetails'),
        content: (
          <div className="flex flex-col gap-4">
            {initialRecord ? null : <OnBehalfSection state={onBehalf} />}
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
              hideAttachments={Boolean(initialRecord)}
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
      initialRecord,
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

      const payload = {
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
      } satisfies UpdateFlightApplicationPayload;
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
      messageApi.success(t('hr.messages.flightApplicationSubmitted'));
      onSuccess?.(created);
    } catch (error: unknown) {
      notifyApiError(
        error,
        initialRecord
          ? t('pages.approvals.edit.failed')
          : t('hr.messages.failedToSubmitFlightApplication'),
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

export default FlightApplicationForm;
