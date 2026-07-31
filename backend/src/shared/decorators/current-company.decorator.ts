import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../types/jwt-payload.type';

/**
 * Resolves the authenticated user's company id from the JWT context.
 * Never trust companyId from the request body.
 */
export const CurrentCompany = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return (request.user as AuthenticatedUser).companyId;
  },
);
