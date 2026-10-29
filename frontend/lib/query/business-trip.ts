'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  apiClient,
  apiDelete,
  apiGet,
  apiGetPaginated,
  apiPatch,
  apiPost,
  apiPostForm,
  downloadApiFile,
} from '@/lib/api/client';
import { appendOnBehalfFields } from '@/lib/api/on-behalf.types';
import type {
  BusinessTripDetail,
  BusinessTripListItem,
  BusinessTripSelectablePassenger,
  ListBusinessTripsParams,
  SubmitBusinessTripPayload,
  UpdateBusinessTripPayload,
} from '@/lib/api/business-trip.types';
import { invalidateAfterRequestEdit } from '@/lib/query/request-edit';
import type {
  HrImportCommitResult,
  HrImportPreviewResult,
  PaginationMeta,
} from '@/lib/api/types';
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

const FETCH_PAGE_SIZE = 100;

/**
 * Loads every page for the business trips list endpoint (filter locally).
 */
async function fetchAllBusinessTripPages(): Promise<BusinessTripListItem[]> {
  const first = await apiGetPaginated<BusinessTripListItem>(
    `${BUSINESS_TRIP_PATH}${buildListQuery({ page: 1, limit: FETCH_PAGE_SIZE })}`,
  );
  const all = [...first.data];
  const pages = first.meta.pages;
  if (pages <= 1) {
    return all;
  }

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      apiGetPaginated<BusinessTripListItem>(
        `${BUSINESS_TRIP_PATH}${buildListQuery({
          page: index + 2,
          limit: FETCH_PAGE_SIZE,
        })}`,
      ),
    ),
  );

  for (const page of rest) {
    all.push(...page.data);
  }
  return all;
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
 * All business trips (all pages) for client-side filter/search.
 */
export function useBusinessTripsAll(enabled = true) {
  return useQuery({
    queryKey: [...businessTripKeys.lists(), 'all'] as const,
    queryFn: () => fetchAllBusinessTripPages(),
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
      if (payload.hostContactName) {
        formData.append('hostContactName', payload.hostContactName);
      }
      if (payload.hostContactPhone) {
        formData.append('hostContactPhone', payload.hostContactPhone);
      }
      if (payload.hostContactEmail) {
        formData.append('hostContactEmail', payload.hostContactEmail);
      }
      if (payload.expectedOutcomes) {
        formData.append('expectedOutcomes', payload.expectedOutcomes);
      }
      if (payload.itinerary) {
        formData.append('itinerary', payload.itinerary);
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
      if (payload.notes) {
        formData.append('notes', payload.notes);
      }
      formData.append('passengers', JSON.stringify(payload.passengers));
      appendOnBehalfFields(formData, payload);
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
 * Employee edit of a DRAFT / RETURNED trip (RETURNED is resubmitted).
 */
export function useUpdateBusinessTrip(id: string) {
  const queryClient = useQueryClient();
  const detailKey = businessTripKeys.detail(id);
  return useMutation({
    mutationFn: (payload: UpdateBusinessTripPayload) =>
      apiPatch<BusinessTripDetail>(`${BUSINESS_TRIP_PATH}/${id}`, payload),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: businessTripKeys.lists() });
      queryClient.setQueryData(detailKey, updated);
      invalidateAfterRequestEdit(queryClient);
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
    mutationFn: (files: File[]) => {
      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file);
      }
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
      files,
    }: {
      passengerId: string;
      files: File[];
    }) => {
      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file);
      }
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

/**
 * HR removes the combined ticket.
 */
export function useRemoveBusinessTripCombinedTicket(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiDelete<BusinessTripDetail>(
        `${BUSINESS_TRIP_PATH}/${id}/tickets/combined`,
      ),
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
 * HR removes an individual passenger ticket.
 */
export function useRemoveBusinessTripPassengerTicket(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (passengerId: string) =>
      apiDelete<BusinessTripDetail>(
        `${BUSINESS_TRIP_PATH}/${id}/passengers/${passengerId}/ticket`,
      ),
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
 * Loads business trip details in batches (for list passenger export).
 */
export async function fetchBusinessTripDetails(
  tripIds: string[],
): Promise<BusinessTripDetail[]> {
  const results: BusinessTripDetail[] = [];
  const batchSize = 8;
  for (let index = 0; index < tripIds.length; index += batchSize) {
    const batch = tripIds.slice(index, index + batchSize);
    const pages = await Promise.all(
      batch.map((id) =>
        apiGet<BusinessTripDetail>(`${BUSINESS_TRIP_PATH}/${id}`),
      ),
    );
    results.push(...pages);
  }
  return results;
}

/**
 * Preview company-wide business trip Excel import.
 */
export function useBusinessTripImportPreview() {
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportPreviewResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportPreviewResult>(
        `${BUSINESS_TRIP_PATH}/import/preview`,
        formData,
      );
    },
  });
}

/**
 * Commit company-wide business trip Excel import.
 */
export function useBusinessTripImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportCommitResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportCommitResult>(
        `${BUSINESS_TRIP_PATH}/import`,
        formData,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: businessTripKeys.lists() });
      void queryClient.invalidateQueries({
        queryKey: businessTripKeys.details(),
      });
    },
  });
}

/**
 * Downloads the company-wide business trip import template.
 */
export async function downloadBusinessTripImportTemplate(): Promise<void> {
  await downloadApiFile(
    `${BUSINESS_TRIP_PATH}/import/template`,
    'business-trip-import-template.xlsx',
  );
}

/**
 * Preview trip-scoped passenger Excel import.
 */
export function useBusinessTripPassengersImportPreview(tripId: string) {
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportPreviewResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportPreviewResult>(
        `${BUSINESS_TRIP_PATH}/${tripId}/passengers/import/preview`,
        formData,
      );
    },
  });
}

/**
 * Commit trip-scoped passenger Excel import.
 */
export function useBusinessTripPassengersImport(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportCommitResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportCommitResult>(
        `${BUSINESS_TRIP_PATH}/${tripId}/passengers/import`,
        formData,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: businessTripKeys.lists() });
      void queryClient.invalidateQueries({
        queryKey: businessTripKeys.detail(tripId),
      });
    },
  });
}

/**
 * Downloads the trip-scoped passengers import template.
 */
export async function downloadBusinessTripPassengersImportTemplate(
  tripId: string,
): Promise<void> {
  await downloadApiFile(
    `${BUSINESS_TRIP_PATH}/${tripId}/passengers/import/template`,
    'business-trip-passengers-import-template.xlsx',
  );
}

export async function openBusinessTripPdf(id: string): Promise<void> {
  const response = await apiClient.get(`${BUSINESS_TRIP_PATH}/${id}/pdf`, { responseType: 'blob' });
  const contentType = response.headers['content-type'];
  const blob = new Blob([response.data as BlobPart], {
    type: typeof contentType === 'string' && contentType.includes('pdf') ? contentType : 'application/pdf',
  });
  const objectUrl = URL.createObjectURL(blob);
  const opened = window.open(objectUrl, '_blank', 'noopener,noreferrer');
  if (!opened) {
    const anchor = document.createElement('a');
    anchor.href = objectUrl; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
