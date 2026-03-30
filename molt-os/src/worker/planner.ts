import * as http from "http";
import {
  DraftPlan,
  RefinedPlan,
  ResearchTask,
  ResearchResult,
  PlannerInput,
  PlannerOutput,
} from "./types";
import * as readline from "readline";

export interface PlannerClientConfig {
  host: string;
  port: number;
  timeout: number;
}

export class PlannerClient {
  private config: PlannerClientConfig;
  private messageBuffer: string = "";

  constructor(config?: Partial<PlannerClientConfig>) {
    this.config = {
      host: config?.host || "localhost",
      port: config?.port || 3001,
      timeout: config?.timeout || 60000,
      ...config,
    };
  }

  async sendRequest(input: PlannerInput): Promise<PlannerOutput> {
    return new Promise((resolve, reject) => {
      const requestData = JSON.stringify({
        type: "PLAN_REQUEST",
        taskId: input.taskId,
        payload: {
          draftPlan: input.draftPlan,
          context: input.context,
          constraints: input.constraints,
        },
      });

      const options: http.RequestOptions = {
        hostname: this.config.host,
        port: this.config.port,
        path: "/plan",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(requestData),
        },
        timeout: this.config.timeout,
      };

      const req = http.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            const response = JSON.parse(data);
            resolve(response as PlannerOutput);
          } catch (error) {
            reject(new Error(`Failed to parse planner response: ${(error as Error).message}`));
          }
        });
      });

      req.on("error", (error) => {
        reject(error);
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Planner request timed out"));
      });

      req.write(requestData);
      req.end();
    });
  }

  async sendResearchRequest(task: ResearchTask): Promise<ResearchResult> {
    return new Promise((resolve, reject) => {
      const requestData = JSON.stringify({
        type: "RESEARCH_REQUEST",
        taskId: task.id,
        payload: {
          query: task.query,
          areas: task.areas,
          depth: task.depth,
        },
      });

      const options: http.RequestOptions = {
        hostname: this.config.host,
        port: this.config.port,
        path: "/research",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(requestData),
        },
        timeout: this.config.timeout,
      };

      const req = http.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            const response = JSON.parse(data);
            resolve(response as ResearchResult);
          } catch (error) {
            reject(new Error(`Failed to parse research response: ${(error as Error).message}`));
          }
        });
      });

      req.on("error", (error) => {
        reject(error);
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Research request timed out"));
      });

      req.write(requestData);
      req.end();
    });
  }

  async sendShutdown(): Promise<void> {
    return new Promise((resolve, reject) => {
      const options: http.RequestOptions = {
        hostname: this.config.host,
        port: this.config.port,
        path: "/shutdown",
        method: "POST",
      };

      const req = http.request(options, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`Shutdown failed with status ${res.statusCode}`));
        }
      });

      req.on("error", (error) => {
        reject(error);
      });

      req.end();
    });
  }

  setHost(host: string): void {
    this.config.host = host;
  }

  setPort(port: number): void {
    this.config.port = port;
  }
}

export class PlannerHttpServer {
  private server: http.Server | null = null;
  private handlers: Map<string, (payload: unknown) => Promise<unknown>> = new Map();

  constructor(private port: number = 3001) {}

  registerHandler(type: string, handler: (payload: unknown) => Promise<unknown>): void {
    this.handlers.set(type, handler);
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer(async (req, res) => {
        if (req.method === "POST") {
          let body = "";

          req.on("data", (chunk) => {
            body += chunk.toString();
          });

          req.on("end", async () => {
            try {
              const message = JSON.parse(body);
              const handler = this.handlers.get(message.type);

              if (handler) {
                const result = await handler(message.payload);
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify(result));
              } else {
                res.writeHead(404, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Handler not found" }));
              }
            } catch (error) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: (error as Error).message }));
            }
          });
        } else {
          res.writeHead(405, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Method not allowed" }));
        }
      });

      this.server.listen(this.port, () => {
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

export const plannerClient = new PlannerClient();
