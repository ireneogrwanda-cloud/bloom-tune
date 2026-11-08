import { describe, expect, it } from "vitest";
import { botDb, withBotDatabase } from "./bot-context.server";

describe("request-scoped assistant database access", () => {
  it("keeps concurrent users isolated", async () => {
    const first = { userId: "user-one" };
    const second = { userId: "user-two" };
    const readFirst = withBotDatabase(first, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return botDb<typeof first>().userId;
    });
    const readSecond = withBotDatabase(second, async () => botDb<typeof second>().userId);
    await expect(Promise.all([readFirst, readSecond])).resolves.toEqual(["user-one", "user-two"]);
  });

  it("refuses access outside a signed-in request context", () => {
    expect(() => botDb()).toThrow("signed-in request");
  });
});
