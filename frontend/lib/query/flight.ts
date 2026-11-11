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
  FlightApplicationDetail,
  FlightApplicationListItem,
  FlightSelectablePassenger,
  ListFlightApplicationsParams,
  SubmitFlightApplicationPayload,
  UpdateFlightApplicationPayload,
} from '@/lib/api/flight.types';
import { invalidateAfterRequestEdit } from '@/lib/query/request-edit';
import type {
  HrImportCommitResult,
  HrImportPreviewResult,
  PaginationMeta,
} from '@/lib/api/types';
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

const FETCH_PAGE_SIZE = 100;

/**
 * Loads every page for the flight applications list endpoint (filter locally).
 */
async function fetchAllFlightApplicationPages(): Promise<
  FlightApplicationListItem[]
> {
  const first = await apiGetPaginated<FlightApplicationListItem>(
    `${FLIGHT_PATH}${buildListQuery({ page: 1, limit: FETCH_PAGE_SIZE })}`,
  );
  const all = [...first.data];
  const pages = first.meta.pages;
  if (pages <= 1) {
    return all;
  }

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      apiGetPaginated<FlightApplicationListItem>(
        `${FLIGHT_PATH}${buildListQuery({
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
 * All flight applications (all pages) for client-side filter/search.
 */
export function useFlightApplicationsAll(enabled = true) {
  return useQuery({
    queryKey: [...flightKeys.lists(), 'all'] as const,
    queryFn: () => fetchAllFlightApplicationPages(),
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
      formData.append('originCountry', payload.originCountry);
      formData.append('originCity', payload.originCity);
      formData.append('destination', payload.destination);
      formData.append('departureDate', payload.departureDate);
      if (payload.returnDate) {
        formData.append('returnDate', payload.returnDate);
      }
      formData.append('purpose', payload.purpose);
      formData.append('ticketClass', payload.ticketClass);
      if (payload.notes) {
        formData.append('notes', payload.notes);
      }
      if (payload.linkedBusinessTripId) {
        formData.append('linkedBusinessTripId', payload.linkedBusinessTripId);
      }
      if (payload.siteAssignmentId) {
        formData.append('siteAssignmentId', payload.siteAssignmentId);
      }
      formData.append('passengers', JSON.stringify(payload.passengers));
      appendOnBehalfFields(formData, payload);
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
 * Employee edit of a DRAFT / RETURNED application (RETURNED is resubmitted).
 */
export function useUpdateFlightApplication(id: string) {
  const queryClient = useQueryClient();
  const detailKey = flightKeys.detail(id);
  return useMutation({
    mutationFn: (payload: UpdateFlightApplicationPayload) =>
      apiPatch<FlightApplicationDetail>(`${FLIGHT_PATH}/${id}`, payload),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: flightKeys.lists() });
      queryClient.setQueryData(detailKey, updated);
      invalidateAfterRequestEdit(queryClient);
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
    mutationFn: (files: File[]) => {
      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file);
      }
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
      files,
    }: {
      passengerId: string;
      files: File[];
    }) => {
      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file);
      }
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

/**
 * HR removes the combined ticket.
 */
export function useRemoveFlightCombinedTicket(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiDelete<FlightApplicationDetail>(
        `${FLIGHT_PATH}/${id}/tickets/combined`,
      ),
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
 * HR removes an individual passenger ticket.
 */
export function useRemoveFlightPassengerTicket(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (passengerId: string) =>
      apiDelete<FlightApplicationDetail>(
        `${FLIGHT_PATH}/${id}/passengers/${passengerId}/ticket`,
      ),
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
 * Loads flight application details in batches (for list passenger export).
 */
export async function fetchFlightApplicationDetails(
  applicationIds: string[],
): Promise<FlightApplicationDetail[]> {
  const results: FlightApplicationDetail[] = [];
  const batchSize = 8;
  for (let index = 0; index < applicationIds.length; index += batchSize) {
    const batch = applicationIds.slice(index, index + batchSize);
    const pages = await Promise.all(
      batch.map((id) =>
        apiGet<FlightApplicationDetail>(`${FLIGHT_PATH}/${id}`),
      ),
    );
    results.push(...pages);
  }
  return results;
}

/**
 * Preview company-wide flight application Excel import.
 */
export function useFlightApplicationImportPreview() {
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportPreviewResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportPreviewResult>(
        `${FLIGHT_PATH}/import/preview`,
        formData,
      );
    },
  });
}

/**
 * Commit company-wide flight application Excel import.
 */
export function useFlightApplicationImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportCommitResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportCommitResult>(
        `${FLIGHT_PATH}/import`,
        formData,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: flightKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: flightKeys.details() });
    },
  });
}

/**
 * Downloads the company-wide flight application import template.
 */
export async function downloadFlightApplicationImportTemplate(): Promise<void> {
  await downloadApiFile(
    `${FLIGHT_PATH}/import/template`,
    'flight-application-import-template.xlsx',
  );
}

/**
 * Preview application-scoped passenger Excel import.
 */
export function useFlightPassengersImportPreview(applicationId: string) {
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportPreviewResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportPreviewResult>(
        `${FLIGHT_PATH}/${applicationId}/passengers/import/preview`,
        formData,
      );
    },
  });
}

/**
 * Commit application-scoped passenger Excel import.
 */
export function useFlightPassengersImport(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportCommitResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportCommitResult>(
        `${FLIGHT_PATH}/${applicationId}/passengers/import`,
        formData,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: flightKeys.lists() });
      void queryClient.invalidateQueries({
        queryKey: flightKeys.detail(applicationId),
      });
    },
  });
}

/**
 * Downloads the application-scoped passengers import template.
 */
export async function downloadFlightPassengersImportTemplate(
  applicationId: string,
): Promise<void> {
  await downloadApiFile(
    `${FLIGHT_PATH}/${applicationId}/passengers/import/template`,
    'flight-passengers-import-template.xlsx',
  );
}

export async function openFlightApplicationPdf(id: string): Promise<void> {
  const response = await apiClient.get(`${FLIGHT_PATH}/${id}/pdf`, { responseType: 'blob' });
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
