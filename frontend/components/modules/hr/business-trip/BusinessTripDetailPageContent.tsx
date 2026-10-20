'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useMemo, useState } from 'react';
import { Alert, Button, Grid, Skeleton, Space } from 'antd';
import {
  DownloadOutlined,
  FilePdfOutlined,
  StopOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import BusinessTripCurrentStepBanner from '@/components/modules/hr/business-trip/BusinessTripCurrentStepBanner';
import BusinessTripHostMetaItems from '@/components/modules/hr/business-trip/BusinessTripHostMetaItems';
import { hasBusinessTripHostDetails } from '@/lib/utils/business-trip-host-display';
import BusinessTripTicketAssignmentPanel from '@/components/modules/hr/business-trip/BusinessTripTicketAssignmentPanel';
import HrImportModal from '@/components/modules/hr/HrImportModal';
import {
  TravelBudgetBreakdown,
  TravelPassengerList,
  TravelRouteHero,
  TravelTextBlock,
  type PassengerTicketState,
} from '@/components/modules/hr/shared/TravelDetailParts';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useCanManageBusinessTrip,
  useCanViewHr,
} from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { ApiRequestError } from '@/lib/api/errors';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import type { BusinessTripPassenger } from '@/lib/api/business-trip.types';
import {
  downloadBusinessTripPassengersImportTemplate,
  useBusinessTrip,
  useBusinessTripPassengersImport,
  useBusinessTripPassengersImportPreview,
  useCancelBusinessTrip,
} from '@/lib/query/business-trip';
import { useCurrentUser } from '@/lib/query/profile';
import { useAuthStore } from '@/stores/auth.store';
import {
  businessTripStatusVariant,
  formatBusinessTripStatus,
  formatBusinessTripSubmitterName,
  formatEtb,
  formatTripType,
  formatVisaStatus,
  tripTypeVariant,
} from '@/lib/utils/business-trip-display';
import { exportBusinessTripDetailPassengersExcel } from '@/lib/utils/business-trip-export-excel';
import { exportBusinessTripPdf } from '@/lib/utils/business-trip-pdf';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatUserName } from '@/lib/utils/user-display';

import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';
function DetailSection({
  title,
  children,
  className = '',
  bodyClassName = '',
  action,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  action?: React.ReactNode;
}): React.ReactNode {
  return (
    <div className={`erp-employee-section ${className}`.trim()}>
      <div className="erp-employee-section-header flex flex-wrap items-center justify-between gap-2">
        <h3 className="erp-employee-section-title m-0">{title}</h3>
        {action}
      </div>
      <div className={`erp-employee-section-body ${bodyClassName}`.trim()}>
        {children}
      </div>
    </div>
  );
}

function passengerTicketState(
  row: BusinessTripPassenger,
  combinedTicketDocumentId?: string | null,
): PassengerTicketState {
  if (row.ticketDocumentId || (row.tickets?.length ?? 0) > 0) {
    return 'own';
  }
  return combinedTicketDocumentId ? 'combined' : 'none';
}

/**
 * Business trip detail - Users / employee profile chrome.
 */
export default function BusinessTripDetailPageContent({
  tripId,
}: {
  tripId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isNarrow = screens.sm === false;
  const currentUser = useCurrentUser();
  const canManage = useCanManageBusinessTrip();
  const canViewHr = useCanViewHr();

  const detailQuery = useBusinessTrip(tripId);
  const cancelMutation = useCancelBusinessTrip(tripId);
  const importPreview = useBusinessTripPassengersImportPreview(tripId);
  const importCommit = useBusinessTripPassengersImport(tripId);
  const authUser = useAuthStore((state) => state.user);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useSetHeaderExtra(null);

  const trip = detailQuery.data;

  const tiers = useMemo(
    () => (trip?.approvalRequest?.tiers ?? []) as ApprovalTier[],
    [trip?.approvalRequest?.tiers],
  );

  const canCancel =
    Boolean(trip) &&
    Boolean(currentUser.data?.id) &&
    trip?.submittedBy === currentUser.data?.id &&
    (trip?.status === 'DRAFT' || trip?.status === 'SUBMITTED');

  const canEditPassengers =
    trip?.status === 'DRAFT' &&
    Boolean(currentUser.data?.id) &&
    (trip.submittedBy === currentUser.data?.id || canViewHr);

  const showTicketPanel =
    trip?.status === 'APPROVED' ||
    Boolean(trip?.combinedTicketDocumentId) ||
    (trip?.passengers.some((p) => p.ticketDocumentId) ?? false);

  async function handleExportPassengers(): Promise<void> {
    if (!trip) {
      return;
    }
    setExporting(true);
    try {
      await exportBusinessTripDetailPassengersExcel({
        companyName: authUser?.companyName ?? 'Company',
        sheetName: t('pages.hr.businessTrip.exportTripPassengersSheetName'),
        trip,
      });
      messageApi.success(t('pages.hr.businessTrip.exportPassengersSuccess'));
    } catch {
      messageApi.error(t('pages.hr.businessTrip.exportError'));
    } finally {
      setExporting(false);
    }
  }

  function handleExportPdf(): void {
    if (!trip) {
      return;
    }
    setExportingPdf(true);
    try {
      const preparedBy = currentUser.data
        ? formatUserName(currentUser.data)
        : authUser
          ? formatUserName(authUser)
          : '-';
      exportBusinessTripPdf({
        trip,
        companyName: authUser?.companyName ?? 'Company',
        preparedBy,
        t,
        labels: {
          title: t('pages.hr.businessTrip.detail'),
          generatedAt: t('hr.table.createdDate'),
          preparedBy: t('hr.labels.createdBy'),
          footer: t('pages.hr.businessTrip.pdfFooter'),
          tripOverview: t('pages.hr.businessTrip.pdfOverview'),
          travelDetails: t('hr.labels.travelDetails'),
          purposeHost: t('hr.labels.purposeHost'),
          budgetEstimate: t('hr.labels.budgetEstimate'),
          stayAllowances: t('hr.labels.stayAllowances'),
          passengers: t('hr.section.passengerDetails'),
          documents: t('hr.section.attachments'),
          field: t('pages.hr.businessTrip.pdfField'),
          value: t('pages.hr.businessTrip.pdfValue'),
          tripNumber: t('hr.table.tripNumber'),
          status: t('hr.table.status'),
          submittedBy: t('hr.table.submittedBy'),
          tripType: t('hr.labels.tripType'),
          international: t('hr.labels.international'),
          origin: t('hr.form.origin'),
          destination: t('hr.form.destination'),
          departure: t('hr.labels.departure'),
          return: t('hr.labels.return'),
          purpose: t('hr.labels.purpose'),
          hostOrganization: t('hr.form.hostOrganizationName'),
          hostContactName: t('hr.form.hostContactName'),
          hostContactPhone: t('hr.form.hostContactPhone'),
          hostContactEmail: t('hr.form.hostContactEmail'),
          expectedOutcomes: t('hr.labels.expectedOutcomes'),
          itinerary: t('hr.labels.itinerary'),
          notes: t('hr.labels.notes'),
          estimatedAccommodation: t('hr.labels.estimatedAccommodation'),
          estimatedPerDiem: t('hr.labels.estimatedPerDiem'),
          estimatedOther: t('hr.labels.estimatedOther'),
          estimatedTotal: t('hr.labels.estimatedTotal'),
          passengerName: t('hr.table.employee'),
          passengerEmail: t('users.form.email'),
          passport: t('hr.labels.passport'),
          visaRequired: t('hr.form.visaRequired'),
          visaStatus: t('hr.form.visaStatus'),
          none: t('pages.hr.businessTrip.pdfNone'),
          page: t('pages.hr.businessTrip.pdfPage'),
          of: t('pages.hr.businessTrip.pdfOf'),
        },
      });
      messageApi.success(t('pages.hr.businessTrip.exportPdfSuccess'));
    } catch {
      messageApi.error(t('pages.hr.businessTrip.exportPdfError'));
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success(t('hr.messages.businessTripCancelled'));
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToCancelBusinessTrip'),
        messageApi,
      );
    }
  }

  if (detailQuery.isLoading) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page erp-business-trip-detail-page ${DETAIL_PAGE_V2}`}>
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !trip) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page ${DETAIL_PAGE_V2}`}>
        <Alert
          type="error"
          showIcon
          title={
            detailQuery.error instanceof ApiRequestError
              ? detailQuery.error.message
              : t('hr.messages.businessTripNotFound')
          }
          action={
            <Button onClick={() => router.push('/hr/business-trips')}>
              {t('hr.buttons.backToList')}
            </Button>
          }
        />
      </div>
    );
  }

  const submitterName = formatBusinessTripSubmitterName(trip.submitter);
  const tripTypeLabel = formatTripType(trip.tripType, t);

  const budgetRows = [
    {
      label: t('hr.labels.estimatedAccommodation'),
      value: trip.estimatedAccommodationCost,
    },
    { label: t('hr.labels.estimatedPerDiem'), value: trip.estimatedPerDiem },
    { label: t('hr.labels.estimatedOther'), value: trip.estimatedOtherCost },
  ];

  const hasPurposeContent =
    Boolean(trip.purpose) ||
    hasBusinessTripHostDetails(trip) ||
    Boolean(trip.expectedOutcomes) ||
    Boolean(trip.itinerary);

  return (
    <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page erp-business-trip-detail-page ${DETAIL_PAGE_V2}`}>
      {importOpen ? (
        <HrImportModal
          entity="businessTripPassengers"
          onClose={() => setImportOpen(false)}
          onImported={(summary) => {
            messageApi.success(summary);
            void detailQuery.refetch();
          }}
          downloadTemplate={() =>
            downloadBusinessTripPassengersImportTemplate(tripId)
          }
          previewMutation={importPreview}
          commitMutation={importCommit}
        />
      ) : null}

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-employee-toolbar">
          <div className="erp-employee-toolbar-back flex min-w-0 items-center gap-2">
            <Button
              type="text"
              icon={<ArrowLeft size={16} />}
              onClick={() => router.push('/hr/business-trips')}
              aria-label={t('hr.buttons.backToList')}
            >
              {isNarrow ? undefined : t('hr.buttons.back')}
            </Button>
          </div>
          <div className="erp-employee-toolbar-actions flex flex-wrap items-center justify-end gap-2">
            <Button
              icon={<FilePdfOutlined />}
              loading={exportingPdf}
              onClick={handleExportPdf}
              aria-label={t('pages.hr.businessTrip.exportPdf')}
            >
              {isNarrow ? undefined : t('pages.hr.businessTrip.exportPdf')}
            </Button>
            {trip.approvalRequestId ? (
              <Button
                onClick={() =>
                  router.push(`/approvals/${trip.approvalRequestId}`)
                }
                aria-label={t('hr.buttons.viewInApprovals')}
              >
                {isNarrow
                  ? t('nav.approvals')
                  : t('hr.buttons.viewInApprovals')}
              </Button>
            ) : null}
            {canCancel ? (
              <Space.Compact>
                <Button
                  danger
                  icon={<StopOutlined />}
                  onClick={() => setConfirmCancel(true)}
                  aria-label={t('hr.buttons.cancel')}
                >
                  {isNarrow ? undefined : t('hr.buttons.cancel')}
                </Button>
              </Space.Compact>
            ) : null}
          </div>
        </div>

        <TravelRouteHero
          referenceNumber={trip.tripNumber}
          statusLabel={formatBusinessTripStatus(trip.status, t)}
          statusVariant={businessTripStatusVariant(trip.status)}
          tripTypeLabel={tripTypeLabel}
          tripTypeVariant={tripTypeVariant(trip.tripType)}
          isInternational
          requesterName={submitterName}
          origin={{ city: trip.originCity, country: trip.originCountry }}
          destination={{
            city: trip.destinationCity,
            country: trip.destinationCountry,
          }}
          departureDate={trip.departureDate}
          returnDate={trip.returnDate}
          passengerCount={trip.passengerCount}
          extraFact={{
            label: t('hr.labels.estimatedTotal'),
            value: formatEtb(trip.estimatedTotalCost),
          }}
        />

        <div className="border-t border-[#eef1f4]">
          <BusinessTripCurrentStepBanner trip={trip} embedded />
        </div>
      </div>

      {trip.status === 'APPROVED' &&
      (canViewHr || canManage) &&
      trip.needsTicketAttachment ? (
        <Alert
          type="info"
          showIcon
          title={t('hr.labels.ticketsRequired')}
          description={t('hr.labels.ticketsRequiredDesc')}
        />
      ) : null}

      <div className="grid grid-cols-1 items-start gap-3 sm:gap-4 lg:grid-cols-[1fr_300px]">
        <div className="erp-pro-card min-w-0 overflow-hidden">
          <div className="erp-employee-tab-panel erp-contract-detail-body">
            {hasPurposeContent ? (
              <DetailSection title={t('hr.labels.purposeHost')}>
                <div className="flex flex-col gap-4">
                  <BusinessTripHostMetaItems trip={trip} />
                  <TravelTextBlock
                    label={t('hr.labels.purpose')}
                    text={trip.purpose}
                  />
                  <TravelTextBlock
                    label={t('hr.labels.expectedOutcomes')}
                    text={trip.expectedOutcomes}
                  />
                  <TravelTextBlock
                    label={t('hr.labels.itinerary')}
                    text={trip.itinerary}
                  />
                </div>
              </DetailSection>
            ) : null}

            {trip.notes ? (
              <DetailSection title={t('hr.travel.requirements')}>
                <TravelTextBlock
                  label={t('hr.labels.notes')}
                  text={trip.notes}
                />
              </DetailSection>
            ) : null}

            <DetailSection
              title={t('hr.section.passengerDetails')}
              bodyClassName="!p-0"
              action={
                <Space size={6} wrap>
                  <Button
                    size="small"
                    icon={<DownloadOutlined />}
                    loading={exporting}
                    onClick={() => void handleExportPassengers()}
                  >
                    {t('pages.hr.businessTrip.exportPassengers')}
                  </Button>
                  {canEditPassengers ? (
                    <Button
                      size="small"
                      icon={<UploadOutlined />}
                      onClick={() => setImportOpen(true)}
                    >
                      {t('common.importFromExcel')}
                    </Button>
                  ) : null}
                </Space>
              }
            >
              <TravelPassengerList
                passengers={trip.passengers.map((row) => ({
                  id: row.id,
                  name: row.employee
                    ? formatUserName(row.employee)
                    : row.employeeId,
                  email: row.employee?.email,
                  passportNumber: row.passportNumber,
                  visaRequired: row.visaRequired,
                  visaStatus: row.visaStatus,
                  visaStatusLabel: row.visaStatus
                    ? formatVisaStatus(row.visaStatus, t)
                    : null,
                  ticket: passengerTicketState(
                    row,
                    trip.combinedTicketDocumentId,
                  ),
                }))}
              />
            </DetailSection>

            {showTicketPanel ? (
              <BusinessTripTicketAssignmentPanel trip={trip} />
            ) : null}

            <DetailSection title={t('hr.section.supportingDocuments')}>
              {trip.documents.length > 0 ? (
                <AttachmentDownloadList documents={trip.documents} />
              ) : (
                <p className="erp-users-cell-sub m-0">
                  {t('hr.empty.noAttachments')}
                </p>
              )}
            </DetailSection>
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-3 sm:gap-4 lg:sticky lg:top-4">
          <div className="erp-pro-card overflow-hidden">
            <DetailSection
              title={t('hr.labels.budgetEstimate')}
              bodyClassName="!p-0"
            >
              <TravelBudgetBreakdown
                rows={budgetRows}
                totalLabel={t('hr.labels.estimatedTotal')}
                total={trip.estimatedTotalCost}
                formatAmount={formatEtb}
              />
            </DetailSection>
          </div>

          {trip.approvalRequest ? (
            <ApprovalTierTimeline
              tiers={tiers}
              currentTier={trip.approvalRequest.currentTier ?? 0}
            />
          ) : (
            <div className="erp-pro-card">
              <DetailSection title={t('hr.section.approvalChain')}>
                <p className="erp-users-cell-sub m-0">
                  {t('hr.empty.noApprovalChain')}
                </p>
              </DetailSection>
            </div>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        className="erp-hr-travel-modal"
        title={t('hr.dialog.cancelBusinessTripTitle')}
        description={t('hr.dialog.cancelBusinessTripDesc')}
        confirmLabel={t('hr.labels.cancelTripConfirm')}
        danger
        confirmLoading={cancelMutation.isPending}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => void handleCancel()}
      />
    </div>
  );
}
