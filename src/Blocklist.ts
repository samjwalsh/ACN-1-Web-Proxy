import { RPCHandler } from "./IPC";

export interface BlocklistInterface {
  isBlocked(host: string): Promise<boolean> | boolean;
  add(host: string): void;
  remove(host: string): void;
  getList(): string[];
}

// Fairly self explanatory
export class Blocklist implements BlocklistInterface {
  private blockedHosts: Set<string>;

  constructor() {
    // A set is a JS datatype which I'm sure is pretty much like an ArrayList in java however it
    // doesn't allow dupliate entries, so I don't need to write code to remove duplicates myself
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
    // We just ask the main process to tell us if the hsot is on the blocklist
    return this.rpc.send("BLOCKLIST_CHECK", host);
  }

  // Wouldn't make sense for the worker threads to be able to do this.
  // Only the console process (main process) would need to use these methods
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
