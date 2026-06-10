import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { requestContextStorage } from './request-context';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const correlationId =
      (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID();

    req.headers['x-correlation-id'] = correlationId;

    const store = {
      correlationId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };

    requestContextStorage.run(store, () => next());
  }
}
