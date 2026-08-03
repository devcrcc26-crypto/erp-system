import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
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
        'isInternational',
        'origin',
        'destination',
        'departureDate',
        'purpose',
        'ticketClass',
        'accommodationRequired',
        'perDiemRequired',
        'passengers',
      ],
      properties: {
        tripType: { type: 'string', enum: ['ONE_WAY', 'ROUND_TRIP'] },
        isInternational: { type: 'boolean' },
        origin: { type: 'string' },
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
          description: 'JSON array of FlightPassengerInputDto',
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
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: SubmitFlightApplicationDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<unknown> {
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
      'Attach a combined ticket covering all passengers (HR viewers only)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  attachCombinedTicket(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<unknown> {
    return this.flightService.attachCombinedTicket(
      id,
      file,
      companyId,
      user.userId,
    );
  }

  @Post(':id/passengers/:passengerId/ticket')
  @ApiOperation({
    summary:
      'Attach an individual ticket for a specific passenger (HR viewers only)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  attachPassengerTicket(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Param('passengerId') passengerId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<unknown> {
    return this.flightService.attachPassengerTicket(
      id,
      passengerId,
      file,
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
