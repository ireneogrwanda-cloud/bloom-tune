import { createFileRoute } from "@tanstack/react-router";
import { ChatPanel } from "@/components/chat-panel";

export const Route = createFileRoute("/_authenticated/assistant")({
  head: () => ({
    meta: [
      { title: "Ask the assistant — My Cycle AI" },
      { name: "description", content: "Ask My Cycle AI anything about your cycle, fertile days and temperature logging." },
      { property: "og:title", content: "Ask the assistant — My Cycle AI" },
      { property: "og:description", content: "Chat with your fertility assistant about your cycle and daily temperatures." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssistantPage,
});

function AssistantPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-3 text-xl font-bold">Ask My Cycle AI</h1>
      <div className="h-[70vh] overflow-hidden rounded-2xl border bg-card shadow-sm">
        <ChatPanel />
      </div>
    </div>
  );
}
