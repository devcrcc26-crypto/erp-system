import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { BusinessTripDetail } from '@/lib/api/business-trip.types';
import {
  formatBusinessTripStatus,
  formatBusinessTripSubmitterName,
  formatEtb,
  formatTicketClass,
  formatTripType,
  formatVisaStatus,
} from '@/lib/utils/business-trip-display';
import { formatDisplayDateTime } from '@/lib/utils/date-format';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';

const TEAL: [number, number, number] = [16, 152, 138];
const NAVY: [number, number, number] = [27, 43, 75];
const MUTED: [number, number, number] = [111, 114, 119];
const BORDER: [number, number, number] = [229, 231, 235];
const PAGE_MARGIN = 14;

export interface BusinessTripPdfLabels {
  title: string;
  generatedAt: string;
  preparedBy: string;
  footer: string;
  tripOverview: string;
  travelDetails: string;
  purposeHost: string;
  budgetEstimate: string;
  stayAllowances: string;
  passengers: string;
  documents: string;
  field: string;
  value: string;
  tripNumber: string;
  status: string;
  submittedBy: string;
  tripType: string;
  international: string;
  origin: string;
  destination: string;
  departure: string;
  return: string;
  ticketClass: string;
  purpose: string;
  hostOrganization: string;
  hostContactName: string;
  hostContactPhone: string;
  hostContactEmail: string;
  expectedOutcomes: string;
  itinerary: string;
  notes: string;
  estimatedFlight: string;
  estimatedAccommodation: string;
  estimatedPerDiem: string;
  estimatedOther: string;
  estimatedTotal: string;
  accommodation: string;
  accommodationDetails: string;
  perDiem: string;
  required: string;
  notRequired: string;
  passengerName: string;
  passengerEmail: string;
  passport: string;
  visaRequired: string;
  visaStatus: string;
  none: string;
  page: string;
  of: string;
}

type TranslateFn = (
  key: string,
  options?: Record<string, string | number>,
) => string;

interface BusinessTripPdfInput {
  trip: BusinessTripDetail;
  companyName: string;
  preparedBy: string;
  labels: BusinessTripPdfLabels;
  t: TranslateFn;
}

function drawSectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFillColor(...BORDER);
  doc.rect(PAGE_MARGIN, y, doc.internal.pageSize.getWidth() - PAGE_MARGIN * 2, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text(title.toUpperCase(), PAGE_MARGIN + 2, y + 5);
  return y + 11;
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - 16) {
    doc.addPage();
    return PAGE_MARGIN;
  }
  return y;
}

function dash(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : '-';
}

/**
 * Generates a business trip detail PDF (no approval workflow).
 */
export function exportBusinessTripPdf(input: BusinessTripPdfInput): void {
  const { trip, companyName, preparedBy, labels, t } = input;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const generatedAt = new Date().toISOString();
  const originLabel = `${trip.originCity}, ${trip.originCountry}`;
  const destinationLabel = `${trip.destinationCity}, ${trip.destinationCountry}`;
  const routeTitle = `${originLabel} → ${destinationLabel}`;
  const submitterName = formatBusinessTripSubmitterName(trip.submitter);

  let y = PAGE_MARGIN;

  doc.setFillColor(...TEAL);
  doc.rect(0, 0, pageWidth, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(labels.title, PAGE_MARGIN, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(routeTitle, PAGE_MARGIN, 21);
  doc.setFontSize(8);
  doc.text(`${trip.tripNumber} · ${companyName}`, PAGE_MARGIN, 27);

  y = 40;
  doc.setTextColor(...MUTED);
  doc.setFontSize(8);
  doc.text(
    `${labels.generatedAt}: ${formatDisplayDateTime(generatedAt)}`,
    PAGE_MARGIN,
    y,
  );
  doc.text(`${labels.preparedBy}: ${preparedBy}`, pageWidth / 2, y);
  y += 8;

  y = drawSectionTitle(doc, labels.tripOverview, y);
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'grid',
    headStyles: { fillColor: NAVY, fontSize: 8, cellPadding: 2 },
    bodyStyles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold' },
      1: { cellWidth: 'auto' },
    },
    head: [[labels.field, labels.value]],
    body: [
      [labels.tripNumber, trip.tripNumber],
      [labels.status, formatBusinessTripStatus(trip.status, t)],
      [labels.submittedBy, submitterName],
      [labels.tripType, formatTripType(trip.tripType, t)],
      [labels.international, labels.international],
      [labels.ticketClass, formatTicketClass(trip.ticketClass, t)],
    ],
  });
  y = doc.lastAutoTable.finalY + 8;

  y = ensureSpace(doc, y, 50);
  y = drawSectionTitle(doc, labels.travelDetails, y);
  const travelBody: string[][] = [
    [labels.origin, originLabel],
    [labels.destination, destinationLabel],
    [labels.departure, formatProjectDate(trip.departureDate)],
    [
      labels.return,
      trip.returnDate ? formatProjectDate(trip.returnDate) : '-',
    ],
  ];
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'grid',
    headStyles: { fillColor: NAVY, fontSize: 8, cellPadding: 2 },
    bodyStyles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold' },
      1: { cellWidth: 'auto' },
    },
    head: [[labels.field, labels.value]],
    body: travelBody,
  });
  y = doc.lastAutoTable.finalY + 8;

  y = ensureSpace(doc, y, 45);
  y = drawSectionTitle(doc, labels.purposeHost, y);
  const purposeBody: string[][] = [
    [labels.purpose, dash(trip.purpose)],
    [labels.hostOrganization, dash(trip.hostOrganization)],
    [labels.hostContactName, dash(trip.hostContactName)],
    [labels.hostContactPhone, dash(trip.hostContactPhone)],
    [labels.hostContactEmail, dash(trip.hostContactEmail)],
  ];
  if (trip.expectedOutcomes?.trim()) {
    purposeBody.push([labels.expectedOutcomes, trip.expectedOutcomes.trim()]);
  }
  if (trip.itinerary?.trim()) {
    purposeBody.push([labels.itinerary, trip.itinerary.trim()]);
  }
  if (trip.notes?.trim()) {
    purposeBody.push([labels.notes, trip.notes.trim()]);
  }
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'grid',
    headStyles: { fillColor: NAVY, fontSize: 8, cellPadding: 2 },
    bodyStyles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold' },
      1: { cellWidth: 'auto' },
    },
    head: [[labels.field, labels.value]],
    body: purposeBody,
  });
  y = doc.lastAutoTable.finalY + 8;

  y = ensureSpace(doc, y, 40);
  y = drawSectionTitle(doc, labels.budgetEstimate, y);
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'grid',
    headStyles: { fillColor: NAVY, fontSize: 8, cellPadding: 2 },
    bodyStyles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold' },
      1: { cellWidth: 'auto' },
    },
    head: [[labels.field, labels.value]],
    body: [
      [labels.estimatedFlight, formatEtb(trip.estimatedFlightCost)],
      [
        labels.estimatedAccommodation,
        formatEtb(trip.estimatedAccommodationCost),
      ],
      [labels.estimatedPerDiem, formatEtb(trip.estimatedPerDiem)],
      [labels.estimatedOther, formatEtb(trip.estimatedOtherCost)],
      [labels.estimatedTotal, formatEtb(trip.estimatedTotalCost)],
    ],
  });
  y = doc.lastAutoTable.finalY + 8;

  y = ensureSpace(doc, y, 35);
  y = drawSectionTitle(doc, labels.stayAllowances, y);
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'grid',
    headStyles: { fillColor: NAVY, fontSize: 8, cellPadding: 2 },
    bodyStyles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold' },
      1: { cellWidth: 'auto' },
    },
    head: [[labels.field, labels.value]],
    body: [
      [
        labels.accommodation,
        trip.accommodationRequired ? labels.required : labels.notRequired,
      ],
      ...(trip.accommodationRequired && trip.accommodationDetails?.trim()
        ? [[labels.accommodationDetails, trip.accommodationDetails.trim()]]
        : []),
      [
        labels.perDiem,
        trip.perDiemRequired ? labels.required : labels.notRequired,
      ],
    ],
  });
  y = doc.lastAutoTable.finalY + 8;

  y = ensureSpace(doc, y, 45);
  y = drawSectionTitle(doc, labels.passengers, y);
  const passengerRows =
    trip.passengers.length > 0
      ? trip.passengers.map((passenger) => [
          passenger.employee
            ? formatUserName(passenger.employee)
            : passenger.employeeId,
          dash(passenger.employee?.email),
          dash(passenger.passportNumber),
          passenger.visaRequired ? labels.required : labels.notRequired,
          passenger.visaStatus
            ? formatVisaStatus(passenger.visaStatus, t)
            : '-',
        ])
      : [[labels.none, '-', '-', '-', '-']];
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'striped',
    headStyles: { fillColor: TEAL, fontSize: 8, cellPadding: 2 },
    bodyStyles: { fontSize: 7.5, cellPadding: 2 },
    head: [
      [
        labels.passengerName,
        labels.passengerEmail,
        labels.passport,
        labels.visaRequired,
        labels.visaStatus,
      ],
    ],
    body: passengerRows,
  });
  y = doc.lastAutoTable.finalY + 8;

  const documentNames = [
    ...(trip.documents ?? []).map((docItem) => docItem.name),
    ...(trip.combinedTicket
      ? [trip.combinedTicket.name]
      : trip.combinedTickets?.map((ticket) => ticket.name) ?? []),
  ].filter(Boolean);

  if (documentNames.length > 0) {
    y = ensureSpace(doc, y, 30);
    y = drawSectionTitle(doc, labels.documents, y);
    autoTable(doc, {
      startY: y,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      theme: 'striped',
      headStyles: { fillColor: NAVY, fontSize: 8, cellPadding: 2 },
      bodyStyles: { fontSize: 8, cellPadding: 2 },
      head: [[labels.documents]],
      body: documentNames.map((name) => [name]),
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(
      `${labels.footer} - ${labels.title} - ${labels.page} ${page} ${labels.of} ${pageCount}`,
      PAGE_MARGIN,
      doc.internal.pageSize.getHeight() - 8,
    );
  }

  const dateStamp = generatedAt.slice(0, 10);
  const safeNumber = trip.tripNumber.replace(/[^a-zA-Z0-9-_]/g, '_');
  doc.save(`business-trip_${safeNumber}_${dateStamp}.pdf`);
}

declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable: { finalY: number };
  }
}
