import { RPCHandler } from "./IPC";

export interface BlocklistInterface {
  isBlocked(host: string): Promise<boolean> | boolean;
  add(host: string): void;
  remove(host: string): void;
  getList(): string[];
}

export class Blocklist implements BlocklistInterface {
  private blockedHosts: Set<string>;

  constructor() {
    this.blockedHosts = new Set<string>();
  }

  public isBlocked(host: string): Promise<boolean> | boolean {
    return this.blockedHosts.has(host);
  }

  public add(host: string): void {
    this.blockedHosts.add(host);
  }

  public remove(host: string): void {
    this.blockedHosts.delete(host);
  }

  public getList(): string[] {
    return Array.from(this.blockedHosts);
  }
}

export class BlocklistClient implements BlocklistInterface {
  private rpc: RPCHandler;

  constructor(rpc: RPCHandler) {
    this.rpc = rpc;
  }

  public async isBlocked(host: string): Promise<boolean> {
    return this.rpc.send("BLOCKLIST_CHECK", host);
  }

  public add(host: string): void {
    throw new Error("Method not supported in Worker.");
  }
  public remove(host: string): void {
    throw new Error("Method not supported in Worker.");
  }
  public getList(): string[] {
    throw new Error("Method not supported in Worker.");
  }
}
