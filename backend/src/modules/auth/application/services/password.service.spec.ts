import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes and verifies a password', async () => {
    const hash = await service.hash('SecurePass@123');
    expect(hash).not.toBe('SecurePass@123');
    await expect(service.verify('SecurePass@123', hash)).resolves.toBe(true);
  });

  it('rejects an invalid password', async () => {
    const hash = await service.hash('SecurePass@123');
    await expect(service.verify('WrongPassword', hash)).resolves.toBe(false);
  });
});
