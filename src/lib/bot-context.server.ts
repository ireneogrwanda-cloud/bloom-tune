import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type UserDatabase = SupabaseClient<Database>;

// The assistant runs only inside an authenticated server-function call. The
// request-local client carries the user's bearer token, so every query is RLS
// scoped and concurrent requests can never share credentials.
const requestDatabase = new AsyncLocalStorage<UserDatabase>();

export function botDb(): UserDatabase {
  const client = requestDatabase.getStore();
  if (!client) {
    throw new Error("Assistant database access requires a signed-in request.");
  }
  return client;
}

export function withBotDatabase<T>(client: UserDatabase, callback: () => Promise<T>): Promise<T> {
  return requestDatabase.run(client, callback);
}
