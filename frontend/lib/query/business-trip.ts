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
  BusinessTripDetail,
  BusinessTripListItem,
  BusinessTripSelectablePassenger,
  ListBusinessTripsParams,
  SubmitBusinessTripPayload,
} from '@/lib/api/business-trip.types';
import type { PaginationMeta } from '@/lib/api/types';
import { approvalKeys } from '@/lib/query/approvals';
import { toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const BUSINESS_TRIP_PATH = '/hr/business-trips';

export const businessTripKeys = {
  all: ['business-trip'] as const,
  lists: () => [...businessTripKeys.all, 'list'] as const,
  list: (params: ListBusinessTripsParams) =>
    [...businessTripKeys.lists(), params] as const,
  details: () => [...businessTripKeys.all, 'detail'] as const,
  detail: (id: string) => [...businessTripKeys.details(), id] as const,
  selectable: () => [...businessTripKeys.all, 'selectable'] as const,
  needsTicketCount: () =>
    [...businessTripKeys.all, 'needs-ticket-count'] as const,
};

function buildListQuery(params: ListBusinessTripsParams): string {
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
 * Paginated business trips.
 */
export function useBusinessTrips(
  params: ListBusinessTripsParams = { page: 1, limit: 20 },
  enabled = true,
) {
  return useQuery({
    queryKey: businessTripKeys.list(params),
    queryFn: (): Promise<PaginatedResult<BusinessTripListItem>> =>
      apiGetPaginated<BusinessTripListItem>(
        `${BUSINESS_TRIP_PATH}${buildListQuery(params)}`,
      ),
    enabled,
    retry: false,
  });
}

/**
 * Count of APPROVED trips still needing ticket attachment (HR list badge).
 */
export function useBusinessTripNeedsTicketCount(enabled = true) {
  return useQuery({
    queryKey: businessTripKeys.needsTicketCount(),
    queryFn: async (): Promise<number> => {
      const result = await apiGet<{ total: number }>(
        `${BUSINESS_TRIP_PATH}/count?needsTicket=true`,
      );
      return result.total ?? 0;
    },
    enabled,
    refetchInterval: 30_000,
    retry: false,
  });
}

/**
 * Single business trip with passengers and approval tiers.
 */
export function useBusinessTrip(id: string, enabled = true) {
  return useQuery({
    queryKey: businessTripKeys.detail(id),
    queryFn: (): Promise<BusinessTripDetail> =>
      apiGet<BusinessTripDetail>(`${BUSINESS_TRIP_PATH}/${id}`),
    enabled: Boolean(id) && enabled,
    retry: false,
  });
}

/**
 * Passengers the current user may select.
 */
export function useBusinessTripSelectablePassengers(enabled = true) {
  return useQuery({
    queryKey: businessTripKeys.selectable(),
    queryFn: (): Promise<BusinessTripSelectablePassenger[]> =>
      apiGet<BusinessTripSelectablePassenger[]>(
        `${BUSINESS_TRIP_PATH}/selectable-passengers`,
      ),
    enabled,
    retry: false,
  });
}

/**
 * Submits a business trip (multipart when files attached).
 */
export function useSubmitBusinessTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmitBusinessTripPayload) => {
      const formData = new FormData();
      formData.append('tripType', payload.tripType);
      formData.append('originCountry', payload.originCountry);
      formData.append('originCity', payload.originCity);
      formData.append('destinationCountry', payload.destinationCountry);
      formData.append('destinationCity', payload.destinationCity);
      formData.append('departureDate', payload.departureDate);
      if (payload.returnDate) {
        formData.append('returnDate', payload.returnDate);
      }
      formData.append('purpose', payload.purpose);
      if (payload.hostOrganization) {
        formData.append('hostOrganization', payload.hostOrganization);
      }
      if (payload.hostContact) {
        formData.append('hostContact', payload.hostContact);
      }
      if (payload.expectedOutcomes) {
        formData.append('expectedOutcomes', payload.expectedOutcomes);
      }
      if (payload.itinerary) {
        formData.append('itinerary', payload.itinerary);
      }
      formData.append('ticketClass', payload.ticketClass);
      if (payload.estimatedFlightCost != null) {
        formData.append(
          'estimatedFlightCost',
          String(payload.estimatedFlightCost),
        );
      }
      if (payload.estimatedAccommodationCost != null) {
        formData.append(
          'estimatedAccommodationCost',
          String(payload.estimatedAccommodationCost),
        );
      }
      if (payload.estimatedPerDiem != null) {
        formData.append('estimatedPerDiem', String(payload.estimatedPerDiem));
      }
      if (payload.estimatedOtherCost != null) {
        formData.append(
          'estimatedOtherCost',
          String(payload.estimatedOtherCost),
        );
      }
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
      return apiPostForm<BusinessTripDetail>(BUSINESS_TRIP_PATH, formData);
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({
        queryKey: businessTripKeys.lists(),
      });
      void queryClient.setQueryData(
        businessTripKeys.detail(created.id),
        created,
      );
    },
  });
}

/**
 * Cancels a draft/submitted business trip.
 */
export function useCancelBusinessTrip(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPatch<BusinessTripDetail>(`${BUSINESS_TRIP_PATH}/${id}/cancel`),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: businessTripKeys.lists(),
      });
      void queryClient.setQueryData(businessTripKeys.detail(id), updated);
    },
  });
}

/**
 * HR attaches a combined ticket file.
 */
export function useAttachBusinessTripCombinedTicket(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<BusinessTripDetail>(
        `${BUSINESS_TRIP_PATH}/${id}/tickets/combined`,
        formData,
      );
    },
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: businessTripKeys.lists(),
      });
      void queryClient.invalidateQueries({
        queryKey: businessTripKeys.needsTicketCount(),
      });
      void queryClient.setQueryData(businessTripKeys.detail(id), updated);
    },
  });
}

/**
 * HR attaches an individual passenger ticket.
 */
export function useAttachBusinessTripPassengerTicket(id: string) {
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
      return apiPostForm<BusinessTripDetail>(
        `${BUSINESS_TRIP_PATH}/${id}/passengers/${passengerId}/ticket`,
        formData,
      );
    },
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: businessTripKeys.lists(),
      });
      void queryClient.invalidateQueries({
        queryKey: businessTripKeys.needsTicketCount(),
      });
      void queryClient.setQueryData(businessTripKeys.detail(id), updated);
    },
  });
}

/**
 * Passenger acknowledges ticket receipt.
 */
export function useAcknowledgeBusinessTripTicket(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (passengerId: string) =>
      apiPost<BusinessTripDetail>(
        `${BUSINESS_TRIP_PATH}/${id}/passengers/${passengerId}/acknowledge`,
      ),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: businessTripKeys.lists(),
      });
      void queryClient.invalidateQueries({ queryKey: approvalKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: approvalKeys.all });
      void queryClient.setQueryData(businessTripKeys.detail(id), updated);
    },
  });
}
