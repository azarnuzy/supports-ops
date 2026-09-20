import { cn } from "@repo/ui/lib/utils";
import {
  ArrowLeftIcon,
  CameraIcon,
  CheckCheckIcon,
  MicIcon,
  MoreVerticalIcon,
  PhoneIcon,
  PlusIcon,
  SmartphoneIcon,
  SmileIcon,
  VideoIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import WidgetBotIcon from "../../../widget/components/widget-bot-icon";

/** The doodle wallpaper Customers see in the WhatsApp app, served from the platform public dir. */
const CHAT_BACKGROUND = "/background-whatsapp.png";

type PreviewState = "conversation" | "template";

/** Mobile WhatsApp chrome so the preview reads exactly like the app Customers reply from. */
export default function PreviewCard() {
  const [state, setState] = useState<PreviewState>("conversation");

  return (
    <div className="grid gap-3 lg:sticky lg:top-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Live preview</h2>
          <p className="text-[13px] text-muted-foreground">How Customers see replies on WhatsApp</p>
        </div>
        <div
          role="tablist"
          aria-label="Preview state"
          className="inline-flex shrink-0 gap-0.5 rounded-md border bg-muted/60 p-0.5"
        >
          {(
            [
              { key: "conversation", label: "Chat" },
              { key: "template", label: "Template" },
            ] as const
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={state === option.key}
              className={cn(
                "rounded-[5px] px-2.5 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors",
                "hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
                state === option.key && "bg-background text-foreground shadow-sm dark:bg-input/60",
              )}
              onClick={() => setState(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[320px] overflow-hidden rounded-[24px] border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-3 bg-[#075e54] px-3 py-2.5 text-white dark:bg-[#1f2c34]">
          <div className="flex min-w-0 items-center gap-2.5">
            <ArrowLeftIcon className="size-4 shrink-0 text-white/80" />
            <div className="grid size-8 shrink-0 place-items-center rounded-full bg-white/20">
              <WidgetBotIcon className="size-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[14px] leading-tight font-semibold">SupportOps</p>
              <p className="text-[11px] leading-tight text-white/75">online</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-white/80">
            <VideoIcon className="size-4" />
            <PhoneIcon className="size-4" />
            <MoreVerticalIcon className="size-4" />
          </div>
        </div>

        <div
          className="relative h-[380px] bg-[#efeae2] dark:bg-[#0b141a]"
          style={{
            backgroundImage: `url(${CHAT_BACKGROUND})`,
            backgroundSize: "cover",
          }}
        >
          {/* Mutes the beige doodle wallpaper into WhatsApp's dark chat background. */}
          <div className="pointer-events-none absolute inset-0 hidden bg-[#0b141a]/90 dark:block" />
          <div className="relative flex h-full flex-col gap-1.5 overflow-y-auto p-3">
            <div className="self-center rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-medium tracking-wide text-[#54656f] uppercase dark:bg-[#182229] dark:text-[#8696a0]">
              Today
            </div>
            {state === "conversation" ? (
              <>
                <Outgoing>Hi! How can we help you today?</Outgoing>
                <Incoming>My last invoice looks wrong — can you check it?</Incoming>
                <Outgoing>Of course. I've pulled up invoice #4821 — let me take a look.</Outgoing>
              </>
            ) : (
              <Outgoing>
                Reply to this message to continue your conversation with our support team.
              </Outgoing>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 bg-[#f0f2f5] px-2 py-2 dark:bg-[#1f2c34]">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-white px-3 py-2 dark:bg-[#2a3942]">
            <SmileIcon className="size-4 shrink-0 text-[#8696a0]" />
            <span className="flex-1 truncate text-[13px] text-[#8696a0]">Message</span>
            <PlusIcon className="size-4 shrink-0 text-[#8696a0]" />
            <CameraIcon className="size-4 shrink-0 text-[#8696a0]" />
          </div>
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[#075e54] text-white dark:bg-[#00a884]">
            <MicIcon className="size-4" />
          </div>
        </div>
      </div>

      <p className="flex items-start gap-2 text-[13px] leading-relaxed text-muted-foreground">
        <SmartphoneIcon className="mt-0.5 size-3.5 shrink-0" />
        {state === "conversation"
          ? "Agent replies arrive as regular WhatsApp messages inside the 24-hour customer service window."
          : "Once the window closes, the approved supportops_reopen_conversation template reopens it — Customers continue by replying."}
      </p>
    </div>
  );
}

function Incoming({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-[80%] self-start rounded-lg rounded-tl-none bg-white px-2.5 py-1.5 text-[#111b21] shadow-sm dark:bg-[#202c33] dark:text-[#e9edef]">
      <p className="text-[13px] leading-snug">{children}</p>
      <p className="mt-0.5 text-right text-[10px] text-[#667781] dark:text-white/60">09:41</p>
    </div>
  );
}

function Outgoing({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-[80%] self-end rounded-lg rounded-tr-none bg-[#d9fdd3] px-2.5 py-1.5 text-[#111b21] shadow-sm dark:bg-[#005c4b] dark:text-[#e9edef]">
      <p className="text-[13px] leading-snug">{children}</p>
      <p className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-[#667781] dark:text-white/60">
        09:41
        <CheckCheckIcon className="size-3.5 text-[#53bdeb]" />
      </p>
    </div>
  );
}
