'use client';

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
import FlightCurrentStepBanner from '@/components/modules/hr/flight/FlightCurrentStepBanner';
import FlightTicketAssignmentPanel from '@/components/modules/hr/flight/FlightTicketAssignmentPanel';
import HrImportModal from '@/components/modules/hr/HrImportModal';
import {
  TravelPassengerList,
  TravelRequirements,
  TravelRouteHero,
  TravelTextBlock,
  type PassengerTicketState,
} from '@/components/modules/hr/shared/TravelDetailParts';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useCanManageFlight,
  useCanViewHr,
} from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { ApiRequestError } from '@/lib/api/errors';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import type { FlightPassenger } from '@/lib/api/flight.types';
import {
  downloadFlightPassengersImportTemplate,
  useCancelFlightApplication,
  useFlightApplication,
  useFlightPassengersImport,
  useFlightPassengersImportPreview,
} from '@/lib/query/flight';
import { useCurrentUser } from '@/lib/query/profile';
import { useAuthStore } from '@/stores/auth.store';
import {
  flightStatusVariant,
  formatFlightStatus,
  formatFlightSubmitterName,
  formatTicketClass,
  formatTripType,
  formatVisaStatus,
  tripTypeVariant,
} from '@/lib/utils/flight-display';
import { exportFlightApplicationPdf } from '@/lib/utils/flight-application-pdf';
import { exportFlightApplicationPassengersExcel } from '@/lib/utils/flight-export-excel';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatUserName } from '@/lib/utils/user-display';

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
  row: FlightPassenger,
  combinedTicketDocumentId?: string | null,
): PassengerTicketState {
  if (row.ticketDocumentId || (row.tickets?.length ?? 0) > 0) {
    return 'own';
  }
  return combinedTicketDocumentId ? 'combined' : 'none';
}

/**
 * Flight application detail — Users / employee profile chrome.
 */
export default function FlightApplicationDetailPageContent({
  applicationId,
}: {
  applicationId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isNarrow = screens.sm === false;
  const currentUser = useCurrentUser();
  const canManage = useCanManageFlight();
  const canViewHr = useCanViewHr();

  const detailQuery = useFlightApplication(applicationId);
  const cancelMutation = useCancelFlightApplication(applicationId);
  const importPreview = useFlightPassengersImportPreview(applicationId);
  const importCommit = useFlightPassengersImport(applicationId);
  const authUser = useAuthStore((state) => state.user);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useSetHeaderExtra(null);

  const application = detailQuery.data;

  const tiers = useMemo(
    () => (application?.approvalRequest?.tiers ?? []) as ApprovalTier[],
    [application?.approvalRequest?.tiers],
  );

  const canCancel =
    Boolean(application) &&
    Boolean(currentUser.data?.id) &&
    application?.submittedBy === currentUser.data?.id &&
    (application?.status === 'DRAFT' || application?.status === 'SUBMITTED');

  const canEditPassengers =
    application?.status === 'DRAFT' &&
    Boolean(currentUser.data?.id) &&
    (application.submittedBy === currentUser.data?.id || canViewHr);

  const showTicketPanel =
    application?.status === 'APPROVED' ||
    Boolean(application?.combinedTicketDocumentId) ||
    (application?.passengers.some((p) => p.ticketDocumentId) ?? false);

  async function handleExportPassengers(): Promise<void> {
    if (!application) {
      return;
    }
    setExporting(true);
    try {
      await exportFlightApplicationPassengersExcel({
        companyName: authUser?.companyName ?? 'Company',
        sheetName: t('pages.hr.flight.exportAppPassengersSheetName'),
        application,
      });
      messageApi.success(t('pages.hr.flight.exportPassengersSuccess'));
    } catch {
      messageApi.error(t('pages.hr.flight.exportError'));
    } finally {
      setExporting(false);
    }
  }

  function handleExportPdf(): void {
    if (!application) {
      return;
    }
    setExportingPdf(true);
    try {
      const preparedBy = currentUser.data
        ? formatUserName(currentUser.data)
        : authUser
          ? formatUserName(authUser)
          : '—';
      exportFlightApplicationPdf({
        application,
        companyName: authUser?.companyName ?? 'Company',
        preparedBy,
        t,
        labels: {
          title: t('pages.hr.flight.detail'),
          subtitle: t('pages.hr.flight.listTitle'),
          generatedAt: t('hr.table.createdDate'),
          preparedBy: t('hr.labels.createdBy'),
          footer: t('pages.hr.flight.pdfFooter'),
          applicationOverview: t('pages.hr.flight.pdfOverview'),
          travelDetails: t('hr.labels.travelDetails'),
          stayAllowances: t('hr.labels.stayAllowances'),
          passengers: t('hr.section.passengerDetails'),
          documents: t('hr.section.attachments'),
          field: t('pages.hr.flight.pdfField'),
          value: t('pages.hr.flight.pdfValue'),
          applicationNumber: t('hr.table.applicationNumber'),
          status: t('hr.table.status'),
          submittedBy: t('hr.table.submittedBy'),
          tripType: t('hr.labels.tripType'),
          international: t('hr.labels.international'),
          domestic: t('hr.labels.domestic'),
          origin: t('hr.form.origin'),
          destination: t('hr.form.destination'),
          departure: t('hr.labels.departure'),
          return: t('hr.labels.return'),
          ticketClass: t('hr.labels.ticketClass'),
          purpose: t('hr.labels.purpose'),
          notes: t('hr.labels.notes'),
          accommodation: t('hr.labels.accommodation'),
          accommodationDetails: t('hr.form.accommodationDetails'),
          perDiem: t('hr.labels.perDiem'),
          required: t('hr.labels.required'),
          notRequired: t('hr.labels.notRequired'),
          passengerName: t('hr.table.employee'),
          passengerEmail: t('users.form.email'),
          passport: t('hr.labels.passport'),
          visaRequired: t('hr.form.visaRequired'),
          visaStatus: t('hr.form.visaStatus'),
          none: t('pages.hr.flight.pdfNone'),
          page: t('pages.hr.flight.pdfPage'),
          of: t('pages.hr.flight.pdfOf'),
        },
      });
      messageApi.success(t('pages.hr.flight.exportPdfSuccess'));
    } catch {
      messageApi.error(t('pages.hr.flight.exportPdfError'));
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success(t('hr.messages.flightApplicationCancelled'));
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToCancelFlightApplication'),
        messageApi,
      );
    }
  }

  if (detailQuery.isLoading) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page erp-flight-detail-page">
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !application) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page">
        <Alert
          type="error"
          showIcon
          title={
            detailQuery.error instanceof ApiRequestError
              ? detailQuery.error.message
              : t('hr.messages.flightApplicationNotFound')
          }
          action={
            <Button onClick={() => router.push('/hr/flight-applications')}>
              {t('hr.buttons.backToList')}
            </Button>
          }
        />
      </div>
    );
  }

  const submitterName = formatFlightSubmitterName(application.submitter);
  const tripTypeLabel = formatTripType(application.tripType, t);

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-detail-page erp-flight-detail-page">
      {importOpen ? (
        <HrImportModal
          entity="flightPassengers"
          onClose={() => setImportOpen(false)}
          onImported={(summary) => {
            messageApi.success(summary);
            void detailQuery.refetch();
          }}
          downloadTemplate={() =>
            downloadFlightPassengersImportTemplate(applicationId)
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
              onClick={() => router.push('/hr/flight-applications')}
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
              aria-label={t('pages.hr.flight.exportPdf')}
            >
              {isNarrow ? undefined : t('pages.hr.flight.exportPdf')}
            </Button>
            {application.approvalRequestId ? (
              <Button
                onClick={() =>
                  router.push(`/approvals/${application.approvalRequestId}`)
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
          referenceNumber={application.applicationNumber}
          statusLabel={formatFlightStatus(application.status, t)}
          statusVariant={flightStatusVariant(application.status)}
          tripTypeLabel={tripTypeLabel}
          tripTypeVariant={tripTypeVariant(application.tripType)}
          isInternational={application.isInternational}
          requesterName={submitterName}
          origin={{
            city: application.originCity,
            country: application.originCountry,
          }}
          destination={{ country: application.destination }}
          departureDate={application.departureDate}
          returnDate={application.returnDate}
          ticketClassLabel={formatTicketClass(application.ticketClass, t)}
          passengerCount={application.passengerCount}
        />

        <div className="border-t border-[#eef1f4]">
          <FlightCurrentStepBanner application={application} embedded />
        </div>
      </div>

      {application.status === 'APPROVED' &&
      (canViewHr || canManage) &&
      application.needsTicketAttachment ? (
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
            <DetailSection title={t('hr.travel.requirements')}>
              <TravelRequirements
                accommodationRequired={application.accommodationRequired}
                accommodationDetails={application.accommodationDetails}
                perDiemRequired={application.perDiemRequired}
              >
                <TravelTextBlock
                  label={t('hr.labels.purpose')}
                  text={application.purpose}
                />
                <TravelTextBlock
                  label={t('hr.labels.notes')}
                  text={application.notes}
                />
              </TravelRequirements>
            </DetailSection>

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
                    {t('pages.hr.flight.exportPassengers')}
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
                passengers={application.passengers.map((row) => ({
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
                    application.combinedTicketDocumentId,
                  ),
                }))}
              />
            </DetailSection>

            {showTicketPanel ? (
              <FlightTicketAssignmentPanel application={application} />
            ) : null}

            <DetailSection title={t('hr.section.supportingDocuments')}>
              {application.documents.length > 0 ? (
                <AttachmentDownloadList documents={application.documents} />
              ) : (
                <p className="erp-users-cell-sub m-0">
                  {t('hr.empty.noAttachments')}
                </p>
              )}
            </DetailSection>
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-3 sm:gap-4 lg:sticky lg:top-4">
          {application.approvalRequest ? (
            <ApprovalTierTimeline
              tiers={tiers}
              currentTier={application.approvalRequest.currentTier ?? 0}
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
        title={t('hr.dialog.cancelFlightApplicationTitle')}
        description={t('hr.dialog.cancelFlightApplicationDesc')}
        confirmLabel={t('hr.buttons.cancel')}
        danger
        confirmLoading={cancelMutation.isPending}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => void handleCancel()}
      />
    </div>
  );
}
