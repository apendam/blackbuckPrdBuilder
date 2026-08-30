import { ChatMessage as ChatMessageType } from "@/lib/types";

function TruckAvatar() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bb-red">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path
          d="M3 16V7a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9M3 16h11M3 16a2 2 0 1 0 4 0M14 16a2 2 0 1 0 4 0M14 10h4l3 3v3h-2"
          stroke="white"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function ChatMessage({ message }: { message: ChatMessageType }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[70%] rounded-2xl rounded-tr-sm bg-bb-text px-4 py-3 text-sm leading-relaxed text-bb-bg whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <TruckAvatar />
      <div className="max-w-[75%] rounded-lg border-l-[3px] border-bb-red bg-bb-surface px-4 py-3">
        <div className="mb-1 text-[10px] font-semibold tracking-widest text-bb-red">
          PRD BUILDER
        </div>
        <div className="text-sm leading-relaxed text-bb-text whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    </div>
  );
}
