import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { PaginationMeta } from '../dtos/pagination-query.dto';

interface EnvelopeResponse<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

function isEnvelope(value: unknown): value is EnvelopeResponse<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    (value as EnvelopeResponse<unknown>).success === true
  );
}

function isPaginatedResult(
  value: unknown,
): value is { data: unknown; meta: PaginationMeta } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    'meta' in value &&
    typeof (value as { meta: unknown }).meta === 'object'
  );
}

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<EnvelopeResponse<unknown> | StreamableFile> {
    return next.handle().pipe(
      map((value: unknown) => {
        if (value instanceof StreamableFile) {
          return value;
        }

        if (isEnvelope(value)) {
          return value;
        }

        if (isPaginatedResult(value)) {
          return {
            success: true as const,
            data: value.data,
            meta: value.meta,
          };
        }

        return {
          success: true as const,
          data: value,
        };
      }),
    );
  }
}
