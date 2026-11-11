import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AuthenticatedUser } from '../types/jwt-payload.type';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url } = request;
    const user = request.user as AuthenticatedUser | undefined;
    const started = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse<{ statusCode: number }>();
          const duration = Date.now() - started;
          this.logger.log(
            JSON.stringify({
              method,
              path: url,
              status: response.statusCode,
              durationMs: duration,
              userId: user?.userId ?? null,
            }),
          );
        },
        error: () => {
          const duration = Date.now() - started;
          this.logger.warn(
            JSON.stringify({
              method,
              path: url,
              durationMs: duration,
              userId: user?.userId ?? null,
            }),
          );
        },
      }),
    );
  }
}
