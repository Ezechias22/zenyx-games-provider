import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService {
  private client: Redis;

  constructor() {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    this.client = new Redis(url, { maxRetriesPerRequest: 2 });
  }

  getClient() {
    return this.client;
  }

  async acquireLock(key: string, ttlMs: number): Promise<boolean> {
    const res = await this.client.set(key, '1', 'PX', ttlMs, 'NX');
    return res === 'OK';
  }

  async releaseLock(key: string): Promise<void> {
    await this.client.del(key);
  }
}
