const fs = require('fs');
let c = fs.readFileSync(
  'backend/src/modules/flight/presentation/controllers/flight.controller.ts',
  'utf8',
);

const reps = [
  [/FlightController/g, 'BusinessTripController'],
  [/FlightService/g, 'BusinessTripService'],
  [/ListFlightApplicationsDto/g, 'ListBusinessTripsDto'],
  [/SubmitFlightApplicationDto/g, 'SubmitBusinessTripDto'],
  [/from '\.\.\/\.\.\/application\/dtos\/flight\.dtos'/g, "from '../../application/dtos/business-trip.dtos'"],
  [/from '\.\.\/\.\.\/application\/services\/flight\.service'/g, "from '../../application/services/business-trip.service'"],
  [/normalizeFlightSubmitBody/g, 'normalizeBusinessTripSubmitBody'],
  [/parseFlightSubmitDto/g, 'parseBusinessTripSubmitDto'],
  [/HR Flight Applications/g, 'HR Business Trips'],
  [/'hr\/flight-applications'/g, "'hr/business-trips'"],
  [/'flight'/g, "'business-trip'"],
  [/flightService/g, 'businessTripService'],
  [/submitApplication/g, 'submitTrip'],
  [/listApplications/g, 'listTrips'],
  [/getApplication/g, 'getTrip'],
  [/cancelApplication/g, 'cancelTrip'],
  [/flight application/g, 'business trip'],
  [/Flight application/g, 'Business trip'],
  [/FlightPassengerDto/g, 'BusinessTripPassengerDto'],
];

for (const [a, b] of reps) {
  c = c.replace(a, b);
}

// Remove isInternational from normalize + swagger
c = c.replace(
  /for \(const key of \[\s*'isInternational',\s*'accommodationRequired',\s*'perDiemRequired',\s*\] as const\)/,
  `for (const key of [
    'accommodationRequired',
    'perDiemRequired',
  ] as const)`,
);

c = c.replace(
  /for \(const key of \['returnDate', 'notes', 'accommodationDetails'\] as const\)/,
  `for (const key of [
    'returnDate',
    'notes',
    'accommodationDetails',
    'hostOrganization',
    'hostContact',
    'expectedOutcomes',
    'itinerary',
    'estimatedFlightCost',
    'estimatedAccommodationCost',
    'estimatedPerDiem',
    'estimatedOtherCost',
  ] as const)`,
);

// Fix swagger body - remove isInternational, update destination fields
c = c.replace(
  /required: \[\s*'tripType',\s*'isInternational',\s*'origin',\s*'destination',\s*'departureDate',\s*'purpose',\s*'ticketClass',\s*'passengers',\s*\],\s*properties: \{[\s\S]*?files: \{/,
  `required: [
        'tripType',
        'origin',
        'destinationCountry',
        'destinationCity',
        'departureDate',
        'purpose',
        'ticketClass',
        'passengers',
      ],
      properties: {
        tripType: { type: 'string', enum: ['ONE_WAY', 'ROUND_TRIP'] },
        origin: { type: 'string' },
        destinationCountry: { type: 'string' },
        destinationCity: { type: 'string' },
        departureDate: { type: 'string', format: 'date' },
        returnDate: { type: 'string', format: 'date' },
        purpose: { type: 'string' },
        hostOrganization: { type: 'string' },
        hostContact: { type: 'string' },
        expectedOutcomes: { type: 'string' },
        itinerary: { type: 'string' },
        ticketClass: { type: 'string', enum: ['ECONOMY', 'BUSINESS'] },
        estimatedFlightCost: { type: 'number' },
        estimatedAccommodationCost: { type: 'number' },
        estimatedPerDiem: { type: 'number' },
        estimatedOtherCost: { type: 'number' },
        accommodationRequired: { type: 'boolean' },
        accommodationDetails: { type: 'string' },
        perDiemRequired: { type: 'boolean' },
        notes: { type: 'string' },
        passengers: {
          type: 'string',
          description: 'JSON array of BusinessTripPassengerDto',
        },
        files: {`,
);

fs.writeFileSync(
  'backend/src/modules/business-trip/presentation/controllers/business-trip.controller.ts',
  c,
);
console.log('controller written');
