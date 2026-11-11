import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserDto, UpdateUserDto } from './user-management.dtos';

/** lastName may be blank: the grandfather's name is often unknown. */
async function lastNameErrors(
  cls: ClassConstructor<object>,
  lastName: unknown,
): Promise<string[]> {
  const dto = plainToInstance(cls, { firstName: 'Agegnehu', middleName: 'Gelaw', lastName }) as object;
  const errors = await validate(dto);
  return errors.filter((e) => e.property === 'lastName').flatMap((e) => Object.keys(e.constraints ?? {}));
}

describe('user DTO lastName', () => {
  it.each([CreateUserDto, UpdateUserDto])('%p accepts empty, blank and missing lastName', async (cls) => {
    expect(await lastNameErrors(cls, '')).toEqual([]);
    expect(await lastNameErrors(cls, '   ')).toEqual([]);
    expect(await lastNameErrors(cls, undefined)).toEqual([]);
  });

  it.each([CreateUserDto, UpdateUserDto])('%p still validates a non-empty lastName', async (cls) => {
    expect(await lastNameErrors(cls, 'Tesfaye')).toEqual([]);
    expect(await lastNameErrors(cls, '123')).not.toEqual([]);
  });

  it('trims a blank lastName to an empty string', () => {
    const dto = plainToInstance(UpdateUserDto, { lastName: '   ' });
    expect(dto.lastName).toBe('');
  });
});
