import { normaliseEthiopianPhone, normalisePhoneInput } from './ethiopian-phone.util';

describe('normaliseEthiopianPhone', () => {
  it.each([
    ['+251 911 234 567', '+251911234567'],
    ['251911234567', '+251911234567'],
    ['0911234567', '+251911234567'],
    ['911234567', '+251911234567'],
    ['(+251)911234567', '+251911234567'],
    ['(+2519)11234567', '+251911234567'],
    ['0711-234-567', '+251711234567'],
    ['+251 11 551 2345', '+251115512345'],
    ['0115512345', '+251115512345'],
  ])('normalises %s', (input, expected) => {
    expect(normaliseEthiopianPhone(input)).toEqual({
      ok: true,
      value: expected,
      fixedDoubledPrefix: false,
    });
  });

  it('repairs the doubled (+2519) template prefix', () => {
    expect(normaliseEthiopianPhone('(+2519)911234567')).toEqual({
      ok: true,
      value: '+251911234567',
      fixedDoubledPrefix: true,
    });
    expect(normaliseEthiopianPhone('(+2519)711234567')).toEqual({
      ok: true,
      value: '+251711234567',
      fixedDoubledPrefix: true,
    });
  });

  it.each([
    ['(+2519)511234567'],
    ['+251 2211 23456'],
    ['0221123456'],
    ['12345'],
    ['+86 138 0013 8000'],
    ['call 0911234567'],
    [''],
  ])('rejects %s', (input) => {
    expect(normaliseEthiopianPhone(input)).toEqual({ ok: false });
  });

  it('rejects null and undefined', () => {
    expect(normaliseEthiopianPhone(null)).toEqual({ ok: false });
    expect(normaliseEthiopianPhone(undefined)).toEqual({ ok: false });
  });
});

describe('normalisePhoneInput', () => {
  it('normalises Ethiopian numbers and passes other values through', () => {
    expect(normalisePhoneInput({ value: ' 0911234567 ' })).toBe('+251911234567');
    expect(normalisePhoneInput({ value: '+86 138 0013 8000' })).toBe('+86 138 0013 8000');
    expect(normalisePhoneInput({ value: '   ' })).toBe('');
    expect(normalisePhoneInput({ value: undefined })).toBeUndefined();
  });
});
