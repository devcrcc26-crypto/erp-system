import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { DocumentDownloadUrlQueryDto } from './document.dtos';

function validate(query: Record<string, unknown>): {
  dto: DocumentDownloadUrlQueryDto;
  errors: string[];
} {
  const dto = plainToInstance(DocumentDownloadUrlQueryDto, query);
  const errors = validateSync(dto).flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );
  return { dto, errors };
}

describe('DocumentDownloadUrlQueryDto', () => {
  it('allows omitting expiresIn (default download lifetime)', () => {
    const { dto, errors } = validate({});
    expect(errors).toEqual([]);
    expect(dto.expiresIn).toBeUndefined();
  });

  it('accepts a preview lifetime from the query string as a number', () => {
    const { dto, errors } = validate({ expiresIn: '600' });
    expect(errors).toEqual([]);
    expect(dto.expiresIn).toBe(600);
  });

  it('accepts the 3600 second maximum', () => {
    expect(validate({ expiresIn: '3600' }).errors).toEqual([]);
  });

  it.each(['3601', '0', '-5', '1.5', 'abc'])(
    'rejects expiresIn=%s',
    (value) => {
      expect(validate({ expiresIn: value }).errors.length).toBeGreaterThan(0);
    },
  );
});
