import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PDF_FONT, registerCjkFont } from '@/lib/utils/pdf-font';
import type { BusinessTripDetail } from '@/lib/api/business-trip.types';
import {
  formatBusinessTripStatus,
  formatBusinessTripSubmitterName,
  formatEtb,
  formatTripType,
  formatVisaStatus,
} from '@/lib/utils/business-trip-display';
import { formatDisplayDateTime } from '@/lib/utils/date-format';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';

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
  purpose: string;
  hostOrganization: string;
  hostContactName: string;
  hostContactPhone: string;
  hostContactEmail: string;
  expectedOutcomes: string;
  itinerary: string;
  notes: string;
  estimatedAccommodation: string;
  estimatedPerDiem: string;
  estimatedOther: string;
  estimatedTotal: string;
  passengerName: string;
  passengerEmail: string;
  passport: string;
  visaRequired: string;
  visaStatus: string;
  none: string;
  required: string;
  notRequired: string;
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
  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(80, 80, 80);
  doc.text(title.toUpperCase(), PAGE_MARGIN, y + 4);
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(PAGE_MARGIN, y + 6, doc.internal.pageSize.getWidth() - PAGE_MARGIN, y + 6);
  return y + 10;
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
export async function exportBusinessTripPdf(input: BusinessTripPdfInput): Promise<void> {
  const { trip, companyName, preparedBy, labels, t } = input;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  await registerCjkFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const generatedAt = new Date().toISOString();
  const originLabel = `${trip.originCity}, ${trip.originCountry}`;
  const destinationLabel = `${trip.destinationCity}, ${trip.destinationCountry}`;
  const submitterName = formatBusinessTripSubmitterName(trip.submitter);

  let y = PAGE_MARGIN;

  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(companyName, PAGE_MARGIN, PAGE_MARGIN);
  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(14);
  doc.text(labels.title, PAGE_MARGIN, PAGE_MARGIN + 7);
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(PAGE_MARGIN, PAGE_MARGIN + 12, pageWidth - PAGE_MARGIN, PAGE_MARGIN + 12);
  y = PAGE_MARGIN + 18;

  doc.setTextColor(120, 120, 120);
  doc.setFont(PDF_FONT, 'normal');
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
    theme: 'plain',
    styles: { font: PDF_FONT, lineColor: [180, 180, 180], lineWidth: 0.2 },
    headStyles: { font: PDF_FONT, fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, lineColor: [180, 180, 180], lineWidth: 0.3, cellPadding: 2 },
    bodyStyles: { font: PDF_FONT, fontSize: 8, textColor: [40, 40, 40], cellPadding: 2 },
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
    theme: 'plain',
    styles: { font: PDF_FONT, lineColor: [180, 180, 180], lineWidth: 0.2 },
    headStyles: { font: PDF_FONT, fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, lineColor: [180, 180, 180], lineWidth: 0.3, cellPadding: 2 },
    bodyStyles: { font: PDF_FONT, fontSize: 8, textColor: [40, 40, 40], cellPadding: 2 },
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
    theme: 'plain',
    styles: { font: PDF_FONT, lineColor: [180, 180, 180], lineWidth: 0.2 },
    headStyles: { font: PDF_FONT, fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, lineColor: [180, 180, 180], lineWidth: 0.3, cellPadding: 2 },
    bodyStyles: { font: PDF_FONT, fontSize: 8, textColor: [40, 40, 40], cellPadding: 2 },
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
    theme: 'plain',
    styles: { font: PDF_FONT, lineColor: [180, 180, 180], lineWidth: 0.2 },
    headStyles: { font: PDF_FONT, fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, lineColor: [180, 180, 180], lineWidth: 0.3, cellPadding: 2 },
    bodyStyles: { font: PDF_FONT, fontSize: 8, textColor: [40, 40, 40], cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold' },
      1: { cellWidth: 'auto' },
    },
    head: [[labels.field, labels.value]],
    body: [
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
    theme: 'plain',
    styles: { font: PDF_FONT, lineColor: [180, 180, 180], lineWidth: 0.2 },
    headStyles: { font: PDF_FONT, fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, lineColor: [180, 180, 180], lineWidth: 0.3, cellPadding: 2 },
    bodyStyles: { font: PDF_FONT, fontSize: 7.5, textColor: [40, 40, 40], cellPadding: 2 },
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
      theme: 'plain',
      styles: { font: PDF_FONT, lineColor: [180, 180, 180], lineWidth: 0.2 },
      headStyles: { font: PDF_FONT, fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, lineColor: [180, 180, 180], lineWidth: 0.3, cellPadding: 2 },
      bodyStyles: { font: PDF_FONT, fontSize: 8, textColor: [40, 40, 40], cellPadding: 2 },
      head: [[labels.documents]],
      body: documentNames.map((name) => [name]),
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
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
