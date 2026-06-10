import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PasswordService {
  /**
   * Verifies a plain password against a bcrypt password hash.
   */
  async verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  /**
   * Hashes a password with bcrypt (12 rounds).
   */
  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, 12);
  }
}
