'use client';

import {
  BedDouble,
  Check,
  IdCard,
  Minus,
  Plane,
  Ticket,
  Users,
  Wallet,
} from 'lucide-react';
import { Button } from 'antd';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import StatusBadge, {
  type StatusBadgeVariant,
} from '@/components/ui/StatusBadge/StatusBadge';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { formatProjectDate } from '@/lib/utils/project-display';
import { tokens } from '@/lib/theme/tokens';

/**
 * Shared presentation for the Flight Application and Business Trip detail
 * pages: route hero, trip requirements, passenger list, budget breakdown.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Inclusive number of calendar days between two dates, or null. */
function tripLengthDays(
  departureDate: string,
  returnDate?: string | null,
): number | null {
  if (!returnDate) {
    return null;
  }
  const start = new Date(departureDate.slice(0, 10));
  const end = new Date(returnDate.slice(0, 10));
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  return Number.isFinite(days) && days > 0 ? days : null;
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || '?'
  );
}

// ============================ Route hero ============================

interface RoutePlace {
  city?: string | null;
  country: string;
}

/** City when known, else the country. */
function placeName(place: RoutePlace): string {
  return place.city || place.country;
}

/** One fact tile - same markup as the employee detail fact strip. */
function RouteFact({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="erp-users-stat">
      <div className="min-w-0">
        <p className="erp-users-stat-label">{label}</p>
        <p className="erp-employee-meta-value">{value}</p>
      </div>
    </div>
  );
}

export interface TravelRouteHeroProps {
  /** Omit where the page header already shows number / status (approvals). */
  referenceNumber?: string;
  statusLabel?: string;
  statusVariant?: StatusBadgeVariant;
  tripTypeLabel: string;
  tripTypeVariant: StatusBadgeVariant;
  isInternational: boolean;
  requesterName: string;
  origin: RoutePlace;
  destination: RoutePlace;
  departureDate: string;
  returnDate?: string | null;
  ticketClassLabel?: string;
  passengerCount: number;
  /** Extra headline figure (e.g. estimated total cost). */
  extraFact?: { label: string; value: React.ReactNode };
}

/**
 * Travel request hero in the employee detail layout: badges, the route as
 * the title, requester and trip length, then the fact tiles. Render it inside
 * the page's identity card (`erp-profile-identity`).
 */
export function TravelRouteHero({
  referenceNumber,
  statusLabel,
  statusVariant,
  tripTypeLabel,
  tripTypeVariant,
  isInternational,
  requesterName,
  origin,
  destination,
  departureDate,
  returnDate,
  ticketClassLabel,
  passengerCount,
  extraFact,
}: TravelRouteHeroProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const days = tripLengthDays(departureDate, returnDate);
  const lengthLabel =
    days === null
      ? null
      : days === 1
        ? t('hr.travel.dayCountOne')
        : t('hr.travel.dayCount', { count: days });

  const countries = [
    origin.city ? origin.country : null,
    destination.city ? destination.country : null,
  ];
  const showCountries = countries.some(Boolean);

  return (
    <>
      <div className="erp-employee-hero erp-profile-hero">
        <div className="erp-employee-hero-copy min-w-0 flex-1">
          <div className="erp-profile-hero-badges mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            {referenceNumber ? (
              <span className="erp-users-id-chip">{referenceNumber}</span>
            ) : null}
            {statusLabel ? (
              <StatusBadge label={statusLabel} variant={statusVariant} />
            ) : null}
            <StatusBadge label={tripTypeLabel} variant={tripTypeVariant} />
            <span className="erp-users-role-tag">
              {isInternational
                ? t('hr.labels.international')
                : t('hr.labels.domestic')}
            </span>
          </div>
          <h2
            className="erp-users-name erp-employee-hero-name m-0 flex min-w-0 flex-wrap items-center justify-center gap-x-2 break-words sm:justify-start"
            aria-label={`${t('hr.form.origin')} ${placeName(origin)}, ${t('hr.form.destination')} ${placeName(destination)}`}
          >
            <span>{placeName(origin)}</span>
            <Plane
              size={18}
              strokeWidth={2}
              className="shrink-0 rotate-45 text-[#1d9e75]"
              aria-hidden
            />
            <span>{placeName(destination)}</span>
          </h2>
          {showCountries ? (
            <p className="erp-users-cell-sub m-0 mt-1">
              {countries.map((country) => country ?? '-').join(' → ')}
            </p>
          ) : null}
          <p className="erp-users-email m-0 mt-1.5 break-words sm:text-left">
            {t('hr.travel.requestedBy', { name: requesterName })}
          </p>
          {lengthLabel ? (
            <p className="erp-users-cell-sub m-0 mt-1">
              {[tripTypeLabel, lengthLabel].join(' · ')}
            </p>
          ) : null}
        </div>
      </div>

      <div className="erp-users-stat-bar erp-employee-meta-bar erp-profile-meta">
        <RouteFact
          label={t('hr.labels.departure')}
          value={formatProjectDate(departureDate)}
        />
        <RouteFact
          label={t('hr.labels.return')}
          value={returnDate ? formatProjectDate(returnDate) : '-'}
        />
        {ticketClassLabel !== undefined ? (
          <RouteFact label={t('hr.labels.ticketClass')} value={ticketClassLabel} />
        ) : null}
        <RouteFact label={t('hr.labels.passengers')} value={passengerCount} />
        {extraFact ? (
          <RouteFact label={extraFact.label} value={extraFact.value} />
        ) : null}
      </div>
    </>
  );
}

// ========================= Trip requirements ========================

function RequirementTile({
  icon,
  title,
  required,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  required: boolean;
  detail?: string | null;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  return (
    <div
      className="flex items-start gap-3 rounded-xl border p-3.5"
      style={{
        borderColor: required ? '#cdebdf' : '#e8ebef',
        background: required ? '#f5fbf8' : '#fbfcfd',
      }}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]"
        style={
          required
            ? { background: tokens.colorTeal50, color: tokens.colorTeal600 }
            : { background: '#f1f5f9', color: '#94a3b8' }
        }
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="m-0 text-sm font-semibold text-slate-800">{title}</p>
          <span
            className="inline-flex items-center gap-1 text-xs font-semibold"
            style={{ color: required ? tokens.colorTeal600 : '#94a3b8' }}
          >
            {required ? (
              <Check size={13} strokeWidth={2.5} aria-hidden />
            ) : (
              <Minus size={13} strokeWidth={2.5} aria-hidden />
            )}
            {required ? t('hr.labels.required') : t('hr.labels.notRequired')}
          </span>
        </div>
        {detail ? (
          <p className="m-0 mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-500">
            {detail}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Accommodation / per diem as status tiles, followed by free-text blocks.
 */
export function TravelRequirements({
  accommodationRequired,
  accommodationDetails,
  perDiemRequired,
  children,
}: {
  accommodationRequired: boolean;
  accommodationDetails?: string | null;
  perDiemRequired: boolean;
  /** Purpose, notes, etc. rendered under the tiles. */
  children?: React.ReactNode;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <RequirementTile
          icon={<BedDouble size={19} strokeWidth={1.75} />}
          title={t('hr.labels.accommodation')}
          required={accommodationRequired}
          detail={
            accommodationRequired
              ? accommodationDetails || t('hr.travel.accommodationHint')
              : null
          }
        />
        <RequirementTile
          icon={<Wallet size={19} strokeWidth={1.75} />}
          title={t('hr.labels.perDiem')}
          required={perDiemRequired}
          detail={perDiemRequired ? t('hr.travel.perDiemHint') : null}
        />
      </div>
      {children}
    </div>
  );
}

/** Labelled long-text block (purpose, notes, itinerary…). */
export function TravelTextBlock({
  label,
  text,
}: {
  label: string;
  text?: string | null;
}): React.ReactNode {
  if (!text?.trim()) {
    return null;
  }
  return (
    <div>
      <p className="m-0 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
        {label}
      </p>
      <p className="m-0 whitespace-pre-wrap break-words rounded-lg bg-[#f8fafc] px-3.5 py-3 text-sm leading-relaxed text-slate-700">
        {text}
      </p>
    </div>
  );
}

// ============================ Passengers ============================

export type PassengerTicketState = 'own' | 'combined' | 'none';

export interface TravelPassengerRow {
  id: string;
  name: string;
  email?: string | null;
  passportNumber?: string | null;
  visaRequired: boolean;
  /** Raw visa status code (NOT_APPLIED / APPLIED / APPROVED). */
  visaStatus?: string | null;
  visaStatusLabel?: string | null;
  ticket: PassengerTicketState;
}

function visaVariant(status?: string | null): StatusBadgeVariant {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'APPLIED':
      return 'info';
    default:
      return 'warning';
  }
}

function SummaryPill({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f1f5f9] px-2.5 py-1 text-xs font-medium text-slate-600">
      <span className="text-slate-400" aria-hidden>
        {icon}
      </span>
      {children}
    </span>
  );
}

/**
 * Passenger roster with visa and ticket status per person.
 */
export function TravelPassengerList({
  passengers,
}: {
  passengers: TravelPassengerRow[];
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const visaCount = passengers.filter((p) => p.visaRequired).length;
  const ticketedCount = passengers.filter((p) => p.ticket !== 'none').length;

  return (
    <div>
      <div className="flex flex-wrap gap-2 border-b border-[#eef1f4] px-4 py-3">
        <SummaryPill icon={<Users size={13} strokeWidth={2} />}>
          {passengers.length === 1
            ? t('hr.travel.passengerCountOne')
            : t('hr.travel.passengerCount', { count: passengers.length })}
        </SummaryPill>
        <SummaryPill icon={<IdCard size={13} strokeWidth={2} />}>
          {t('hr.travel.visaCount', { count: visaCount })}
        </SummaryPill>
        <SummaryPill icon={<Ticket size={13} strokeWidth={2} />}>
          {t('hr.travel.ticketedCount', {
            done: ticketedCount,
            total: passengers.length,
          })}
        </SummaryPill>
      </div>
      <ul className="m-0 list-none divide-y divide-[#eef1f4] p-0">
        {passengers.map((row) => (
          <li
            key={row.id}
            className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                style={{
                  background: tokens.colorTeal50,
                  color: tokens.colorTeal600,
                }}
                aria-hidden
              >
                {initialsOf(row.name)}
              </span>
              <div className="min-w-0">
                <p className="erp-users-cell-strong m-0 truncate">{row.name}</p>
                <p className="m-0 mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                  {row.email ? (
                    <span className="truncate">{row.email}</span>
                  ) : null}
                  {row.passportNumber ? (
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-600">
                      <IdCard size={12} strokeWidth={2} aria-hidden />
                      <span className="sr-only">{t('hr.labels.passport')}</span>
                      {row.passportNumber}
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pl-12 sm:pl-0">
              {row.visaRequired ? (
                <StatusBadge
                  label={t('hr.travel.visaWithStatus', {
                    status: row.visaStatusLabel || t('hr.labels.required'),
                  })}
                  variant={visaVariant(row.visaStatus)}
                />
              ) : (
                <StatusBadge
                  label={t('hr.travel.noVisaNeeded')}
                  variant="default"
                />
              )}
              {row.ticket === 'own' ? (
                <StatusBadge label={t('hr.table.ticket')} variant="success" />
              ) : row.ticket === 'combined' ? (
                <StatusBadge
                  label={t('hr.labels.combinedTicket')}
                  variant="info"
                />
              ) : (
                <StatusBadge label={t('hr.labels.noTicket')} variant="default" />
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ======================= Ticket acknowledgement =====================

interface TicketDocument {
  id: string;
  name: string;
  fileType?: string;
  fileSizeBytes?: number;
}

/**
 * Shown to a passenger whose ticket is attached: preview the ticket(s),
 * then confirm receipt.
 */
export function TicketAcknowledgementCard({
  combinedTickets,
  passengerTickets,
  acknowledging,
  onAcknowledge,
}: {
  combinedTickets: TicketDocument[];
  passengerTickets: TicketDocument[];
  acknowledging: boolean;
  onAcknowledge: () => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const groups = [
    { key: 'own', label: t('hr.travel.yourTicket'), documents: passengerTickets },
    {
      key: 'combined',
      label: t('hr.labels.combinedTicket'),
      documents: combinedTickets,
    },
  ].filter((group) => group.documents.length > 0);

  return (
    <div
      className="overflow-hidden rounded-[14px] border"
      style={{ borderColor: '#f3d9a8', background: tokens.colorAmber50 }}
    >
      <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-white"
          style={{ color: tokens.colorAmber400 }}
          aria-hidden
        >
          <Ticket size={20} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-sm font-semibold text-slate-900">
            {t('hr.labels.ticketReady')}
          </p>
          <p className="m-0 mt-0.5 text-xs text-slate-600">
            {t('hr.travel.acknowledgeHint')}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3 border-t border-[#f3d9a8] bg-white/70 px-4 py-4 sm:px-5">
        {groups.map((group) => (
          <div key={group.key}>
            <p className="m-0 mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
              {group.label}
            </p>
            <AttachmentDownloadList documents={group.documents} />
          </div>
        ))}
        <div>
          <Button
            type="primary"
            icon={<Check size={15} strokeWidth={2.25} />}
            loading={acknowledging}
            onClick={onAcknowledge}
            className="!h-9 !rounded-lg !font-semibold"
          >
            {t('hr.buttons.acknowledgeReceipt')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================== Budget ==============================

/**
 * Cost lines with a bar showing each line's share of the total.
 */
export function TravelBudgetBreakdown({
  rows,
  totalLabel,
  total,
  formatAmount,
}: {
  rows: { label: string; value: number | string | null | undefined }[];
  totalLabel: string;
  total: number | string | null | undefined;
  formatAmount: (value: number | string | null | undefined) => string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const totalNumber = Number(total) || 0;

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3.5 px-4 py-4">
        {rows.map(({ label, value }) => {
          const amount = Number(value) || 0;
          const percent =
            totalNumber > 0 ? Math.round((amount / totalNumber) * 100) : 0;
          return (
            <div key={label}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-slate-600">{label}</span>
                <span className="text-sm font-semibold tabular-nums text-slate-800">
                  {formatAmount(value)}
                </span>
              </div>
              <div
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#eef1f4]"
                role="img"
                aria-label={t('hr.travel.shareOfTotal', { percent })}
                title={t('hr.travel.shareOfTotal', { percent })}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${percent}%`,
                    background: tokens.colorTeal400,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div
        className="flex items-center justify-between gap-3 border-t px-4 py-3.5"
        style={{ borderColor: '#d9efe6', background: tokens.colorTeal50 }}
      >
        <span className="text-sm font-semibold text-slate-700">
          {totalLabel}
        </span>
        <span
          className="text-base font-bold tabular-nums"
          style={{ color: tokens.colorTeal600 }}
        >
          {formatAmount(total)}
        </span>
      </div>
    </div>
  );
}
