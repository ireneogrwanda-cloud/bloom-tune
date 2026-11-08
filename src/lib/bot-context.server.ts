import { AsyncLocalStorage } from "node:async_hooks";

// The assistant runs only inside an authenticated server-function call. The
// request-local client carries the user's bearer token, so every query is RLS
// scoped and concurrent requests can never share credentials.
const requestDatabase = new AsyncLocalStorage<unknown>();

export function botDb<T = any>(): T {
  const client = requestDatabase.getStore();
  if (!client) {
    throw new Error("Assistant database access requires a signed-in request.");
  }
  return client as T;
}

export function withBotDatabase<T>(client: unknown, callback: () => Promise<T>): Promise<T> {
  return requestDatabase.run(client, callback);
}
