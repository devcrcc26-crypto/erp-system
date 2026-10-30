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
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentCompany } from '../../../../shared/decorators/current-company.decorator';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { assertPermissionOrSupervisor } from '../../../../shared/org/team-scope.util';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../../shared/permissions/require-any-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { ImportCommitResponseDto } from '../../../hr-shared/application/dtos/hr-import.dtos';
import { FlightImportPreviewResponseDto } from '../../application/dtos/flight-import.dtos';
import {
  ListFlightApplicationsDto,
  SubmitFlightApplicationDto,
  UpdateFlightApplicationDto,
} from '../../application/dtos/flight.dtos';
import { FlightApplicationPdfService } from '../../application/services/flight-application-pdf.service';
import { FlightImportService } from '../../application/services/flight-import.service';
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

  if (typeof next.isInternational === 'string') {
    next.isInternational =
      next.isInternational === 'true' || next.isInternational === '1';
  }

  delete next.accommodationRequired;
  delete next.accommodationDetails;
  delete next.perDiemRequired;

  for (const key of [
    'returnDate',
    'notes',
    'linkedBusinessTripId',
    'siteAssignmentId',
  ] as const) {
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
  { module: 'flight', action: 'view' },
  { module: 'flight', action: 'create' },
)
@Controller('hr/flight-applications')
export class FlightController {
  constructor(
    private readonly flightService: FlightService,
    private readonly flightApplicationPdfService: FlightApplicationPdfService,
    private readonly flightImportService: FlightImportService,
    private readonly permissionService: PermissionService,
    private readonly prisma: PrismaService,
  ) {}

  private importCtx(user: AuthenticatedUser): {
    companyId: string;
    userId: string;
  } {
    return { companyId: user.companyId, userId: user.userId };
  }

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
        notes: { type: 'string' },
        linkedBusinessTripId: { type: 'string' },
        siteAssignmentId: { type: 'string' },
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
    // Multipart nested passengers arrive as a JSON string - parse before validate.
    const dto = await parseFlightSubmitDto(body ?? {});
    return this.flightService.submitApplication(
      dto,
      files ?? [],
      companyId,
      user.userId,
    );
  }

  @Get()
  // Module permission, or a supervisor viewing their team's records.
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'List flight applications (company-wide for hr.view/flight.manage; own otherwise)',
  })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: ListFlightApplicationsDto,
  ): Promise<unknown> {
    await assertPermissionOrSupervisor(
      this.permissionService,
      this.prisma,
      user.userId,
      companyId,
      [
        { module: 'flight', action: 'view' },
        { module: 'flight', action: 'create' },
      ],
    );
    return this.flightService.listApplications(query, companyId, user.userId);
  }

  @Get(':id/passengers/import/template')
  @ApiOperation({
    summary: 'Download passenger import template for one flight application',
  })
  async downloadApplicationImportTemplate(): Promise<StreamableFile> {
    const buffer =
      await this.flightImportService.buildApplicationTemplate();
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition:
        'attachment; filename="flight-passengers-import-template.xlsx"',
    });
  }

  @Post(':id/passengers/import/preview')
  @ApiOperation({
    summary: 'Validate passenger import for one flight application without writing',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  previewApplicationImport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<FlightImportPreviewResponseDto> {
    return this.flightImportService.previewApplicationImport(
      id,
      this.importCtx(user),
      file,
    );
  }

  @Post(':id/passengers/import')
  @ApiOperation({
    summary: 'Import passengers into one DRAFT flight application',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  commitApplicationImport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ImportCommitResponseDto> {
    return this.flightImportService.commitApplicationImport(
      id,
      this.importCtx(user),
      file,
    );
  }

  @Get(':id')
  @RequireAnyPermission(
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

  @Patch(':id')
  @ApiOperation({
    summary:
      'Edit your own draft or returned flight application (saves only; resubmit from Approvals)',
  })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateFlightApplicationDto,
  ): Promise<unknown> {
    return this.flightService.updateApplication(id, dto, companyId, user.userId);
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
  @RequireAnyPermission({ module: 'flight', action: 'manage' })
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
  @RequireAnyPermission({ module: 'flight', action: 'manage' })
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

  @Delete(':id/tickets/combined')
  @RequireAnyPermission({ module: 'flight', action: 'manage' })
  @ApiOperation({
    summary: 'Remove combined ticket and reset passenger acknowledgements (HR)',
  })
  removeCombinedTicket(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.flightService.removeCombinedTicket(
      id,
      companyId,
      user.userId,
    );
  }

  @Delete(':id/passengers/:passengerId/ticket')
  @RequireAnyPermission({ module: 'flight', action: 'manage' })
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
    return this.flightService.removePassengerTicket(
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
    return this.flightService.acknowledgeTicket(
      id,
      passengerId,
      companyId,
      user.userId,
    );
  }

  @Get(':id/pdf')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Download flight application as PDF' })
  @ApiProduces('application/pdf')
  async downloadPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
  ): Promise<StreamableFile> {
    await assertPermissionOrSupervisor(
      this.permissionService,
      this.prisma,
      user.userId,
      companyId,
      [
        { module: 'flight', action: 'view' },
        { module: 'flight', action: 'create' },
      ],
    );
    // Same visibility as the detail page (owner, approver, team, or manager).
    await this.flightService.getApplication(id, companyId, user.userId);
    const file = await this.flightApplicationPdfService.getPdf(id, companyId);
    return new StreamableFile(file.buffer, {
      type: file.mimeType,
      disposition: contentDisposition('inline', file.filename),
    });
  }
}

function contentDisposition(kind: 'inline' | 'attachment', filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
