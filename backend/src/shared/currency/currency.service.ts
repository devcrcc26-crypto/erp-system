import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { SupportedCurrency } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

interface FrankfurterV2RateResponse {
  date: string;
  base: string;
  quote: string;
  rate: number;
}

/**
 * Daily-cached exchange rates against ETB, sourced from the Frankfurter v2 API.
 * ETB pairs are covered via NBE (and other) providers on api.frankfurter.dev —
 * the legacy api.frankfurter.app ECB feed does not include ETB.
 */
@Injectable()
export class CurrencyService {
  private readonly logger = new Logger(CurrencyService.name);
  private readonly FRANKFURTER_URL = 'https://api.frankfurter.dev/v2';

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the conversion rate from `fromCurrency` to `toCurrency`, cached per day.
   */
  async getRate(
    fromCurrency: SupportedCurrency,
    toCurrency: SupportedCurrency,
    companyId: string,
  ): Promise<number> {
    if (fromCurrency === toCurrency) {
      return 1;
    }

    const today = this.todayDateOnly();

    const cached = await this.prisma.exchangeRate.findFirst({
      where: { companyId, fromCurrency, toCurrency, fetchedAt: today },
    });
    if (cached) {
      return Number(cached.rate);
    }

    const rate = await this.fetchFromFrankfurter(fromCurrency, toCurrency);

    await this.prisma.exchangeRate.upsert({
      where: {
        companyId_fromCurrency_toCurrency_fetchedAt: {
          companyId,
          fromCurrency,
          toCurrency,
          fetchedAt: today,
        },
      },
      create: {
        id: randomUUID(),
        companyId,
        fromCurrency,
        toCurrency,
        rate,
        fetchedAt: today,
      },
      update: { rate },
    });

    return rate;
  }

  /**
   * Converts an amount in `fromCurrency` to ETB using the daily cached rate.
   */
  async convertToETB(
    amount: number,
    fromCurrency: SupportedCurrency,
    companyId: string,
  ): Promise<number> {
    if (fromCurrency === SupportedCurrency.ETB) {
      return amount;
    }
    const rate = await this.getRate(
      fromCurrency,
      SupportedCurrency.ETB,
      companyId,
    );
    return amount * rate;
  }

  /**
   * Convenience lookup of USD and CNY rates against ETB (for form dropdowns).
   */
  async getAllRates(companyId: string): Promise<Record<string, number>> {
    const [usdRate, cnyRate] = await Promise.all([
      this.getRate(SupportedCurrency.USD, SupportedCurrency.ETB, companyId),
      this.getRate(SupportedCurrency.CNY, SupportedCurrency.ETB, companyId),
    ]);
    return { USD: usdRate, CNY: cnyRate, ETB: 1 };
  }

  private async fetchFromFrankfurter(
    from: SupportedCurrency,
    to: SupportedCurrency,
  ): Promise<number> {
    try {
      const res = await fetch(`${this.FRANKFURTER_URL}/rate/${from}/${to}`);
      if (!res.ok) {
        throw new Error(`Frankfurter responded with status ${res.status}`);
      }
      const data = (await res.json()) as FrankfurterV2RateResponse;
      if (typeof data.rate !== 'number' || !Number.isFinite(data.rate)) {
        throw new Error(`No rate returned for ${from}->${to}`);
      }
      return data.rate;
    } catch (error: unknown) {
      this.logger.error(
        `Failed to fetch exchange rate ${from}->${to}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new BadGatewayException(
        'Unable to fetch current exchange rates. Please try again shortly.',
      );
    }
  }

  private todayDateOnly(): Date {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }
}
