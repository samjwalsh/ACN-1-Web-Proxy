import * as readline from "readline";
import { BlocklistInterface } from "./Blocklist";
import { RPCHandler } from "./IPC";

export interface ConsoleInterface {
  logRequest(
    url: string,
    method: string,
    status: string,
    durationMs: number,
  ): void;
  logError(message: string): void;
}

export class ConsoleManager implements ConsoleInterface {
  private rl: readline.Interface;
  private blocklist: BlocklistInterface;

  constructor(blocklist: BlocklistInterface) {
    this.blocklist = blocklist;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "Proxy >_ ",
    });

    this.setupListeners();

    this.printHelp();
  }

  private setupListeners() {
    this.rl.prompt();

    this.rl
      .on("line", (line) => {
        const trimmed = line.trim();
        const parts = trimmed.split(" ");
        const command = parts[0]?.toLowerCase();
        const args = parts.slice(1);

        if (!command) {
          this.rl.prompt();
          return;
        }

        switch (command) {
          case "help":
            this.printHelp();
            break;
          case "block":
            if (args[0]) {
              this.blocklist.add(args[0]);
              console.log(`Blocked: ${args[0]}`);
            } else console.log("Usage: block <domain>");
            break;
          case "unblock":
            if (args[0]) {
              this.blocklist.remove(args[0]);
              console.log(`Unblocked: ${args[0]}`);
            } else console.log(`Usage: unblock <domain>`);
            break;
          case "list":
            console.log(`Blocked domains:`, this.blocklist.getList());
            break;
          case "":
            break;
          case "quit":
            this.rl.close();
            break;
          default:
            console.log(`Unknown command: ${command}`);
            this.printHelp();
            break;
        }
        this.rl.prompt();
      })
      .on("close", () => {
        console.log("Console closed");
        process.exit(0);
      });
  }

  private printHelp(): void {
    console.log("Available commands:");
    console.log("  help               - Show this help message");
    console.log("  block <domain>     - Add a domain to the blocklist");
    console.log("  unblock <domain>   - Remove a domain from the blocklist");
    console.log("  list               - Show blocked domains");
    console.log("  exit, quit         - Exit the console");
    if (this.rl) this.rl.prompt(true);
  }

  public logRequest(
    url: string,
    method: string,
    status: string,
    durationMs: number,
  ): void {
    if (this.rl) {
      readline.cursorTo(process.stdout, 0);
      readline.clearLine(process.stdout, 0);
    }
    console.log(
      `[${new Date().toLocaleTimeString()}] ${method} ${url} - ${status} (${durationMs}ms)`,
    );
    if (this.rl) this.rl.prompt(true);
  }

  public logError(message: string): void {
    if (this.rl) {
      readline.cursorTo(process.stdout, 0);
      readline.clearLine(process.stdout, 0);
    }
    console.log(`[ERROR] ${message}`);
    if (this.rl) this.rl.prompt(true);
  }
}

export class ConsoleClient implements ConsoleInterface {
  private rpc: RPCHandler;

  constructor(rpc: RPCHandler) {
    this.rpc = rpc;
  }

  logRequest(
    url: string,
    method: string,
    status: string,
    durationMs: number,
  ): void {
    this.rpc.sendOneWay("LOG_REQUEST", { url, method, status, durationMs });
  }

  logError(message: string): void {
    this.rpc.sendOneWay("LOG_ERROR", { message });
  }
}
