import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { DocumentNumberService } from '../document-number.service';

describe('DocumentNumberService sequence numbers', () => {
  const companyId = 'company-1';

  let prisma: { $queryRawUnsafe: jest.Mock };
  let service: DocumentNumberService;
  let sequenceValue: number;

  beforeEach(() => {
    sequenceValue = 0;
    prisma = {
      $queryRawUnsafe: jest.fn().mockImplementation(async (sql: string) => {
        sequenceValue += 1;
        return [{ nextval: sequenceValue, sql }];
      }),
    };

    service = new DocumentNumberService(prisma as unknown as PrismaService);
  });

  it.each([
    ['nextChangeRequestNumber', /^CR-\d{4}$/],
    ['nextRiskNumber', /^RISK-\d{4}$/],
    ['nextDeliverableNumber', /^DLV-\d{4}$/],
  ] as const)(
    '%s returns two different numbers for concurrent calls',
    async (methodName, pattern) => {
      const [first, second] = await Promise.all([
        service[methodName](companyId),
        service[methodName](companyId),
      ]);

      expect(first).not.toBe(second);
      expect(first).toMatch(pattern);
      expect(second).toMatch(pattern);
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
    },
  );
});
