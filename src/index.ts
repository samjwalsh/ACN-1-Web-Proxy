import * as cluster from "cluster";
import * as os from "os";
import { RequestMessage, RPCHandler } from "./IPC";
import { Blocklist, BlocklistClient } from "./Blocklist";
import { ConsoleClient, ConsoleManager } from "./ConsoleManager";
import { Cache, CacheClient } from "./Cache";
import { ProxyServer } from "./ProxyServer";

const port = 8080;

if (cluster.isPrimary) {
  // This is the main process, needs to spawn the rest and manage the console.

  const cpus = os.cpus();
  console.log(`${cpus.length} cores`);

  for (const cpu of cpus) {
    cluster.fork();
  }

  const blocklist = new Blocklist();
  const cache = new Cache();
  const consoleManager = new ConsoleManager(blocklist);

  cluster.on("message", (worker: any, message: RequestMessage) => {
    if (!message || !message.type) return;

    const { id, type, payload } = message;
    const sendResponse = (data: any = null, error: string | null = null) => {
      if (id === "ONEWAY") return;

      worker.send({
        id,
        success: !error,
        data,
        error,
      });
    };

    try {
      switch (type) {
        case "BLOCKLIST_CHECK":
          const isBlocked = blocklist.isBlocked(payload as string);
          sendResponse(isBlocked);
          break;
        case "CACHE_GET":
          const cached = cache.get(payload as string);
          sendResponse(cached);
          break;
        case "CACHE_SET":
          let body = payload.body;
          if (body && body.type === "Buffer" && Array.isArray(body.data)) {
            body = Buffer.from(body.data);
          }
          cache.set(payload.url, payload.headers, body);
          sendResponse();
          break;
        case "LOG_REQUEST":
          consoleManager.logRequest(
            payload.url,
            payload.method,
            payload.status,
            payload.durationMs,
          );
          sendResponse();
          break;
        case "LOG_ERROR":
          consoleManager.logError(payload.message);
          sendResponse();
          break;
        default:
          console.error(`Unknown message type: ${type}`);
      }
    } catch (err: any) {
      sendResponse(null, err.message);
    }
  });

  cluster.on("exit", (worker: any) => {
    consoleManager.logError(`Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });
} else {
  // This is the code a worker will run
  const rpc = new RPCHandler();
  const blocklistClient = new BlocklistClient(rpc);
  const cacheClient = new CacheClient(rpc);
  const consoleClient = new ConsoleClient(rpc);

  const server = new ProxyServer(blocklistClient, cacheClient, consoleClient);
  server.start(port);
}
