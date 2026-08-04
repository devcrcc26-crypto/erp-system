import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentCompany } from '../../../../shared/decorators/current-company.decorator';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../../shared/permissions/require-any-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  ListBusinessTripsDto,
  SubmitBusinessTripDto,
} from '../../application/dtos/business-trip.dtos';
import { BusinessTripService } from '../../application/services/business-trip.service';

/**
 * Coerces multipart form fields (all strings) into typed submit payload shape.
 */
function normalizeBusinessTripSubmitBody(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...body };

  if (typeof next.passengers === 'string') {
    try {
      next.passengers = JSON.parse(next.passengers) as unknown;
    } catch {
      throw new BadRequestException('Invalid passengers JSON');
    }
  }

  for (const key of [
    'accommodationRequired',
    'perDiemRequired',
  ] as const) {
    const value = next[key];
    if (typeof value === 'string') {
      next[key] = value === 'true' || value === '1';
    }
  }

  for (const key of [
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
  ] as const) {
    if (next[key] === '') {
      next[key] = undefined;
    }
  }

  delete next.files;
  return next;
}

/**
 * Validates a normalized submit body against SubmitBusinessTripDto.
 */
async function parseBusinessTripSubmitDto(
  body: Record<string, unknown>,
): Promise<SubmitBusinessTripDto> {
  const dto = plainToInstance(
    SubmitBusinessTripDto,
    normalizeBusinessTripSubmitBody(body),
  );
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length > 0) {
    throw new BadRequestException({
      message: 'Validation failed',
      details: errors.map((error) => ({
        property: error.property,
        constraints: error.constraints,
        children: error.children,
      })),
    });
  }
  return dto;
}

@ApiTags('HR Business Trips')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
  { module: 'hr', action: 'view' },
  { module: 'business-trip', action: 'view' },
  { module: 'business-trip', action: 'create' },
)
@Controller('hr/business-trips')
export class BusinessTripController {
  constructor(private readonly businessTripService: BusinessTripService) {}

  @Get('selectable-passengers')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Get employees the caller may include as business trip passengers',
  })
  getSelectablePassengers(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.businessTripService.getSelectablePassengers(
      companyId,
      user.userId,
    );
  }

  @Get('count')
  @ApiOperation({
    summary:
      'Count business trips needing ticket booking (HR Pending My Action badge)',
  })
  countNeedsTicket(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query('needsTicket') needsTicket?: string,
  ): Promise<{ total: number }> {
    return this.businessTripService.countNeedsTicket(
      companyId,
      user.userId,
      needsTicket === 'true',
    );
  }

  @Post()
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Submit a business trip (authenticated user, own record)',
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      type: 'object',
      required: [
        'tripType',
        'originCountry',
        'originCity',
        'destinationCountry',
        'destinationCity',
        'departureDate',
        'purpose',
        'ticketClass',
        'passengers',
      ],
      properties: {
        tripType: { type: 'string', enum: ['ONE_WAY', 'ROUND_TRIP'] },
        originCountry: { type: 'string' },
        originCity: { type: 'string' },
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
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', 10, { storage: memoryStorage() }),
  )
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<unknown> {
    // Multipart nested passengers arrive as a JSON string — parse before validate.
    const dto = await parseBusinessTripSubmitDto(body ?? {});
    return this.businessTripService.submitTrip(
      dto,
      files ?? [],
      companyId,
      user.userId,
    );
  }

  @Get()
  @ApiOperation({
    summary:
      'List business trips (company-wide for hr.view/flight.manage; own otherwise)',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: ListBusinessTripsDto,
  ): Promise<unknown> {
    return this.businessTripService.listTrips(query, companyId, user.userId);
  }

  @Get(':id')
  @RequireAnyPermission(
    { module: 'hr', action: 'view' },
    { module: 'business-trip', action: 'view' },
    { module: 'business-trip', action: 'create' },
    { module: 'approvals', action: 'view' },
  )
  @ApiOperation({
    summary: 'Get a business trip with full passenger and approval details',
  })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.businessTripService.getTrip(id, companyId, user.userId);
  }

  @Patch(':id/cancel')
  @ApiOperation({
    summary: 'Cancel a draft or submitted business trip (submitter only)',
  })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.businessTripService.cancelTrip(id, companyId, user.userId);
  }

  @Post(':id/tickets/combined')
  @ApiOperation({
    summary:
      'Attach combined ticket file(s) covering all passengers (HR viewers only)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', 10, { storage: memoryStorage() }),
  )
  attachCombinedTicket(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<unknown> {
    return this.businessTripService.attachCombinedTicket(
      id,
      files ?? [],
      companyId,
      user.userId,
    );
  }

  @Post(':id/passengers/:passengerId/ticket')
  @ApiOperation({
    summary:
      'Attach individual ticket file(s) for a specific passenger (HR viewers only)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', 10, { storage: memoryStorage() }),
  )
  attachPassengerTicket(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Param('passengerId') passengerId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<unknown> {
    return this.businessTripService.attachPassengerTicket(
      id,
      passengerId,
      files ?? [],
      companyId,
      user.userId,
    );
  }

  @Delete(':id/tickets/combined')
  @ApiOperation({
    summary: 'Remove combined ticket and reset passenger acknowledgements (HR)',
  })
  removeCombinedTicket(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.businessTripService.removeCombinedTicket(
      id,
      companyId,
      user.userId,
    );
  }

  @Delete(':id/passengers/:passengerId/ticket')
  @ApiOperation({
    summary:
      'Remove an individual passenger ticket and reset acknowledgement (HR)',
  })
  removePassengerTicket(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Param('passengerId') passengerId: string,
  ): Promise<unknown> {
    return this.businessTripService.removePassengerTicket(
      id,
      passengerId,
      companyId,
      user.userId,
    );
  }

  @Post(':id/passengers/:passengerId/acknowledge')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Acknowledge receipt of a ticket (passenger only)',
  })
  acknowledgeTicket(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Param('passengerId') passengerId: string,
  ): Promise<unknown> {
    return this.businessTripService.acknowledgeTicket(
      id,
      passengerId,
      companyId,
      user.userId,
    );
  }
}
