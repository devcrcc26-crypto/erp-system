'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  apiGet,
  apiGetPaginated,
  apiPatch,
  apiPostForm,
} from '@/lib/api/client';
import type {
  FlightApplicationDetail,
  FlightApplicationListItem,
  FlightApplicationStatus,
  FlightSelectablePassenger,
  ListFlightApplicationsParams,
  SubmitFlightApplicationPayload,
} from '@/lib/api/flight.types';
import type { PaginationMeta } from '@/lib/api/types';
import { toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const FLIGHT_PATH = '/hr/flight-applications';

export const flightKeys = {
  all: ['flight'] as const,
  lists: () => [...flightKeys.all, 'list'] as const,
  list: (params: ListFlightApplicationsParams) =>
    [...flightKeys.lists(), params] as const,
  myLists: () => [...flightKeys.all, 'my'] as const,
  myList: (params: ListFlightApplicationsParams) =>
    [...flightKeys.myLists(), params] as const,
  details: () => [...flightKeys.all, 'detail'] as const,
  detail: (id: string) => [...flightKeys.details(), id] as const,
  passengers: () => [...flightKeys.all, 'passengers'] as const,
};

function buildListQuery(params: ListFlightApplicationsParams): string {
  const { status, isInternational, ...rest } = params;
  const statusValue = Array.isArray(status)
    ? status.length > 0
      ? status.join(',')
      : undefined
    : status;
  return toQueryString({
    ...rest,
    status: statusValue,
    isInternational:
      isInternational !== undefined ? String(isInternational) : undefined,
  });
}

/**
 * Paginated flight applications (company-wide).
 */
export function useFlightApplications(
  params: ListFlightApplicationsParams = { page: 1, limit: 20 },
  enabled = true,
): ReturnType<
  typeof useQuery<PaginatedResult<FlightApplicationListItem>>
> {
  return useQuery({
    queryKey: flightKeys.list(params),
    queryFn: () =>
      apiGetPaginated<FlightApplicationListItem>(
        `${FLIGHT_PATH}${buildListQuery(params)}`,
      ),
    enabled,
    retry: false,
  });
}

/**
 * Current user's flight applications.
 */
export function useMyFlightApplications(
  params: ListFlightApplicationsParams = { page: 1, limit: 20 },
  enabled = true,
): ReturnType<
  typeof useQuery<PaginatedResult<FlightApplicationListItem>>
> {
  return useQuery({
    queryKey: flightKeys.myList(params),
    queryFn: () =>
      apiGetPaginated<FlightApplicationListItem>(
        `${FLIGHT_PATH}/my${buildListQuery(params)}`,
      ),
    enabled,
    retry: false,
  });
}

/**
 * Single flight application with passengers and approval tiers.
 */
export function useFlightApplication(id: string, enabled = true) {
  return useQuery({
    queryKey: flightKeys.detail(id),
    queryFn: () => apiGet<FlightApplicationDetail>(`${FLIGHT_PATH}/${id}`),
    enabled: Boolean(id) && enabled,
    retry: false,
  });
}

/**
 * Employees selectable as passengers.
 */
export function useSelectablePassengers(enabled = true) {
  return useQuery({
    queryKey: flightKeys.passengers(),
    queryFn: () =>
      apiGet<FlightSelectablePassenger[]>(`${FLIGHT_PATH}/passengers`),
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Submits a new flight application (multipart/form-data).
 * Passengers are serialised as JSON in the `passengers` field.
 */
export function useSubmitFlightApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmitFlightApplicationPayload) => {
      const formData = new FormData();
      formData.append('tripType', payload.tripType);
      formData.append('isInternational', String(payload.isInternational));
      formData.append('origin', payload.origin);
      formData.append('destination', payload.destination);
      formData.append('departureDate', payload.departureDate);
      if (payload.returnDate) {
        formData.append('returnDate', payload.returnDate);
      }
      formData.append('purpose', payload.purpose);
      formData.append('ticketClass', payload.ticketClass);
      formData.append('accommodationRequired', String(payload.accommodationRequired));
      if (payload.accommodationDetails) {
        formData.append('accommodationDetails', payload.accommodationDetails);
      }
      formData.append('perDiemRequired', String(payload.perDiemRequired));
      if (payload.notes) {
        formData.append('notes', payload.notes);
      }
      formData.append('passengers', JSON.stringify(payload.passengers));
      for (const file of payload.files ?? []) {
        formData.append('files', file);
      }
      return apiPostForm<FlightApplicationDetail>(FLIGHT_PATH, formData);
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: flightKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: flightKeys.myLists() });
      void queryClient.setQueryData(flightKeys.detail(created.id), created);
    },
  });
}

/**
 * Cancels a draft or submitted flight application.
 */
export function useCancelFlightApplication(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPatch<FlightApplicationDetail>(`${FLIGHT_PATH}/${id}/cancel`),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: flightKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: flightKeys.myLists() });
      void queryClient.setQueryData(flightKeys.detail(id), updated);
    },
  });
}

/**
 * Attaches a single combined ticket document to an approved application.
 */
export function useAttachCombinedTicket(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<FlightApplicationDetail>(
        `${FLIGHT_PATH}/${id}/combined-ticket`,
        formData,
      );
    },
    onSuccess: (updated) => {
      void queryClient.setQueryData(flightKeys.detail(id), updated);
      void queryClient.invalidateQueries({ queryKey: flightKeys.lists() });
    },
  });
}

/**
 * Attaches an individual ticket to a specific passenger.
 */
export function useAttachPassengerTicket(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ passengerId, file }: { passengerId: string; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<FlightApplicationDetail>(
        `${FLIGHT_PATH}/${applicationId}/passengers/${passengerId}/ticket`,
        formData,
      );
    },
    onSuccess: (updated) => {
      void queryClient.setQueryData(flightKeys.detail(applicationId), updated);
      void queryClient.invalidateQueries({ queryKey: flightKeys.lists() });
    },
  });
}

/**
 * Employee acknowledges receipt of their ticket.
 */
export function useAcknowledgeTicket(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (passengerId: string) =>
      apiPatch<FlightApplicationDetail>(
        `${FLIGHT_PATH}/${applicationId}/passengers/${passengerId}/acknowledge`,
      ),
    onSuccess: (updated) => {
      void queryClient.setQueryData(flightKeys.detail(applicationId), updated);
    },
  });
}

export type FlightApplicationsResult = PaginatedResult<FlightApplicationListItem>;
