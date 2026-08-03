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
  apiPost,
  apiPostForm,
} from '@/lib/api/client';
import type {
  FlightApplicationDetail,
  FlightApplicationListItem,
  FlightSelectablePassenger,
  ListFlightApplicationsParams,
  SubmitFlightApplicationPayload,
} from '@/lib/api/flight.types';
import type { PaginationMeta } from '@/lib/api/types';
import { approvalKeys } from '@/lib/query/approvals';
import { toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const FLIGHT_PATH = '/hr/flight-applications';

export const flightKeys = {
  all: ['flight'] as const,
  lists: () => [...flightKeys.all, 'list'] as const,
  list: (params: ListFlightApplicationsParams) =>
    [...flightKeys.lists(), params] as const,
  details: () => [...flightKeys.all, 'detail'] as const,
  detail: (id: string) => [...flightKeys.details(), id] as const,
  selectable: () => [...flightKeys.all, 'selectable'] as const,
  needsTicketCount: () => [...flightKeys.all, 'needs-ticket-count'] as const,
};

function buildListQuery(params: ListFlightApplicationsParams): string {
  const { status, ...rest } = params;
  const statusValue = Array.isArray(status)
    ? status.length > 0
      ? status.join(',')
      : undefined
    : status;
  return toQueryString({
    ...rest,
    status: statusValue,
  });
}

/**
 * Paginated flight applications.
 */
export function useFlightApplications(
  params: ListFlightApplicationsParams = { page: 1, limit: 20 },
  enabled = true,
) {
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
 * Count of APPROVED applications still needing ticket attachment (HR list badge).
 */
export function useFlightNeedsTicketCount(enabled = true) {
  return useQuery({
    queryKey: flightKeys.needsTicketCount(),
    queryFn: async (): Promise<number> => {
      const result = await apiGet<{ total: number }>(
        `${FLIGHT_PATH}/count?needsTicket=true`,
      );
      return result.total ?? 0;
    },
    enabled,
    refetchInterval: 30_000,
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
 * Passengers the current user may select.
 */
export function useSelectablePassengers(enabled = true) {
  return useQuery({
    queryKey: flightKeys.selectable(),
    queryFn: () =>
      apiGet<FlightSelectablePassenger[]>(
        `${FLIGHT_PATH}/selectable-passengers`,
      ),
    enabled,
    retry: false,
  });
}

/**
 * Submits a flight application (multipart when files attached).
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
      formData.append(
        'accommodationRequired',
        String(payload.accommodationRequired),
      );
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
      void queryClient.setQueryData(flightKeys.detail(created.id), created);
    },
  });
}

/**
 * Cancels a draft/submitted flight application.
 */
export function useCancelFlightApplication(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPatch<FlightApplicationDetail>(`${FLIGHT_PATH}/${id}/cancel`),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: flightKeys.lists() });
      void queryClient.setQueryData(flightKeys.detail(id), updated);
    },
  });
}

/**
 * HR attaches a combined ticket file.
 */
export function useAttachCombinedTicket(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<FlightApplicationDetail>(
        `${FLIGHT_PATH}/${id}/tickets/combined`,
        formData,
      );
    },
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: flightKeys.lists() });
      void queryClient.invalidateQueries({
        queryKey: flightKeys.needsTicketCount(),
      });
      void queryClient.setQueryData(flightKeys.detail(id), updated);
    },
  });
}

/**
 * HR attaches an individual passenger ticket.
 */
export function useAttachPassengerTicket(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      passengerId,
      file,
    }: {
      passengerId: string;
      file: File;
    }) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<FlightApplicationDetail>(
        `${FLIGHT_PATH}/${id}/passengers/${passengerId}/ticket`,
        formData,
      );
    },
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: flightKeys.lists() });
      void queryClient.invalidateQueries({
        queryKey: flightKeys.needsTicketCount(),
      });
      void queryClient.setQueryData(flightKeys.detail(id), updated);
    },
  });
}

/**
 * Passenger acknowledges ticket receipt.
 */
export function useAcknowledgeTicket(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (passengerId: string) =>
      apiPost<FlightApplicationDetail>(
        `${FLIGHT_PATH}/${id}/passengers/${passengerId}/acknowledge`,
      ),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: flightKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: approvalKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: approvalKeys.all });
      void queryClient.setQueryData(flightKeys.detail(id), updated);
    },
  });
}
