import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Badge } from "@repo/ui/components/badge";
import { Bubble, BubbleContent } from "@repo/ui/components/bubble";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@repo/ui/components/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupTextarea,
} from "@repo/ui/components/input-group";
import { Item, ItemContent, ItemMedia, ItemTitle } from "@repo/ui/components/item";
import { Marker, MarkerContent } from "@repo/ui/components/marker";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@repo/ui/components/message";
import { MessageScroller, MessageScrollerContent } from "@repo/ui/components/message-scroller";
import { Separator } from "@repo/ui/components/separator";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { PriorityBadge, StatusBadge } from "@repo/ui/components/ticket-badge";
import { cn } from "@repo/ui/lib/utils";
import {
  AlarmClockIcon,
  BuildingIcon,
  CalendarIcon,
  ClockIcon,
  FileIcon,
  FilterIcon,
  FlagIcon,
  GlobeIcon,
  HistoryIcon,
  LinkIcon,
  MailIcon,
  MapPinIcon,
  MoreHorizontalIcon,
  PaperclipIcon,
  PhoneIcon,
  PinIcon,
  SearchIcon,
  SendIcon,
  SmileIcon,
  SparklesIcon,
  TagIcon,
  TypeIcon,
  UserRoundIcon,
  XIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { PlatformAppShell } from "../../../app-shell";

type ConversationStatus = "open" | "snoozed" | "closed";

type Conversation = {
  id: string;
  name: string;
  preview: string;
  time: string;
  unread: number;
  pinned: boolean;
  status: ConversationStatus;
};

const conversations: Conversation[] = [
  {
    id: "olivia",
    name: "Olivia Rhye",
    preview: "We're seeing 502 errors after the latest deploy.",
    time: "Now",
    unread: 4,
    pinned: true,
    status: "open",
  },
  {
    id: "phoenix",
    name: "Phoenix Baker",
    preview: "I was billed twice for order #8823.",
    time: "5m",
    unread: 0,
    pinned: true,
    status: "open",
  },
  {
    id: "lana",
    name: "Lana Steiner",
    preview: "I'm getting a 403 since the role update.",
    time: "8m",
    unread: 2,
    pinned: true,
    status: "snoozed",
  },
  {
    id: "demi",
    name: "Demi Wilkinson",
    preview: "Hi team, I'm looking for the latest ESG disclosure.",
    time: "10:42 AM",
    unread: 5,
    pinned: false,
    status: "open",
  },
  {
    id: "candice",
    name: "Candice Wu",
    preview: "Tried three times this morning. It gets to about 6...",
    time: "10:15 AM",
    unread: 0,
    pinned: false,
    status: "open",
  },
  {
    id: "natali",
    name: "Natali Craig",
    preview: "Our payment cleared on Friday — screenshot attached.",
    time: "9:58 AM",
    unread: 1,
    pinned: false,
    status: "open",
  },
  {
    id: "drew",
    name: "Drew Cano",
    preview: "Onboarding docs for new hire — where to start?",
    time: "9:32 AM",
    unread: 0,
    pinned: false,
    status: "closed",
  },
  {
    id: "andi",
    name: "Andi Lane",
    preview: "API rate limit hitting hard during peak.",
    time: "8:47 AM",
    unread: 0,
    pinned: false,
    status: "snoozed",
  },
];

const tabs: { value: "all" | ConversationStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "snoozed", label: "Snoozed" },
  { value: "closed", label: "Closed" },
];

const customer = {
  name: "Olivia Rhye",
  role: "Senior DevOps Engineer",
  email: "olivia.rhye@weblabs.studio",
  phone: "+1 (415) 555-0123",
  website: "railway.co",
  company: "Railway Systems Inc.",
  stage: "Lead",
  qualifiedSince: "Mar 5, 2026",
  timezone: "PDT (UTC-7)",
  location: "San Francisco, CA, USA",
  tags: ["DevOps", "Enterprise", "PO"],
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("");
}

const ChatView = () => {
  const [activeTab, setActiveTab] = useState<"all" | ConversationStatus>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(conversations[0]?.id ?? "");
  const [detailsTab, setDetailsTab] = useState<"details" | "files" | "activity">("details");
  const [infoPanelOpen, setInfoPanelOpen] = useState(true);

  const filtered = conversations.filter((conversation) => {
    const matchesTab = activeTab === "all" || conversation.status === activeTab;
    const matchesSearch = conversation.name.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });
  const pinned = filtered.filter((conversation) => conversation.pinned);
  const rest = filtered.filter((conversation) => !conversation.pinned);
  const selected = conversations.find((conversation) => conversation.id === selectedId);

  const counts: Record<"all" | ConversationStatus, number> = {
    all: conversations.length,
    open: conversations.filter((c) => c.status === "open").length,
    snoozed: conversations.filter((c) => c.status === "snoozed").length,
    closed: conversations.filter((c) => c.status === "closed").length,
  };

  return (
    <PlatformAppShell fullBleed>
      <div
        className={cn(
          "grid min-h-0 flex-1 grid-cols-1 overflow-hidden",
          infoPanelOpen
            ? "md:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)_20rem]"
            : "md:grid-cols-[20rem_minmax(0,1fr)]",
        )}
      >
        <aside className="flex min-h-0 flex-col border-r">
          <div className="flex items-center justify-between border-b p-4">
            <div>
              <p className="text-lg font-semibold">Inbox</p>
              <p className="text-xs text-muted-foreground">All customer conversations</p>
            </div>
            <InputGroupButton size="icon-sm" aria-label="Filter conversations">
              <FilterIcon />
            </InputGroupButton>
          </div>
          <div className="border-b p-3">
            <InputGroup>
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Search conversations..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </InputGroup>
          </div>
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as "all" | ConversationStatus)}
            className="gap-0 border-b p-2"
          >
            <TabsList variant="line" className="w-full">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label}
                  <span className="text-muted-foreground">{counts[tab.value]}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {pinned.length ? (
              <div className="mb-2">
                <p className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  <PinIcon className="size-3" />
                  Pinned
                </p>
                <div className="flex flex-col gap-0.5">
                  {pinned.map((conversation) => (
                    <ConversationRow
                      key={conversation.id}
                      conversation={conversation}
                      active={conversation.id === selectedId}
                      onSelect={() => setSelectedId(conversation.id)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
            {rest.length ? (
              <div>
                <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Today</p>
                <div className="flex flex-col gap-0.5">
                  {rest.map((conversation) => (
                    <ConversationRow
                      key={conversation.id}
                      conversation={conversation}
                      active={conversation.id === selectedId}
                      onSelect={() => setSelectedId(conversation.id)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
            {!pinned.length && !rest.length ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                No conversations match this filter.
              </p>
            ) : null}
          </div>
        </aside>
        <section className="flex min-h-0 flex-col">
          <header className="flex items-center justify-between gap-3 border-b p-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="relative shrink-0">
                <Avatar>
                  <AvatarFallback>{selected ? getInitials(selected.name) : ""}</AvatarFallback>
                </Avatar>
                <span className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-background bg-status-resolved" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{selected?.name}</p>
                <p className="truncate text-xs text-muted-foreground">{customer.role}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <StatusBadge status="AI_HANDLING" className="hidden lg:inline-flex" />
              <PriorityBadge priority="HIGH" className="hidden lg:inline-flex" />
              <Separator orientation="vertical" className="mx-1 hidden h-5 lg:block" />
              <InputGroupButton size="icon-sm" aria-label="Call">
                <PhoneIcon />
              </InputGroupButton>
              <InputGroupButton size="icon-sm" aria-label="Tag conversation">
                <TagIcon />
              </InputGroupButton>
              <InputGroupButton size="icon-sm" aria-label="Snooze conversation">
                <AlarmClockIcon />
              </InputGroupButton>
              <InputGroupButton
                size="icon-sm"
                aria-label={infoPanelOpen ? "Hide customer details" : "Show customer details"}
                onClick={() => setInfoPanelOpen((open) => !open)}
              >
                <UserRoundIcon />
              </InputGroupButton>
              <InputGroupButton size="icon-sm" aria-label="More options">
                <MoreHorizontalIcon />
              </InputGroupButton>
            </div>
          </header>
          <MessageScroller>
            <MessageScrollerContent>
              <Marker>
                <MarkerContent>May 6, 2026</MarkerContent>
              </Marker>
              <ChatMessage kind="customer" name="Olivia Rhye" time="10 min ago">
                We're seeing 502s on staging right after the latest build. We rolled back, but the
                health checks are still red.
              </ChatMessage>
              <ChatMessage kind="human" name="You" time="8 min ago">
                Thanks, Olivia. I'm checking the deploy logs and upstream gateway config now.
              </ChatMessage>
              <ChatMessage kind="customer" name="Olivia Rhye" time="5 min ago">
                The weird part is API traffic looks fine, but the web container is failing readiness
                probes.
              </ChatMessage>
              <ChatMessage kind="human" name="You" time="3 min ago" reaction="👍">
                Found a mismatch in the staging environment variables. I'm applying the fix and will
                confirm once the probes recover.
              </ChatMessage>
              <ChatMessage kind="customer" name="Olivia Rhye" time="1 min ago" seen>
                Great. Keep me posted, this is blocking our QA pass.
              </ChatMessage>
            </MessageScrollerContent>
          </MessageScroller>
          <form className="border-t p-3" onSubmit={(event) => event.preventDefault()}>
            <InputGroup>
              <InputGroupTextarea placeholder="Type your message..." />
              <InputGroupAddon align="block-end">
                <InputGroupButton size="icon-sm" aria-label="Formatting">
                  <TypeIcon />
                </InputGroupButton>
                <InputGroupButton size="icon-sm" aria-label="Emoji">
                  <SmileIcon />
                </InputGroupButton>
                <InputGroupButton size="icon-sm" aria-label="Attach file">
                  <PaperclipIcon />
                </InputGroupButton>
                <InputGroupButton size="icon-sm" aria-label="Insert link">
                  <LinkIcon />
                </InputGroupButton>
                <InputGroupButton size="icon-sm" aria-label="AI compose" variant="secondary">
                  <SparklesIcon />
                </InputGroupButton>
                <InputGroupButton
                  className="ml-auto"
                  size="icon-sm"
                  variant="default"
                  type="submit"
                  aria-label="Send reply"
                >
                  <SendIcon />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </form>
        </section>
        {infoPanelOpen ? (
          <aside className="hidden min-h-0 flex-col overflow-y-auto border-l xl:flex">
            <div className="flex items-start justify-between gap-2 border-b p-4">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar>
                  <AvatarFallback>{getInitials(customer.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{customer.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{customer.role}</p>
                </div>
              </div>
              <InputGroupButton
                size="icon-sm"
                aria-label="Close customer details"
                onClick={() => setInfoPanelOpen(false)}
              >
                <XIcon />
              </InputGroupButton>
            </div>
            <div className="flex items-center gap-1.5 border-b p-3">
              <InputGroupButton size="icon-sm" aria-label="Email customer">
                <MailIcon />
              </InputGroupButton>
              <InputGroupButton size="icon-sm" aria-label="Call customer">
                <PhoneIcon />
              </InputGroupButton>
              <InputGroupButton size="icon-sm" aria-label="Schedule meeting">
                <CalendarIcon />
              </InputGroupButton>
              <InputGroupButton size="icon-sm" aria-label="Copy link">
                <LinkIcon />
              </InputGroupButton>
              <InputGroupButton size="icon-sm" aria-label="More actions" className="ml-auto">
                <MoreHorizontalIcon />
              </InputGroupButton>
            </div>
            <Tabs
              value={detailsTab}
              onValueChange={(value) => setDetailsTab(value as typeof detailsTab)}
              className="min-h-0 flex-1 gap-0"
            >
              <TabsList className="mx-3 mt-3 w-[calc(100%-1.5rem)]">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="files">Files</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>
              {detailsTab === "details" ? (
                <div className="flex flex-col gap-1 p-3">
                  <DetailRow icon={MailIcon} label="Email" value={customer.email} />
                  <DetailRow icon={PhoneIcon} label="Phone" value={customer.phone} />
                  <DetailRow icon={GlobeIcon} label="Website" value={customer.website} />
                  <DetailRow icon={BuildingIcon} label="Company" value={customer.company} />
                  <DetailRow icon={UserRoundIcon} label="Role" value={customer.role} />
                  <DetailRow icon={FlagIcon} label="Stage" value={customer.stage} />
                  <DetailRow
                    icon={CalendarIcon}
                    label="Qualified since"
                    value={customer.qualifiedSince}
                  />
                  <DetailRow icon={ClockIcon} label="Timezone" value={customer.timezone} />
                  <DetailRow icon={MapPinIcon} label="Location" value={customer.location} />
                  <div className="flex items-start gap-3 rounded-md px-2 py-2 text-sm">
                    <TagIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="flex flex-1 flex-wrap gap-1.5">
                      {customer.tags.map((tag) => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
              {detailsTab === "files" ? (
                <Empty className="border-0 p-6">
                  <EmptyMedia variant="icon">
                    <FileIcon />
                  </EmptyMedia>
                  <EmptyTitle>No files yet</EmptyTitle>
                  <EmptyDescription>
                    Files shared in this conversation will show up here.
                  </EmptyDescription>
                </Empty>
              ) : null}
              {detailsTab === "activity" ? (
                <Empty className="border-0 p-6">
                  <EmptyMedia variant="icon">
                    <HistoryIcon />
                  </EmptyMedia>
                  <EmptyTitle>No activity yet</EmptyTitle>
                  <EmptyDescription>
                    Status changes and assignment history will show up here.
                  </EmptyDescription>
                </Empty>
              ) : null}
            </Tabs>
          </aside>
        ) : null}
      </div>
    </PlatformAppShell>
  );
};

function ConversationRow({
  conversation,
  active,
  onSelect,
}: {
  conversation: Conversation;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full gap-3 rounded-lg p-3 text-left hover:bg-accent",
        active ? "bg-accent" : "",
      )}
    >
      <Avatar>
        <AvatarFallback>{getInitials(conversation.name)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="flex justify-between gap-2">
          <b className="truncate text-sm">{conversation.name}</b>
          <small className="shrink-0 text-muted-foreground">{conversation.time}</small>
        </span>
        <span className="mt-1 block truncate text-xs text-muted-foreground">
          {conversation.preview}
        </span>
      </span>
      {conversation.unread ? (
        <span className="h-fit shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
          {conversation.unread}
        </span>
      ) : null}
    </button>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MailIcon;
  label: string;
  value: string;
}) {
  return (
    <Item size="sm" className="px-2 py-1.5">
      <ItemMedia>
        <Icon className="size-4 text-muted-foreground" />
      </ItemMedia>
      <ItemContent className="gap-0">
        <ItemTitle className="text-xs font-normal text-muted-foreground">{label}</ItemTitle>
        <p className="truncate text-sm">{value}</p>
      </ItemContent>
    </Item>
  );
}

function ChatMessage({
  kind,
  name,
  time,
  reaction,
  seen,
  children,
}: {
  kind: "customer" | "ai" | "human";
  name: string;
  time: string;
  reaction?: string;
  seen?: boolean;
  children: ReactNode;
}) {
  const isHuman = kind === "human";
  return (
    <Message align={isHuman ? "end" : "start"}>
      <MessageAvatar>
        <Avatar className="size-8">
          <AvatarFallback>{getInitials(name)}</AvatarFallback>
        </Avatar>
      </MessageAvatar>
      <MessageContent>
        <MessageHeader>{name}</MessageHeader>
        <Bubble variant={kind}>
          <BubbleContent>{children}</BubbleContent>
        </Bubble>
        <MessageFooter className="flex items-center gap-1.5">
          {time}
          {reaction ? <span>{reaction}</span> : null}
          {seen ? <span>👀</span> : null}
        </MessageFooter>
      </MessageContent>
    </Message>
  );
}

export default ChatView;
