import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const PREVIEW_TTL_SECONDS = 600;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

/**
 * Preview-session store for attendance import.
 *
 * Uses Redis (REDIS_HOST / REDIS_PORT) when REDIS_ENABLED=true; otherwise an
 * in-memory Map with the same TTL semantics so local/dev works without Redis.
 * The project does not use @nestjs/cache-manager or Upstash.
 */
@Injectable()
export class AttendancePreviewCache implements OnModuleDestroy {
  private readonly logger = new Logger(AttendancePreviewCache.name);
  private readonly memory = new Map<string, CacheEntry<unknown>>();
  private readonly redis: Redis | null;
  private readonly redisEnabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.redisEnabled = this.config.get<string>('REDIS_ENABLED') === 'true';
    if (this.redisEnabled) {
      this.redis = new Redis({
        host: this.config.get<string>('REDIS_HOST', 'localhost'),
        port: this.config.get<number>('REDIS_PORT', 6379),
        maxRetriesPerRequest: 1,
        lazyConnect: true,
      });
      this.redis.connect().catch((error: unknown) => {
        this.logger.warn(
          `Redis connect failed for attendance preview cache: ${
            error instanceof Error ? error.message : String(error)
          }. Falling back to in-memory.`,
        );
      });
    } else {
      this.redis = null;
      this.logger.log(
        'REDIS_ENABLED=false - attendance preview cache uses in-memory store',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit().catch(() => undefined);
    }
  }

  /**
   * Stores a preview payload for 10 minutes.
   */
  async set<T>(key: string, value: T): Promise<void> {
    if (await this.tryRedisSet(key, value)) {
      return;
    }
    this.memory.set(key, {
      value,
      expiresAt: Date.now() + PREVIEW_TTL_SECONDS * 1000,
    });
  }

  /**
   * Returns a preview payload or null when missing/expired.
   */
  async get<T>(key: string): Promise<T | null> {
    const fromRedis = await this.tryRedisGet<T>(key);
    if (fromRedis !== undefined) {
      return fromRedis;
    }

    const entry = this.memory.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return entry.value as T;
  }

  /**
   * Deletes a preview payload after confirm (or on expiry cleanup).
   */
  async del(key: string): Promise<void> {
    if (this.redis && this.redis.status === 'ready') {
      try {
        await this.redis.del(key);
      } catch (error: unknown) {
        this.logger.warn(
          `Redis DEL failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    this.memory.delete(key);
  }

  private async tryRedisSet<T>(key: string, value: T): Promise<boolean> {
    if (!this.redis || this.redis.status !== 'ready') {
      return false;
    }
    try {
      await this.redis.set(
        key,
        JSON.stringify(value),
        'EX',
        PREVIEW_TTL_SECONDS,
      );
      return true;
    } catch (error: unknown) {
      this.logger.warn(
        `Redis SET failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  private async tryRedisGet<T>(key: string): Promise<T | null | undefined> {
    if (!this.redis || this.redis.status !== 'ready') {
      return undefined;
    }
    try {
      const raw = await this.redis.get(key);
      if (raw === null) {
        return null;
      }
      return JSON.parse(raw) as T;
    } catch (error: unknown) {
      this.logger.warn(
        `Redis GET failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return undefined;
    }
  }
}
