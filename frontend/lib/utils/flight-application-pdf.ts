import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { FlightApplicationDetail } from '@/lib/api/flight.types';
import { formatDisplayDateTime } from '@/lib/utils/date-format';
import {
  formatFlightStatus,
  formatFlightSubmitterName,
  formatTicketClass,
  formatTripType,
  formatVisaStatus,
} from '@/lib/utils/flight-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';

const TEAL: [number, number, number] = [16, 152, 138];
const NAVY: [number, number, number] = [27, 43, 75];
const MUTED: [number, number, number] = [111, 114, 119];
const BORDER: [number, number, number] = [229, 231, 235];
const PAGE_MARGIN = 14;

export interface FlightApplicationPdfLabels {
  title: string;
  subtitle: string;
  generatedAt: string;
  preparedBy: string;
  footer: string;
  applicationOverview: string;
  travelDetails: string;
  passengers: string;
  documents: string;
  field: string;
  value: string;
  applicationNumber: string;
  status: string;
  submittedBy: string;
  tripType: string;
  international: string;
  domestic: string;
  origin: string;
  destination: string;
  departure: string;
  return: string;
  ticketClass: string;
  purpose: string;
  notes: string;
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

interface FlightApplicationPdfInput {
  application: FlightApplicationDetail;
  companyName: string;
  preparedBy: string;
  labels: FlightApplicationPdfLabels;
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
 * Generates a flight application detail PDF (no approval workflow).
 */
export function exportFlightApplicationPdf(
  input: FlightApplicationPdfInput,
): void {
  const { application, companyName, preparedBy, labels, t } = input;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const generatedAt = new Date().toISOString();
  const originLabel = `${application.originCity}, ${application.originCountry}`;
  const routeTitle = `${originLabel} → ${application.destination}`;
  const submitterName = formatFlightSubmitterName(application.submitter);

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
  doc.text(
    `${application.applicationNumber} · ${companyName}`,
    PAGE_MARGIN,
    27,
  );

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

  y = drawSectionTitle(doc, labels.applicationOverview, y);
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
      [labels.applicationNumber, application.applicationNumber],
      [labels.status, formatFlightStatus(application.status, t)],
      [labels.submittedBy, submitterName],
      [labels.tripType, formatTripType(application.tripType, t)],
      [
        labels.international,
        application.isInternational ? labels.international : labels.domestic,
      ],
      [labels.ticketClass, formatTicketClass(application.ticketClass, t)],
    ],
  });
  y = doc.lastAutoTable.finalY + 8;

  y = ensureSpace(doc, y, 50);
  y = drawSectionTitle(doc, labels.travelDetails, y);
  const travelBody: string[][] = [
    [labels.origin, originLabel],
    [labels.destination, application.destination],
    [labels.departure, formatProjectDate(application.departureDate)],
    [
      labels.return,
      application.returnDate
        ? formatProjectDate(application.returnDate)
        : '-',
    ],
    [labels.purpose, dash(application.purpose)],
  ];
  if (application.notes?.trim()) {
    travelBody.push([labels.notes, application.notes.trim()]);
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
    body: travelBody,
  });
  y = doc.lastAutoTable.finalY + 8;


  y = ensureSpace(doc, y, 45);
  y = drawSectionTitle(doc, labels.passengers, y);
  const passengerRows =
    application.passengers.length > 0
      ? application.passengers.map((passenger) => [
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
    ...(application.documents ?? []).map((docItem) => docItem.name),
    ...(application.combinedTicket
      ? [application.combinedTicket.name]
      : application.combinedTickets?.map((ticket) => ticket.name) ?? []),
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
  const safeNumber = application.applicationNumber.replace(
    /[^a-zA-Z0-9-_]/g,
    '_',
  );
  doc.save(`flight-application_${safeNumber}_${dateStamp}.pdf`);
}

declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable: { finalY: number };
  }
}
