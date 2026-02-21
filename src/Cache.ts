import { RPCHandler } from "./IPC";

export interface CachedResponse {
  headers: any;
  body: Buffer;
  timestamp: number;
}

export interface CacheInterface {
  get(
    url: string,
  ): Promise<CachedResponse | undefined> | CachedResponse | undefined;
  set(url: string, headers: any, body: Buffer): void;
}

export class Cache implements CacheInterface {
  private cache: Map<string, CachedResponse>;
  private ttlMs: number;

  constructor(ttlMs: number = 60_000) {
    // Map is just a hashmap
    this.cache = new Map();
    this.ttlMs = ttlMs;
  }

  public get(url: string): CachedResponse | undefined {
    const cached = this.cache.get(url);
    if (!cached) return undefined;

    // If the cache entry is older than the time to live, delete it
    if (Date.now() - cached.timestamp > this.ttlMs) {
      this.cache.delete(url);
      return undefined;
    }

    return cached;
  }

  public set(url: string, headers: any, body: Buffer): void {
    this.cache.set(url, {
      headers,
      body,
      timestamp: Date.now(),
    });
  }

  public clear(): void {
    this.cache.clear();
  }
}

export class CacheClient implements CacheInterface {
  private rpc: RPCHandler;
  // Same as above but just uses rpc to access the cache object

  constructor(rpc: RPCHandler) {
    this.rpc = rpc;
  }

  public async get(url: string): Promise<CachedResponse | undefined> {
    const raw = await this.rpc.send("CACHE_GET", url);
    if (!raw) return undefined;

    return {
      headers: raw.headers,
      body: Buffer.from(raw.body.data || raw.body),
      timestamp: raw.timestamp,
    };
  }

  public set(url: string, headers: any, body: Buffer): void {
    this.rpc.sendOneWay("CACHE_SET", { url, headers, body });
  }
}
