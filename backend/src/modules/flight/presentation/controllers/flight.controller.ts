import {
  BadRequestException,
  Body,
  Controller,
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
  ListFlightApplicationsDto,
  SubmitFlightApplicationDto,
} from '../../application/dtos/flight.dtos';
import { FlightService } from '../../application/services/flight.service';

/**
 * Coerces multipart form fields (all strings) into typed submit payload shape.
 */
function normalizeFlightSubmitBody(
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
    'isInternational',
    'accommodationRequired',
    'perDiemRequired',
  ] as const) {
    const value = next[key];
    if (typeof value === 'string') {
      next[key] = value === 'true' || value === '1';
    }
  }

  for (const key of ['returnDate', 'notes', 'accommodationDetails'] as const) {
    if (next[key] === '') {
      next[key] = undefined;
    }
  }

  delete next.files;
  return next;
}

/**
 * Validates a normalized submit body against SubmitFlightApplicationDto.
 */
async function parseFlightSubmitDto(
  body: Record<string, unknown>,
): Promise<SubmitFlightApplicationDto> {
  const dto = plainToInstance(
    SubmitFlightApplicationDto,
    normalizeFlightSubmitBody(body),
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

@ApiTags('HR Flight Applications')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
  { module: 'hr', action: 'view' },
  { module: 'flight', action: 'view' },
  { module: 'flight', action: 'create' },
)
@Controller('hr/flight-applications')
export class FlightController {
  constructor(private readonly flightService: FlightService) {}

  @Get('selectable-passengers')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Get employees the caller may include as flight passengers',
  })
  getSelectablePassengers(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.flightService.getSelectablePassengers(
      companyId,
      user.userId,
    );
  }

  @Get('count')
  @ApiOperation({
    summary:
      'Count flight applications needing ticket booking (HR Pending My Action badge)',
  })
  countNeedsTicket(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query('needsTicket') needsTicket?: string,
  ): Promise<{ total: number }> {
    return this.flightService.countNeedsTicket(
      companyId,
      user.userId,
      needsTicket === 'true',
    );
  }

  @Post()
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Submit a flight application (authenticated user, own record)',
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      type: 'object',
      required: [
        'tripType',
        'originCountry',
        'originCity',
        'destination',
        'departureDate',
        'purpose',
        'ticketClass',
        'passengers',
      ],
      properties: {
        tripType: { type: 'string', enum: ['ONE_WAY', 'ROUND_TRIP'] },
        isInternational: { type: 'boolean' },
        originCountry: { type: 'string' },
        originCity: { type: 'string' },
        destination: { type: 'string' },
        departureDate: { type: 'string', format: 'date' },
        returnDate: { type: 'string', format: 'date' },
        purpose: { type: 'string' },
        ticketClass: { type: 'string', enum: ['ECONOMY', 'BUSINESS'] },
        accommodationRequired: { type: 'boolean' },
        accommodationDetails: { type: 'string' },
        perDiemRequired: { type: 'boolean' },
        notes: { type: 'string' },
        passengers: {
          type: 'string',
          description: 'JSON array of FlightPassengerDto',
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
    const dto = await parseFlightSubmitDto(body ?? {});
    return this.flightService.submitApplication(
      dto,
      files ?? [],
      companyId,
      user.userId,
    );
  }

  @Get()
  @ApiOperation({
    summary:
      'List flight applications (company-wide for hr.view/flight.manage; own otherwise)',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: ListFlightApplicationsDto,
  ): Promise<unknown> {
    return this.flightService.listApplications(query, companyId, user.userId);
  }

  @Get(':id')
  @RequireAnyPermission(
    { module: 'hr', action: 'view' },
    { module: 'flight', action: 'view' },
    { module: 'flight', action: 'create' },
    { module: 'approvals', action: 'view' },
  )
  @ApiOperation({
    summary: 'Get a flight application with full passenger and approval details',
  })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.flightService.getApplication(id, companyId, user.userId);
  }

  @Patch(':id/cancel')
  @ApiOperation({
    summary: 'Cancel a draft or submitted flight application (submitter only)',
  })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.flightService.cancelApplication(id, companyId, user.userId);
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
    return this.flightService.attachCombinedTicket(
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
    return this.flightService.attachPassengerTicket(
      id,
      passengerId,
      files ?? [],
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
    return this.flightService.acknowledgeTicket(
      id,
      passengerId,
      companyId,
      user.userId,
    );
  }
}
