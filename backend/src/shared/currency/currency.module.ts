import { Global, Module } from '@nestjs/common';
import { CurrencyController } from './currency.controller';
import { CurrencyService } from './currency.service';

/**
 * Shared currency conversion service (exchange rate caching against ETB).
 * Global so expense-claim, per-diem, and future modules can inject it directly.
 */
@Global()
@Module({
  controllers: [CurrencyController],
  providers: [CurrencyService],
  exports: [CurrencyService],
})
export class CurrencyModule {}
