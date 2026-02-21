export type RequestMessage = {
  id: string; // unique ID to match responses
  type:
    | "CACHE_GET"
    | "CACHE_SET"
    | "BLOCKLIST_CHECK"
    | "LOG_REQUEST"
    | "LOG_ERROR";
  payload: any;
};

// Message sent in reply to a RequestMessage
export type ResponseMessage = {
  id: string;
  success: boolean;
  data?: any;
  error?: string;
};

export class RPCHandler {
  // Store pending requests and their promise handlers
  private pendingRequests = new Map<
    string,
    { resolve: (val: any) => void; reject: (err: any) => void }
  >();

  constructor() {
    // Listen for requests from the master process
    process.on("message", (msg: ResponseMessage) => {
      // If the response matches a pending request, resolve/reject its promise
      if (this.pendingRequests.has(msg.id)) {
        const message = this.pendingRequests.get(msg.id);
        if (!message) return;
        const { resolve, reject } = message;
        this.pendingRequests.delete(msg.id);
        if (msg.success) resolve(msg.data);
        else reject(new Error(msg.error));
      }
    });
  }

  // Send a message to the main process
  public send(type: RequestMessage["type"], payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
      // unique id
      const id = Math.random().toString(36);
      // Store promise handlers for later resolution
      this.pendingRequests.set(id, { resolve, reject });

      // Send the request via IPC
      if (process.send) process.send({ id, type, payload });
      else reject(new Error("IPC not available"));
    });
  }

  public sendOneWay(type: RequestMessage["type"], payload: any) {
    if (process.send) process.send({ id: "ONEWAY", type, payload });
  }
}
