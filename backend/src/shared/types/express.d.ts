import { AuthenticatedUser } from './jwt-payload.type';

declare global {
  namespace Express {
    interface User extends AuthenticatedUser {}
  }
}

export {};
