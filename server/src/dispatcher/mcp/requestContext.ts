import { AsyncLocalStorage } from "node:async_hooks";

export interface McpRequestContext {
  request: Request;
}

export const requestContext = new AsyncLocalStorage<McpRequestContext>();
