import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentCompany } from '../decorators/current-company.decorator';
import { DelegatePermissionCheck } from '../permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { CurrencyService } from './currency.service';

@ApiTags('Currency')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@DelegatePermissionCheck()
@Controller('currency')
export class CurrencyController {
  constructor(private readonly currencyService: CurrencyService) {}

  @Get('rates')
  @ApiOperation({
    summary: 'Current USD/CNY exchange rates against ETB (cached daily)',
  })
  getRates(
    @CurrentCompany() companyId: string,
  ): Promise<Record<string, number>> {
    return this.currencyService.getAllRates(companyId);
  }
}
