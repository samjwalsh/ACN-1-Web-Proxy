import * as http from "http";
import * as net from "net";
import { URL } from "url";
import { BlocklistInterface } from "./Blocklist";
import { CacheInterface } from "./Cache";
import { ConsoleInterface } from "./ConsoleManager";

export class ProxyServer {
  private server: http.Server;
  private blocklist: BlocklistInterface;
  private cache: CacheInterface;
  private consoleManager: ConsoleInterface;

  constructor(
    blocklist: BlocklistInterface,
    cache: CacheInterface,
    consoleManager: ConsoleInterface,
  ) {
    this.blocklist = blocklist;
    this.cache = cache;
    this.consoleManager = consoleManager;

    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    this.server.on("connect", (req, socket, head) =>
      this.handleConnect(req, socket as net.Socket, head),
    );
  }

  public start(port: number) {
    this.server.listen(port);
  }

  private async handleRequest(
    clientReq: http.IncomingMessage,
    clientRes: http.ServerResponse,
  ) {
    const startTime = Date.now();
    const reqUrl = clientReq.url ?? "";

    // Parse into different pieces using WHATWG URL API
    let hostname = clientReq.headers.host?.split(":")[0];
    let port = 80;
    let path = reqUrl;

    try {
      const base = `http://${clientReq.headers.host ?? "localhost"}`;
      const urlObj = new URL(reqUrl, base);
      hostname = urlObj.hostname || hostname;
      port = urlObj.port
        ? Number(urlObj.port)
        : urlObj.protocol === "https:"
          ? 443
          : 80;
      path = urlObj.pathname + urlObj.search;
    } catch (e) {
      // keep fallbacks (hostname from headers, port=80, path=reqUrl)
    }

    if (!hostname) {
      clientRes.statusCode = 400;
      clientRes.end("Bad Request: Hostname missing");
      return;
    }

    try {
      // Check if blocked
      if (await this.blocklist.isBlocked(hostname)) {
        clientRes.statusCode = 403;
        clientRes.end("Blocked by Proxy");
        this.consoleManager.logRequest(
          reqUrl,
          clientReq.method ?? "GET",
          "BLOCKED",
          Date.now() - startTime,
        );
        return;
      }

      // Check if cached
      if (clientReq.method === "GET") {
        const cached = await this.cache.get(reqUrl);
        if (cached) {
          clientRes.writeHead(200, {
            ...cached.headers,
            "X-Proxy-Cache": "HIT",
          });
          clientRes.end(cached.body);
          this.consoleManager.logRequest(
            reqUrl,
            "GET",
            "CACHE HIT",
            Date.now() - startTime,
          );
          return;
        }
      }

      // Forward Request
      const options: http.RequestOptions = {
        hostname,
        port,
        path,
        method: clientReq.method,
        headers: clientReq.headers,
      };

      const proxyReq = http.request(options, (proxyRes) => {
        const chunks: Buffer[] = [];

        // Forward headers adn status
        clientRes.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers);

        proxyRes.on("data", (chunk) => {
          chunks.push(chunk);
          clientRes.write(chunk);
        });

        proxyRes.on("end", () => {
          clientRes.end();

          // Save to cache
          if (clientReq.method === "GET" && proxyRes.statusCode === 200) {
            const body = Buffer.concat(chunks);
            this.cache.set(reqUrl, proxyRes.headers, body);
          }

          this.consoleManager.logRequest(
            reqUrl,
            clientReq.method ?? "GET",
            "MISS",
            Date.now() - startTime,
          );
        });

        proxyReq.on("error", (e) => {
          this.consoleManager.logError(
            `Proxy error to ${hostname}: ${e.message}`,
          );
          if (!clientRes.headersSent) {
            clientRes.statusCode = 502;
            clientRes.end("Bade Gateway");
          }
        });

        // Forward body data if any
        clientReq.pipe(proxyReq);
      });
    } catch (err: any) {
      this.consoleManager.logError(`Internal Proxy Error: ${err.message}`);
      if (!clientRes.headersSent) {
        clientRes.statusCode = 500;
        clientRes.end("Internal Server Error");
      }
    }
  }

  private async handleConnect(
    req: http.IncomingMessage,
    clientSocket: net.Socket,
    head: Buffer,
  ) {
    const startTime = Date.now();
    const reqUrl = req.url ?? "";
    let hostname: string | undefined;
    let portStr: string | undefined;

    try {
      const urlObj = new URL(`http://${reqUrl}`);
      hostname = urlObj.hostname;
      portStr = urlObj.port;
    } catch (e) {
      const parts = reqUrl.split(":");
      hostname = parts[0] || undefined;
      portStr = parts[1];
    }

    if (!hostname) {
      clientSocket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      clientSocket.end();
      return;
    }

    try {
      if (await this.blocklist.isBlocked(hostname)) {
        clientSocket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        clientSocket.end();
        this.consoleManager.logRequest(
          hostname,
          "CONNECT",
          "BLOCKED",
          Date.now() - startTime,
        );
        return;
      }

      // Connect to origin
      const portNum = portStr ? Number(portStr) : 443;
      const serverSocket = net.connect(portNum, hostname, () => {
        clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        serverSocket.write(head);
        serverSocket.pipe(clientSocket);
        clientSocket.pipe(serverSocket);
      });

      serverSocket.on("error", (err) => {
        this.consoleManager.logError(
          `CONNECT error to ${hostname}: ${err.message}`,
        );
        clientSocket.end();
      });

      clientSocket.on("end", () => {
        this.consoleManager.logRequest(
          reqUrl,
          "CONNECT",
          "TUNNEL CLOSED",
          Date.now() - startTime,
        );
      });

      serverSocket.on("end", () => {
        clientSocket.end();
      });
    } catch (err: any) {
      this.consoleManager.logError(
        `CONNECT Internal Proxy Error: ${err.message}`,
      );
      clientSocket.end();
    }
  }
}
