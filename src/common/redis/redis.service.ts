import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor() {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';

    this.client = new Redis(url, {
      // ✅ safe prod (Railway / Docker / Cloud)
      lazyConnect: false,
      maxRetriesPerRequest: null, // IMPORTANT pour éviter certains crash
      enableOfflineQueue: true,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });

    // ⚠️ OBLIGATOIRE : éviter "Unhandled error event" qui crash le process
    this.client.on('error', (err) => {
      this.logger.error(`Redis error: ${errMsg(err)}`);
    });

    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('ready', () => this.logger.log('Redis ready'));
    this.client.on('reconnecting', () => this.logger.warn('Redis reconnecting...'));
    this.client.on('end', () => this.logger.warn('Redis connection closed'));
  }

  getClient(): Redis {
    return this.client;
  }

  async acquireLock(key: string, ttlMs: number): Promise<boolean> {
    try {
      const res = await this.client.set(key, '1', 'PX', ttlMs, 'NX');
      return res === 'OK';
    } catch (err: unknown) {
      this.logger.error(`acquireLock failed (${key}): ${errMsg(err)}`);
      return false;
    }
  }

  async releaseLock(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (err: unknown) {
      this.logger.error(`releaseLock failed (${key}): ${errMsg(err)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
      this.logger.log('Redis connection closed gracefully');
    } catch {
      // ignore
    }
  }
}