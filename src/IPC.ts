export type RequestMessage = {
  id: string;
  type:
    | "CACHE_GET"
    | "CACHE_SET"
    | "BLOCKLIST_CHECK"
    | "LOG_REQUEST"
    | "LOG_ERROR";
  payload: any;
};

export type ResponseMessage = {
  id: string;
  success: boolean;
  data?: any;
  error?: string;
};

export class RPCHandler {
  private pendingRequests = new Map<
    string,
    { resolve: (val: any) => void; reject: (err: any) => void }
  >();

  constructor() {
    process.on("message", (msg: ResponseMessage) => {
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

  public send(type: RequestMessage["type"], payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36);
      this.pendingRequests.set(id, { resolve, reject });

      if (process.send) process.send({ id, type, payload });
      else reject(new Error("IPC not available"));
    });
  }

  public sendOneWay(type: RequestMessage["type"], payload: any) {
    if (process.send) process.send({ id: "ONEWAY", type, payload });
  }
}
