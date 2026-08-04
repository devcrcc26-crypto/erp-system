const fs = require('fs');
const path =
  'backend/src/modules/business-trip/application/services/business-trip.service.ts';
let c = fs.readFileSync(path, 'utf8');

const tripFieldsBlock = `tripType: dto.tripType,
              origin: dto.origin.trim(),
              destinationCountry: dto.destinationCountry.trim(),
              destinationCity: dto.destinationCity.trim(),
              departureDate,
              returnDate: dto.returnDate
                ? this.parseDateOnly(dto.returnDate)
                : null,
              purpose: dto.purpose.trim(),
              hostOrganization: dto.hostOrganization?.trim() || null,
              hostContact: dto.hostContact?.trim() || null,
              expectedOutcomes: dto.expectedOutcomes?.trim() || null,
              itinerary: dto.itinerary?.trim() || null,
              ticketClass: dto.ticketClass,
              estimatedFlightCost: dto.estimatedFlightCost ?? null,
              estimatedAccommodationCost: dto.estimatedAccommodationCost ?? null,
              estimatedPerDiem: dto.estimatedPerDiem ?? null,
              estimatedOtherCost: dto.estimatedOtherCost ?? null,
              accommodationRequired: dto.accommodationRequired ?? true,
              accommodationDetails:
                dto.accommodationDetails?.trim() || null,
              perDiemRequired: dto.perDiemRequired ?? true,
              notes: dto.notes?.trim() || null,`;

const oldTripFields = /tripType: dto\.tripType,\s*isInternational: dto\.isInternational,\s*origin: dto\.origin\.trim\(\),\s*destination: dto\.destination\.trim\(\),\s*departureDate,\s*returnDate: dto\.returnDate\s*\? this\.parseDateOnly\(dto\.returnDate\)\s*: null,\s*purpose: dto\.purpose\.trim\(\),\s*ticketClass: dto\.ticketClass,\s*accommodationRequired: dto\.accommodationRequired \?\? false,\s*accommodationDetails:\s*dto\.accommodationDetails\?\.trim\(\) \|\| null,\s*perDiemRequired: dto\.perDiemRequired \?\? false,\s*notes: dto\.notes\?\.trim\(\) \|\| null,/g;

c = c.replace(oldTripFields, tripFieldsBlock);

c = c.replace(
  /visaRequired: passenger\.visaRequired \?\? false,/g,
  'visaRequired: passenger.visaRequired ?? true,',
);

// Destination label helper usage in notifications — pass city, country
c = c.replace(
  /dto\.destination(?!Country|City)/g,
  '`${dto.destinationCity}, ${dto.destinationCountry}`',
);

// Fix broken template if double-wrapped
c = c.replace(
  /`\$\{`\$\{dto\.destinationCity\}, \$\{dto\.destinationCountry\}`\}`/g,
  '`${dto.destinationCity}, ${dto.destinationCountry}`',
);

// Approval title + formData
c = c.replace(
  /title: `Flight \$\{dto\.origin\} → \$\{dto\.destination\} — \$\{dto\.departureDate\}`,\s*formData: \{\s*tripType: dto\.tripType,\s*isInternational: dto\.isInternational,\s*origin: dto\.origin,\s*destination: dto\.destination,\s*departureDate: dto\.departureDate,\s*returnDate: dto\.returnDate \?\? null,\s*purpose: dto\.purpose,\s*ticketClass: dto\.ticketClass,\s*passengerCount: dto\.passengers\.length,\s*\},/,
  `title: \`Business trip \${dto.origin} → \${dto.destinationCity}, \${dto.destinationCountry} — \${dto.departureDate}\`,
        formData: {
          tripType: dto.tripType,
          origin: dto.origin,
          destinationCountry: dto.destinationCountry,
          destinationCity: dto.destinationCity,
          departureDate: dto.departureDate,
          returnDate: dto.returnDate ?? null,
          purpose: dto.purpose,
          hostOrganization: dto.hostOrganization ?? null,
          ticketClass: dto.ticketClass,
          estimatedFlightCost: dto.estimatedFlightCost ?? null,
          estimatedAccommodationCost: dto.estimatedAccommodationCost ?? null,
          estimatedPerDiem: dto.estimatedPerDiem ?? null,
          estimatedOtherCost: dto.estimatedOtherCost ?? null,
          passengerCount: dto.passengers.length,
        },`,
);

// Also handle BUSINESS_TRIP title if already partially replaced
c = c.replace(
  /title: `Business trip \$\{dto\.origin\} → \$\{`\$\{dto\.destinationCity\}, \$\{dto\.destinationCountry\}`\} — \$\{dto\.departureDate\}`,/,
  'title: `Business trip ${dto.origin} → ${dto.destinationCity}, ${dto.destinationCountry} — ${dto.departureDate}`,',
);

c = c.replace(
  /title: `Business trip \$\{dto\.origin\} → \$\{dto\.destination\} — \$\{dto\.departureDate\}`,\s*formData: \{\s*tripType: dto\.tripType,\s*isInternational: dto\.isInternational,\s*origin: dto\.origin,\s*destination: dto\.destination,\s*departureDate: dto\.departureDate,\s*returnDate: dto\.returnDate \?\? null,\s*purpose: dto\.purpose,\s*ticketClass: dto\.ticketClass,\s*passengerCount: dto\.passengers\.length,\s*\},/,
  `title: \`Business trip \${dto.origin} → \${dto.destinationCity}, \${dto.destinationCountry} — \${dto.departureDate}\`,
        formData: {
          tripType: dto.tripType,
          origin: dto.origin,
          destinationCountry: dto.destinationCountry,
          destinationCity: dto.destinationCity,
          departureDate: dto.departureDate,
          returnDate: dto.returnDate ?? null,
          purpose: dto.purpose,
          hostOrganization: dto.hostOrganization ?? null,
          ticketClass: dto.ticketClass,
          estimatedFlightCost: dto.estimatedFlightCost ?? null,
          estimatedAccommodationCost: dto.estimatedAccommodationCost ?? null,
          estimatedPerDiem: dto.estimatedPerDiem ?? null,
          estimatedOtherCost: dto.estimatedOtherCost ?? null,
          passengerCount: dto.passengers.length,
        },`,
);

// Search: destination -> destinationCountry/City
c = c.replace(
  /\{\s*destination: \{\s*contains: filters\.search\.trim\(\),\s*mode: 'insensitive' as const,\s*\},\s*\},/,
  `{
                  destinationCountry: {
                    contains: filters.search.trim(),
                    mode: 'insensitive' as const,
                  },
                },
                {
                  destinationCity: {
                    contains: filters.search.trim(),
                    mode: 'insensitive' as const,
                  },
                },
                {
                  tripNumber: {
                    contains: filters.search.trim(),
                    mode: 'insensitive' as const,
                  },
                },`,
);

// Remove isInternational filter
c = c.replace(
  /\s*\.\.\.\(filters\.isInternational !== undefined\s*\? \{ isInternational: filters\.isInternational \}\s*: \{\}\),/g,
  '',
);

// Add destinationCountry filter after submittedById block
if (!c.includes('filters.destinationCountry')) {
  c = c.replace(
    /\.\.\.\(canViewAll && filters\.submittedById\s*\? \{ submittedBy: filters\.submittedById \}\s*: \{\}\),/,
    `...(canViewAll && filters.submittedById
        ? { submittedBy: filters.submittedById }
        : {}),
      ...(filters.destinationCountry?.trim()
        ? {
            destinationCountry: {
              contains: filters.destinationCountry.trim(),
              mode: 'insensitive' as const,
            },
          }
        : {}),`,
  );
}

// Sort field applicationNumber -> tripNumber already done via applicationNumber replace
// Fix app.destination in onApprovalDecision notifies
c = c.replace(
  /app\.destination/g,
  '`${app.destinationCity}, ${app.destinationCountry}`',
);
c = c.replace(
  /`\$\{`\$\{app\.destinationCity\}, \$\{app\.destinationCountry\}`\}`/g,
  '`${app.destinationCity}, ${app.destinationCountry}`',
);

// Fix notify signature calls that now have broken template literals as args
// Leave destination: string params — callers should pass a string

fs.writeFileSync(path, c);
console.log('patched');
