const fs = require('fs');
let c = fs.readFileSync(
  'backend/src/modules/flight/application/services/flight.service.ts',
  'utf8',
);

const reps = [
  [/FlightApplicationStatus/g, 'BusinessTripStatus'],
  [/FlightService/g, 'BusinessTripService'],
  [/ListFlightApplicationsDto/g, 'ListBusinessTripsDto'],
  [/SubmitFlightApplicationDto/g, 'SubmitBusinessTripDto'],
  [/from '\.\.\/dtos\/flight\.dtos'/g, "from '../dtos/business-trip.dtos'"],
  [/FLIGHT_DETAIL_INCLUDE/g, 'TRIP_DETAIL_INCLUDE'],
  [/tx\.flightApplication/g, 'tx.businessTrip'],
  [/this\.prisma\.flightApplication/g, 'this.prisma.businessTrip'],
  [/tx\.flightPassenger/g, 'tx.businessTripPassenger'],
  [/this\.prisma\.flightPassenger/g, 'this.prisma.businessTripPassenger'],
  [/tx\.flightApplicationDocument/g, 'tx.businessTripDocument'],
  [/Prisma\.FlightApplication/g, 'Prisma.BusinessTrip'],
  [/applicationNumber/g, 'tripNumber'],
  [/applicationId/g, 'tripId'],
  [/FolderContextType\.FLIGHT/g, 'FolderContextType.BUSINESS_TRIP'],
  [/flight_application_number_seq/g, 'business_trip_number_seq'],
  [/`FA-/g, '`BT-'],
  [/'FLIGHT_APPLICATION'/g, "'BUSINESS_TRIP'"],
  [/Flight org chain/g, 'Business trip org chain'],
  [/\/hr\/flight-applications\//g, '/hr/business-trips/'],
  [/hr\/flight\//g, 'hr/business-trips/'],
  [/name: `Flight /g, 'name: `Business Trip '],
  [/path: `\/hr\/flight\//g, 'path: `/hr/business-trips/'],
  [/'flight\.approved'/g, "'business_trip.approved'"],
  [/'flight\.booking_required'/g, "'business_trip.booking_required'"],
  [/'flight\.ticket_acknowledged'/g, "'business_trip.ticket_acknowledged'"],
  [/'FLIGHT_TICKET_READY'/g, "'BUSINESS_TRIP_TICKET_READY'"],
  [/'FLIGHT_ALL_TICKETS_ACKNOWLEDGED'/g, "'BUSINESS_TRIP_ALL_TICKETS_ACKNOWLEDGED'"],
  [/Flight Booking Required/g, 'Business Trip Booking Required'],
  [/Flight Application Approved/g, 'Business Trip Approved'],
  [/flight application/g, 'business trip'],
  [/Flight application/g, 'Business trip'],
  [/'flight'/g, "'business-trip'"],
  [/isFlightManager/g, 'isTripManager'],
  [/flight managers/g, 'business-trip managers'],
  [/submitApplication/g, 'submitTrip'],
  [/listApplications/g, 'listTrips'],
  [/getApplication/g, 'getTrip'],
  [/cancelApplication/g, 'cancelTrip'],
  [/mapApplication/g, 'mapTrip'],
  [/ensureFlightAttachmentFolder/g, 'ensureTripAttachmentFolder'],
  [/nextApplicationNumber/g, 'nextTripNumber'],
  [/\* Flight application lifecycle/g, '* Business trip lifecycle'],
];

for (const [a, b] of reps) {
  c = c.replace(a, b);
}

fs.writeFileSync(
  'backend/src/modules/business-trip/application/services/business-trip.service.ts',
  c,
);
console.log('written', c.length);
