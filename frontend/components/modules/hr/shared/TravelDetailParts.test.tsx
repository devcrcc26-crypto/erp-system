import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  TicketAcknowledgementCard,
  TravelBudgetBreakdown,
  TravelPassengerList,
  TravelRouteHero,
} from './TravelDetailParts';

vi.mock('@/hooks/use-epc-translation', () => ({
  useEpcTranslation: () => ({
    t: (key: string, vars?: Record<string, string | number>) =>
      vars ? `${key}(${Object.values(vars).join(',')})` : key,
    locale: 'en',
  }),
}));

describe('TravelRouteHero', () => {
  it('shows the route ends and an inclusive trip length', () => {
    render(
      <TravelRouteHero
        referenceNumber="FA-001"
        statusLabel="Approved"
        statusVariant="success"
        tripTypeLabel="Round Trip"
        tripTypeVariant="info"
        isInternational
        requesterName="Abebe Kebede"
        origin={{ city: 'Addis Ababa', country: 'Ethiopia' }}
        destination={{ city: 'Dubai', country: 'UAE' }}
        departureDate="2026-10-01"
        returnDate="2026-10-05"
        ticketClassLabel="Economy"
        passengerCount={3}
      />,
    );

    expect(screen.getByText('Addis Ababa')).toBeTruthy();
    expect(screen.getByText('Dubai')).toBeTruthy();
    expect(screen.getByText('hr.travel.requestedBy(Abebe Kebede)')).toBeTruthy();
    expect(
      screen.getAllByText('Round Trip · hr.travel.dayCount(5)').length,
    ).toBeGreaterThan(0);
  });

  it('omits the trip length for one-way travel', () => {
    render(
      <TravelRouteHero
        referenceNumber="FA-002"
        statusLabel="Draft"
        statusVariant="default"
        tripTypeLabel="One Way"
        tripTypeVariant="cyan"
        isInternational={false}
        requesterName="A"
        origin={{ city: 'Addis Ababa', country: 'Ethiopia' }}
        destination={{ country: 'Kenya' }}
        departureDate="2026-10-01"
        ticketClassLabel="Economy"
        passengerCount={1}
      />,
    );
    expect(screen.queryByText(/hr\.travel\.dayCount/)).toBeNull();
    expect(screen.getByText('Kenya')).toBeTruthy();
    expect(screen.getByText('hr.labels.domestic')).toBeTruthy();
  });
});

describe('TravelPassengerList', () => {
  it('labels visa and ticket state per passenger and summarises them', () => {
    render(
      <TravelPassengerList
        passengers={[
          {
            id: '1',
            name: 'Sara Tesfaye',
            passportNumber: 'EP123',
            visaRequired: true,
            visaStatus: 'APPROVED',
            visaStatusLabel: 'Approved',
            ticket: 'own',
          },
          {
            id: '2',
            name: 'Dawit Alemu',
            visaRequired: false,
            ticket: 'none',
          },
        ]}
      />,
    );

    expect(screen.getByText('hr.travel.visaWithStatus(Approved)')).toBeTruthy();
    expect(screen.getByText('hr.travel.noVisaNeeded')).toBeTruthy();
    expect(screen.getByText('hr.labels.noTicket')).toBeTruthy();
    expect(screen.getByText('hr.travel.ticketedCount(1,2)')).toBeTruthy();
    expect(screen.getByText('hr.travel.visaCount(1)')).toBeTruthy();
    expect(screen.getByText('EP123')).toBeTruthy();
    expect(screen.getByText('ST')).toBeTruthy();
  });
});

describe('TravelRouteHero on the approval page', () => {
  it('hides the number and status badges when they are not passed', () => {
    render(
      <TravelRouteHero
        tripTypeLabel="One Way"
        tripTypeVariant="cyan"
        isInternational
        requesterName="A"
        origin={{ city: 'Addis Ababa', country: 'Ethiopia' }}
        destination={{ country: 'Kenya' }}
        departureDate="2026-10-01"
        ticketClassLabel="Economy"
        passengerCount={1}
      />,
    );
    expect(document.querySelector('.erp-users-id-chip')).toBeNull();
    expect(screen.getAllByText('One Way').length).toBeGreaterThan(0);
  });
});

describe('TicketAcknowledgementCard', () => {
  it('lists the available tickets and confirms receipt', async () => {
    const onAcknowledge = vi.fn();
    render(
      <TicketAcknowledgementCard
        combinedTickets={[]}
        passengerTickets={[
          { id: 't1', name: 'ticket.pdf', fileType: 'application/pdf' },
        ]}
        acknowledging={false}
        onAcknowledge={onAcknowledge}
      />,
    );
    expect(screen.getByText('hr.travel.yourTicket')).toBeTruthy();
    expect(screen.queryByText('hr.labels.combinedTicket')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: /hr\.buttons\.acknowledgeReceipt/ }),
    );
    expect(onAcknowledge).toHaveBeenCalledTimes(1);
  });
});

describe('TravelBudgetBreakdown', () => {
  it('shows each line as a share of the total', () => {
    render(
      <TravelBudgetBreakdown
        rows={[
          { label: 'Flight', value: 750 },
          { label: 'Hotel', value: 250 },
        ]}
        totalLabel="Total"
        total={1000}
        formatAmount={(v) => `ETB ${v}`}
      />,
    );
    expect(screen.getByLabelText('hr.travel.shareOfTotal(75)')).toBeTruthy();
    expect(screen.getByLabelText('hr.travel.shareOfTotal(25)')).toBeTruthy();
    expect(screen.getByText('ETB 1000')).toBeTruthy();
  });
});
