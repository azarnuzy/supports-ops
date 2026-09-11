import DOMPurify from "dompurify";
import { marked } from "marked";

type WidgetConfig = {
  botName: string;
  primaryColor: string;
  welcomeMessage: string;
  logoUrl: string | null;
};

type WidgetOptions = {
  apiUrl: string;
  widgetKey: string;
};

type WidgetAttachment = {
  fileName: string;
  id: string;
  mimeType: string;
  processingStatus?: string;
  sizeBytes: number;
};

type WidgetMessage = {
  attachments?: WidgetAttachment[];
  content: string;
  createdAt: string;
  position: number;
  senderType: string;
};

const elementName = "supportops-widget";

marked.setOptions({ breaks: true, gfm: false });
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

function renderMarkdown(content: string) {
  return DOMPurify.sanitize(marked.parse(content, { async: false }), {
    ALLOWED_TAGS: ["p", "a", "strong", "em", "code", "pre", "ul", "ol", "li", "br"],
    ALLOWED_ATTR: ["href"],
    ALLOWED_URI_REGEXP: /^https?:\/\//i,
  }).trim();
}

export async function mountWidget({ apiUrl, widgetKey }: WidgetOptions) {
  if (document.querySelector(elementName)) {
    return true;
  }

  const response = await fetch(
    `${apiUrl.replace(/\/$/, "")}/widget/config?key=${encodeURIComponent(widgetKey)}`,
  );

  if (!response.ok) {
    return false;
  }

  const config = (await response.json()) as WidgetConfig;
  const host = document.createElement(elementName);
  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = renderWidget(config);
  document.body.append(host);

  const launcher = shadow.querySelector<HTMLButtonElement>("[data-launcher]");
  const panel = shadow.querySelector<HTMLElement>("[data-panel]");
  const close = shadow.querySelector<HTMLButtonElement>("[data-close]");
  const identityBar = shadow.querySelector<HTMLElement>("[data-identity]");
  const identityText = shadow.querySelector<HTMLElement>("[data-identity-text]");
  const identityReset = shadow.querySelector<HTMLButtonElement>("[data-identity-reset]");
  const input = shadow.querySelector<HTMLInputElement>("[data-input]");
  const attachmentInput = shadow.querySelector<HTMLInputElement>("[data-attachment-input]");
  const attachTrigger = shadow.querySelector<HTMLButtonElement>("[data-attach-trigger]");
  const attachmentTray = shadow.querySelector<HTMLElement>("[data-attachment-tray]");
  const sendButton = shadow.querySelector<HTMLButtonElement>("[data-send]");
  const preChat = shadow.querySelector<HTMLFormElement>("[data-pre-chat]");
  const preChatError = shadow.querySelector<HTMLElement>("[data-pre-chat-error]");
  const preChatSubmit = shadow.querySelector<HTMLButtonElement>("[data-pre-chat-submit]");
  const chat = shadow.querySelector<HTMLElement>("[data-chat]");
  const messageForm = shadow.querySelector<HTMLFormElement>("[data-message-form]");
  const messageError = shadow.querySelector<HTMLElement>("[data-message-error]");
  const messages = shadow.querySelector<HTMLElement>("[data-messages]");
  const sessionEnded = shadow.querySelector<HTMLElement>("[data-session-ended]");
  const startNew = shadow.querySelector<HTMLButtonElement>("[data-start-new]");
  const scrollMessages = () =>
    messages?.scrollTo({ top: messages.scrollHeight, behavior: "smooth" });
  let eventSource: EventSource | undefined;
  const streamedContent = new Map<string, string>();
  const identityKey = `supportops:web-identity:${widgetKey}`;

  const setIdentity = (name: string, email: string) => {
    sessionStorage.setItem(identityKey, JSON.stringify({ email, name }));
    if (identityText) identityText.textContent = `${name} · ${email}`;
    identityBar?.removeAttribute("hidden");
  };
  const clearIdentity = () => {
    sessionStorage.removeItem(identityKey);
    identityBar?.setAttribute("hidden", "");
  };
  const restoreIdentity = () => {
    const stored = sessionStorage.getItem(identityKey);
    if (!stored) return;
    try {
      const identity = JSON.parse(stored) as { email: string; name: string };
      setIdentity(identity.name, identity.email);
    } catch {
      sessionStorage.removeItem(identityKey);
    }
  };

  const showTyping = () => {
    hideTyping();
    const typing = document.createElement("p");
    typing.className = "message typing";
    typing.dataset.typing = "";
    typing.innerHTML = "<span></span><span></span><span></span>";
    messages?.append(typing);
    scrollMessages();
  };
  const hideTyping = () => {
    messages?.querySelector("[data-typing]")?.remove();
  };

  const appendAttachment = (container: HTMLElement, attachment: WidgetAttachment) => {
    const image = attachment.mimeType === "image/jpeg" || attachment.mimeType === "image/png";
    const statusText =
      attachment.processingStatus === "FAILED"
        ? "Could not be read"
        : attachment.processingStatus === "READY"
          ? "✓"
          : "◌";
    if (image) {
      const element = document.createElement("button");
      element.className = "attachment-image";
      element.type = "button";
      element.title = attachment.fileName;
      element.dataset.attachmentId = attachment.id;
      element.setAttribute("aria-label", `Open ${attachment.fileName}`);
      element.addEventListener("click", async () => {
        const url = await getAttachmentUrl(apiUrl, widgetKey, attachment.id, "preview");
        window.open(url, "_blank", "noopener");
      });
      const preview = document.createElement("img");
      preview.alt = attachment.fileName;
      element.append(preview);
      void getAttachmentUrl(apiUrl, widgetKey, attachment.id, "preview")
        .then((url) => {
          preview.src = url;
        })
        .catch(() => {
          element.textContent = attachment.fileName;
        });
      const status = document.createElement("span");
      status.className = "attachment-status";
      status.textContent = statusText;
      element.append(status);
      container.append(element);
      return;
    }
    const element = document.createElement("div");
    element.className = "attachment-file";
    element.dataset.attachmentId = attachment.id;
    const icon = document.createElement("span");
    icon.className = "attachment-file-icon";
    icon.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M14 3v5h5M9 13h6M9 17h6"/></svg>`;
    const info = document.createElement("div");
    info.className = "attachment-file-info";
    const name = document.createElement("p");
    name.className = "attachment-file-name";
    name.textContent = attachment.fileName;
    name.title = attachment.fileName;
    const meta = document.createElement("p");
    meta.className = "attachment-file-meta";
    meta.append(`${formatBytes(attachment.sizeBytes)} · `);
    const status = document.createElement("span");
    status.className = "attachment-status";
    status.textContent = statusText;
    meta.append(status);
    info.append(name, meta);
    const preview = document.createElement("button");
    preview.type = "button";
    preview.className = "attachment-file-action";
    preview.textContent = "Preview";
    preview.addEventListener("click", async () => {
      const url = await getAttachmentUrl(apiUrl, widgetKey, attachment.id, "preview");
      window.open(url, "_blank", "noopener");
    });
    const download = document.createElement("button");
    download.type = "button";
    download.className = "attachment-file-action attachment-file-icon-button";
    download.setAttribute("aria-label", `Download ${attachment.fileName}`);
    download.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16"/></svg>`;
    download.addEventListener("click", async () => {
      const url = await getAttachmentUrl(apiUrl, widgetKey, attachment.id, "download");
      window.open(url, "_blank", "noopener");
    });
    element.append(icon, info, preview, download);
    container.append(element);
  };
  const appendMessage = (message: WidgetMessage) => {
    if (messages?.querySelector(`[data-position="${message.position}"]`)) return;
    const bubble = document.createElement("div");
    bubble.className = `message ${message.senderType === "CUSTOMER" ? "message-customer" : ""}`;
    bubble.dataset.position = String(message.position);
    for (const attachment of message.attachments ?? []) appendAttachment(bubble, attachment);
    const legacyAttachmentText =
      /^I need help with the attached file: .+$/.test(message.content) &&
      message.attachments?.length;
    let content: HTMLElement | undefined;
    if (message.content && !legacyAttachmentText) {
      content = document.createElement("div");
      content.className = "message-copy";
      if (message.senderType === "CUSTOMER") content.textContent = message.content;
      else content.innerHTML = renderMarkdown(message.content);
      bubble.append(content);
    }
    const time = document.createElement("time");
    time.className = "message-time";
    time.dateTime = message.createdAt;
    time.textContent = new Date(message.createdAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    bubble.append(time);
    messages?.append(bubble);
    // `.message` uses `width: fit-content` to hug the widest line, but browsers
    // resolve that against the available width rather than the rendered content
    // once text wraps — leaving a bubble stretched wider than any actual line.
    // Re-measure the rendered lines and clamp to the widest one to close the gap.
    if (content) tightenMessageCopyWidth(content);
    scrollMessages();
  };

  // Used before a Ticket exists — the exchange is persisted against the
  // session by the API, but replays only reach the client after a reload, so
  // these render locally with no `data-position` to dedupe against.
  const appendEphemeral = (content: string, senderType: "CUSTOMER" | "AI_AGENT") => {
    const bubble = document.createElement("div");
    bubble.className = `message ${senderType === "CUSTOMER" ? "message-customer" : ""}`;
    if (senderType === "CUSTOMER") {
      bubble.textContent = content;
    } else {
      bubble.innerHTML = renderMarkdown(content);
    }
    messages?.append(bubble);
    const time = document.createElement("time");
    time.className = `message-time ${senderType === "CUSTOMER" ? "message-time-customer" : ""}`;
    time.dateTime = new Date().toISOString();
    time.textContent = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    bubble.append(time);
    scrollMessages();
  };

  const connect = (accessToken: string) => {
    eventSource?.close();
    const source = new EventSource(
      `${apiUrl.replace(/\/$/, "")}/widget/events?token=${encodeURIComponent(accessToken)}`,
    );
    eventSource = source;
    if (input) {
      input.disabled = true;
      input.placeholder = "Connecting…";
    }
    // Safety net: a hung connection (no open, no error — e.g. a proxy
    // silently swallowing the stream) would otherwise leave the input
    // disabled forever with no feedback.
    const connectTimeout = window.setTimeout(() => {
      if (eventSource !== source || !input) return;
      input.disabled = false;
      input.placeholder = "Type your message…";
    }, 10_000);
    source.onopen = () => {
      window.clearTimeout(connectTimeout);
      if (eventSource !== source || !input) return;
      input.disabled = false;
      input.placeholder = "Type your message…";
    };
    source.onerror = () => {
      window.clearTimeout(connectTimeout);
      if (eventSource !== source) return;
      source.close();
      eventSource = undefined;
      hideTyping();
      if (input) {
        input.disabled = false;
        input.placeholder = "Type your message…";
      }
    };
    source.addEventListener("message.created", (event) => {
      const message = JSON.parse((event as MessageEvent<string>).data) as {
        attachments?: WidgetAttachment[];
        content: string;
        createdAt: string;
        position: number;
        senderType: string;
      };
      hideTyping();
      messages?.querySelector(`[data-provisional-id]`)?.remove();
      appendMessage(message);
    });
    source.addEventListener("message.delta", (event) => {
      const delta = JSON.parse((event as MessageEvent<string>).data) as {
        delta: string;
        provisionalId: string;
      };
      hideTyping();
      let bubble = messages?.querySelector<HTMLElement>(
        `[data-provisional-id="${delta.provisionalId}"]`,
      );
      if (!bubble) {
        bubble = document.createElement("p");
        bubble.className = "message";
        bubble.dataset.provisionalId = delta.provisionalId;
        messages?.append(bubble);
      }
      const content = (streamedContent.get(delta.provisionalId) ?? "") + delta.delta;
      streamedContent.set(delta.provisionalId, content);
      bubble.innerHTML = renderMarkdown(content);
      scrollMessages();
    });
    source.addEventListener("ticket.status", (event) => {
      const status = JSON.parse((event as MessageEvent<string>).data) as {
        status: string;
      };
      if (input) input.disabled = status.status === "generating" || status.status === "resolved";
      if (status.status === "generating") {
        showTyping();
      } else {
        hideTyping();
      }
      if (status.status === "resolved") {
        sessionEnded?.removeAttribute("hidden");
        startNew?.removeAttribute("hidden");
      }
    });
    source.addEventListener("attachment.updated", (event) => {
      const update = JSON.parse((event as MessageEvent<string>).data) as {
        attachmentId: string;
        processingStatus: string;
      };
      const attachment = messages?.querySelector<HTMLElement>(
        `[data-attachment-id="${update.attachmentId}"]`,
      );
      const status = attachment?.querySelector<HTMLElement>(".attachment-status");
      if (status)
        status.textContent =
          update.processingStatus === "FAILED"
            ? "Could not be read"
            : update.processingStatus === "READY"
              ? "✓"
              : "◌";
    });
  };

  const setOpen = (open: boolean) => {
    if (!launcher || !panel) return;
    launcher.setAttribute("aria-expanded", String(open));
    panel.toggleAttribute("data-open", open);
    panel.setAttribute("aria-hidden", String(!open));
    if (open) input?.focus();
  };

  // Belt-and-suspenders: always drive these two views through one place so
  // they can never both end up visible at once.
  const showChat = () => {
    preChat?.setAttribute("hidden", "");
    chat?.removeAttribute("hidden");
    panel?.setAttribute("data-chat-active", "");
  };
  const showPreChat = () => {
    chat?.setAttribute("hidden", "");
    preChat?.removeAttribute("hidden");
    panel?.removeAttribute("data-chat-active");
  };

  document.addEventListener("click", (event) => {
    if (!panel?.hasAttribute("data-open")) return;
    if (event.composedPath().includes(host)) return;
    setOpen(false);
  });

  launcher?.addEventListener("click", () => setOpen(!panel?.hasAttribute("data-open")));
  close?.addEventListener("click", () => setOpen(false));
  preChat?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = new FormData(preChat);
    const name = String(values.get("name") ?? "").trim();
    const email = String(values.get("email") ?? "").trim();
    if (!name || !email) return;

    preChatError?.setAttribute("hidden", "");
    if (preChatSubmit) {
      preChatSubmit.disabled = true;
      preChatSubmit.textContent = "Starting…";
    }
    try {
      const session = await startSession(apiUrl, widgetKey, { email, name });
      sessionStorage.setItem(`supportops:web-session:${widgetKey}`, session.accessToken);
      setIdentity(name, email);
      showChat();
      sessionEnded?.setAttribute("hidden", "");
      input?.focus();
    } catch {
      preChatError?.removeAttribute("hidden");
    } finally {
      if (preChatSubmit) {
        preChatSubmit.disabled = false;
        preChatSubmit.textContent = "Start chat";
      }
    }
  });
  const resetSession = () => {
    eventSource?.close();
    eventSource = undefined;
    sessionStorage.removeItem(`supportops:web-session:${widgetKey}`);
    clearIdentity();
    messages?.replaceChildren();
    sessionEnded?.setAttribute("hidden", "");
    startNew?.setAttribute("hidden", "");
    if (input) {
      input.disabled = false;
      input.placeholder = "Type your message…";
    }
    showPreChat();
  };
  startNew?.addEventListener("click", resetSession);
  identityReset?.addEventListener("click", resetSession);

  const updateSendState = () => {
    if (!sendButton) return;
    const hasContent = Boolean(input?.value.trim()) || Boolean(attachmentInput?.files?.length);
    sendButton.disabled = !hasContent;
  };
  const updateAttachmentTray = () => {
    if (!attachmentTray || !attachmentInput) return;
    attachmentTray.replaceChildren();
    [...(attachmentInput.files ?? [])].forEach((file, index) => {
      const item = document.createElement("div");
      item.className = "attachment-chip";
      if (file.type.startsWith("image/")) {
        const image = document.createElement("img");
        image.alt = "";
        image.src = URL.createObjectURL(file);
        image.onload = () => URL.revokeObjectURL(image.src);
        item.append(image);
      }
      const name = document.createElement("span");
      name.textContent = file.name;
      item.append(name);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.ariaLabel = `Remove ${file.name}`;
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        const transfer = new DataTransfer();
        [...(attachmentInput.files ?? [])].forEach(
          (entry, current) => current !== index && transfer.items.add(entry),
        );
        attachmentInput.files = transfer.files;
        updateAttachmentTray();
      });
      item.append(remove);
      attachmentTray.append(item);
    });
    attachmentTray.toggleAttribute("data-visible", Boolean(attachmentInput.files?.length));
    updateSendState();
  };
  attachTrigger?.addEventListener("click", () => attachmentInput?.click());
  attachmentInput?.addEventListener("change", () => {
    if (attachmentInput.files && attachmentInput.files.length > 10) {
      const transfer = new DataTransfer();
      [...attachmentInput.files].slice(0, 10).forEach((file) => transfer.items.add(file));
      attachmentInput.files = transfer.files;
    }
    updateAttachmentTray();
  });
  input?.addEventListener("input", updateSendState);
  updateSendState();

  messageForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const accessToken = sessionStorage.getItem(`supportops:web-session:${widgetKey}`);
    const content = input?.value.trim() ?? "";
    const files = [...(attachmentInput?.files ?? [])];
    if (!accessToken || (!content && !files.length) || !input) return;
    messageError?.setAttribute("hidden", "");

    // Optimistic send: show the customer's own message immediately and
    // clear the composer — don't make the sender wait for the round trip.
    const optimistic = document.createElement("p");
    optimistic.className = "message message-customer";
    optimistic.textContent = content;
    if (!files.length) messages?.append(optimistic);

    input.disabled = true;
    input.placeholder = "Sending…";
    if (sendButton) sendButton.disabled = true;
    input.value = "";
    // Whether *this* submission opened a fresh SSE connection — the shared
    // `eventSource` variable can already be non-null from an unrelated
    // earlier connect() (e.g. auto-resume on load), so it can't be used to
    // decide whether to leave the input disabled for a connection this
    // submission never started.
    let connecting = false;
    try {
      if (files.length) {
        const result = await sendAttachments(apiUrl, accessToken, content, files);
        optimistic.remove();
        appendMessage({ ...result.message, attachments: result.attachments });
        if (attachmentInput) attachmentInput.value = "";
        updateAttachmentTray();
        connect(accessToken);
        connecting = true;
        return;
      }
      showTyping();
      const result = await sendMessage(apiUrl, accessToken, content);
      hideTyping();
      optimistic.remove();
      if ("reply" in result) {
        appendEphemeral(content, "CUSTOMER");
        appendEphemeral(result.reply, "AI_AGENT");
      } else {
        appendMessage(result);
        connect(accessToken);
        connecting = true;
      }
    } catch {
      hideTyping();
      optimistic.classList.add("message-failed");
      optimistic.title = "Failed to send — check your connection and try again.";
      input.value = content;
      messageError?.removeAttribute("hidden");
    } finally {
      if (!connecting) {
        input.disabled = false;
        input.placeholder = "Type your message…";
      }
      if (!input.disabled) input.focus();
      updateSendState();
    }
  });

  const accessToken = sessionStorage.getItem(`supportops:web-session:${widgetKey}`);
  if (accessToken) {
    restoreIdentity();
    showChat();
    connect(accessToken);
  }

  return true;
}

async function startSession(
  apiUrl: string,
  widgetKey: string,
  customer: { email: string; name: string },
) {
  const response = await fetch(
    `${apiUrl.replace(/\/$/, "")}/widget/pre-chat?key=${encodeURIComponent(widgetKey)}`,
    {
      body: JSON.stringify({ ...customer, widgetKey }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );

  if (!response.ok) throw new Error("Unable to start a Web Session");
  return (await response.json()) as { accessToken: string };
}

async function sendMessage(apiUrl: string, accessToken: string, content: string) {
  const response = await fetch(
    `${apiUrl.replace(/\/$/, "")}/widget/messages?token=${encodeURIComponent(accessToken)}`,
    {
      body: JSON.stringify({ content, idempotencyKey: crypto.randomUUID() }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  if (!response.ok) throw new Error("Unable to send message");
  return (await response.json()) as WidgetMessage | { reply: string };
}

async function sendAttachments(
  apiUrl: string,
  accessToken: string,
  content: string,
  files: File[],
) {
  const form = new FormData();
  files.forEach((file) => form.append("files", file));
  if (content) form.set("content", content);
  const response = await fetch(
    `${apiUrl.replace(/\/$/, "")}/widget/attachments?token=${encodeURIComponent(accessToken)}`,
    {
      body: form,
      method: "POST",
    },
  );
  if (!response.ok) throw new Error("Unable to upload attachment");
  return (await response.json()) as {
    attachments: WidgetAttachment[];
    message: WidgetMessage;
  };
}

async function getAttachmentUrl(
  apiUrl: string,
  widgetKey: string,
  attachmentId: string,
  mode: "download" | "preview",
) {
  const accessToken = sessionStorage.getItem(`supportops:web-session:${widgetKey}`);
  const response = await fetch(
    `${apiUrl.replace(/\/$/, "")}/widget/attachments/${encodeURIComponent(attachmentId)}/${mode}?token=${encodeURIComponent(accessToken ?? "")}`,
  );
  if (!response.ok) throw new Error("Unable to load attachment");
  return ((await response.json()) as { url: string }).url;
}

function renderWidget(config: WidgetConfig) {
  return `<style>
    :host { all: initial; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    *, *::before, *::after { box-sizing: border-box; }
    .root { position: fixed; right: 24px; bottom: 24px; z-index: 2147483647; color: #172033; font-family: inherit; pointer-events: none; }
    button, input { font: inherit; }
    .launcher { pointer-events: auto; display: grid; place-items: center; width: 56px; height: 56px; margin-left: auto; border: 0; border-radius: 999px; background: ${escapeCss(config.primaryColor)}; color: white; cursor: pointer; box-shadow: 0 12px 30px rgb(0 0 0 / 25%); }
    .launcher:hover { filter: brightness(.94); }
    .panel { display: flex; flex-direction: column; width: min(384px, calc(100vw - 32px)); max-height: min(620px, calc(100vh - 112px)); margin-bottom: 12px; overflow: hidden; border-radius: 20px; background: white; box-shadow: 0 20px 55px rgb(15 23 42 / 24%); visibility: hidden; opacity: 0; pointer-events: none; transform: scale(.96) translateY(6px); transform-origin: bottom right; transition: opacity 180ms ease, transform 180ms ease, visibility 180ms; }
    .panel[data-chat-active] { height: min(620px, calc(100vh - 112px)); }
    .panel[data-open] { visibility: visible; opacity: 1; pointer-events: auto; transform: none; }
    @media (prefers-reduced-motion: reduce) { .panel { transition: opacity 1ms; transform: none; } }
    .message.typing { flex-direction: row; align-items: center; gap: 0; }
    .typing span { display: inline-block; width: 6px; height: 6px; margin-right: 3px; border-radius: 999px; background: #94a3b8; animation: typing-bounce 1.1s infinite ease-in-out; }
    .typing span:nth-child(2) { animation-delay: .15s; }
    .typing span:nth-child(3) { animation-delay: .3s; margin-right: 0; }
    @keyframes typing-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: .5; } 30% { transform: translateY(-4px); opacity: 1; } }
    .message a { color: inherit; }
    .message :is(p, pre) { margin: 0; }
    .header { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 20px; background: linear-gradient(135deg, ${escapeCss(config.primaryColor)}, color-mix(in srgb, ${escapeCss(config.primaryColor)} 78%, #7c3aed)); color: white; }
    .header-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .header-avatar { display: grid; place-items: center; width: 34px; height: 34px; flex: 0 0 auto; overflow: hidden; border-radius: 11px; background: rgb(255 255 255 / 18%); }
    .header-avatar img { width: 100%; height: 100%; object-fit: cover; }
    .header-copy { min-width: 0; }
    .title { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 16px; font-weight: 700; line-height: 1.25; }
    .online { display: flex; align-items: center; gap: 5px; margin-top: 2px; font-size: 11px; font-weight: 600; color: rgb(255 255 255 / 84%); }
    .online::before { width: 7px; height: 7px; border-radius: 999px; background: #4ade80; content: ""; }
    .close { border: 0; background: transparent; color: inherit; cursor: pointer; font-size: 22px; line-height: 1; }
    .identity { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px 8px 16px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; color: #475569; font-size: 12px; font-weight: 600; }
    .identity[hidden] { display: none; }
    .identity span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .identity-reset { flex-shrink: 0; width: 24px; height: 24px; color: #64748b; }
    .content { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; padding: 16px; overflow-y: auto; }
    .message { display: flex; width: fit-content; max-width: 90%; flex-direction: column; gap: 2px; margin: 0 0 8px; padding: 10px 12px; border-radius: 12px 12px 12px 3px; background: #f1f5f9; font-size: 14px; line-height: 1.45; white-space: pre-wrap; }
    .message:has(.attachment-image, .attachment-file) { gap: 6px; }
    .message-customer { margin-left: auto; border-radius: 12px 12px 3px; background: ${escapeCss(config.primaryColor)}; color: white; }
    .message-failed { opacity: .55; outline: 1px dashed #b91c1c; outline-offset: -1px; }
    .welcome { flex: 0 0 auto; text-align: center; }
    .welcome-icon { display: grid; place-items: center; width: 68px; height: 68px; margin: 0 auto 16px; border-radius: 999px; background: color-mix(in srgb, ${escapeCss(config.primaryColor)} 12%, white); color: ${escapeCss(config.primaryColor)}; }
    .welcome h3 { margin: 0; font-size: 23px; line-height: 1.2; letter-spacing: -.025em; }
    .welcome p { margin: 10px 0 0; color: #64748b; font-size: 14px; font-weight: 400; line-height: 1.5; }
    .panel[data-chat-active] .welcome, .panel[data-chat-active] .privacy { display: none; }
    .pre-chat { flex: 0 0 auto; display: grid; gap: 12px; margin-top: 18px; font-size: 13px; font-weight: 650; }
    .pre-chat[hidden] { display: none; }
    [data-chat] { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
    [data-chat][hidden] { display: none; }
    [data-messages] { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
    .input { display: block; width: 100%; margin-top: 6px; padding: 13px 12px; border: 1px solid #cbd5e1; border-radius: 11px; outline: none; color: inherit; background: white; font-size: 14px; font-weight: 400; }
    .input:focus { border-color: ${escapeCss(config.primaryColor)}; box-shadow: 0 0 0 3px color-mix(in srgb, ${escapeCss(config.primaryColor)} 22%, transparent); }
    .input-wrap { position: relative; margin-top: 5px; }
    .input-wrap .input { margin-top: 0; padding-left: 36px; }
    .input-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8; pointer-events: none; }
    .start { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 13px 12px; border: 0; border-radius: 11px; background: ${escapeCss(config.primaryColor)}; color: white; cursor: pointer; font: inherit; font-weight: 700; box-shadow: 0 5px 12px color-mix(in srgb, ${escapeCss(config.primaryColor)} 26%, transparent); }
    .privacy { display: flex; gap: 9px; align-items: flex-start; margin: 18px 0 0; color: #64748b; font-size: 11px; font-weight: 400; line-height: 1.4; }
    .privacy svg { flex: 0 0 auto; margin-top: 1px; }
    .error { margin: 0; color: #b91c1c; font-size: 13px; font-weight: 400; }
    .attachment-status { margin-left: auto; color: #64748b; font-size: 10px; }
    .attachment-image { position: relative; display: block; width: 112px; height: 112px; padding: 0; overflow: hidden; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; cursor: pointer; }
    .attachment-image img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .attachment-image .attachment-status { position: absolute; right: 6px; bottom: 5px; padding: 1px 4px; border-radius: 999px; background: rgb(255 255 255 / 88%); }
    .attachment-file { display: flex; max-width: 100%; align-items: center; gap: 8px; padding: 8px 10px; overflow: hidden; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; color: #0f172a; }
    .attachment-file-icon { display: grid; flex: 0 0 auto; place-items: center; color: #64748b; }
    .attachment-file-info { min-width: 0; flex: 1 1 auto; }
    .attachment-file-name { margin: 0; overflow: hidden; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
    .attachment-file-meta { display: flex; align-items: center; gap: 3px; margin: 2px 0 0; color: #64748b; font-size: 10px; white-space: nowrap; }
    .attachment-file-action { flex: 0 0 auto; border: 1px solid #cbd5e1; border-radius: 7px; background: #fff; color: #334155; cursor: pointer; font: inherit; font-size: 11px; font-weight: 600; padding: 5px 8px; }
    .attachment-file-action:hover { background: #f8fafc; }
    .attachment-file-icon-button { display: grid; place-items: center; padding: 5px; }
    .message-time { align-self: flex-end; color: currentColor; font-size: 10px; line-height: 1; opacity: .65; }
    .session-ready { margin: 16px 0 0; font-size: 14px; line-height: 1.45; }
    .start[data-start-new] { align-self: flex-start; margin-top: 10px; padding: 0; border: 0; background: transparent; color: ${escapeCss(config.primaryColor)}; cursor: pointer; font: inherit; font-size: 13px; font-weight: 650; text-decoration: underline; box-shadow: none; }
    .composer { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-top: 12px; padding: 4px 4px 4px 6px; border: 1px solid #cbd5e1; border-radius: 18px; background: white; }
    .composer:focus-within { border-color: ${escapeCss(config.primaryColor)}; box-shadow: 0 0 0 3px color-mix(in srgb, ${escapeCss(config.primaryColor)} 22%, transparent); }
    .composer-input { flex: 1; min-width: 0; border: 0; outline: none; padding: 8px 4px; font: inherit; font-size: 14px; color: inherit; background: transparent; }
    .icon-button { display: grid; place-items: center; flex-shrink: 0; width: 34px; height: 34px; padding: 0; border: 0; border-radius: 999px; background: transparent; color: #64748b; cursor: pointer; }
    .icon-button:hover { background: #f1f5f9; }
    .send { background: ${escapeCss(config.primaryColor)}; color: white; }
    .send:hover { filter: brightness(.94); background: ${escapeCss(config.primaryColor)}; }
    .send:disabled { opacity: .5; cursor: default; }
    .send:disabled:hover { filter: none; }
    .attachment-tray { display: none; flex: 1 0 100%; gap: 6px; padding: 4px 2px 2px; overflow-x: auto; }
    .attachment-tray[data-visible] { display: flex; }
    .attachment-chip { display: flex; min-width: 0; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 10px; background: #f1f5f9; font-size: 12px; color: #334155; }
    .attachment-chip img { width: 32px; height: 32px; border-radius: 6px; object-fit: cover; }
    .attachment-chip span { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .attachment-chip button { border: 0; background: transparent; color: inherit; cursor: pointer; font-size: 14px; line-height: 1; padding: 0; }
    @media (max-width: 480px) { .root { right: 16px; bottom: 16px; } }
  </style>
  <div class="root">
    <section class="panel" data-panel aria-hidden="true" aria-label="${escapeHtml(config.botName)} support chat">
      <header class="header"><div class="header-brand"><div class="header-avatar">${config.logoUrl ? `<img src="${escapeHtml(config.logoUrl)}" alt="" />` : `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M7 9.5A5 5 0 0 1 17 9.5V11h1.5A2.5 2.5 0 0 1 21 13.5v4A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-4A2.5 2.5 0 0 1 5.5 11H7V9.5Zm2 1.5h6V9.5a3 3 0 0 0-6 0V11Zm-.75 4.5a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Zm7.5 0a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Z"/></svg>`}</div><div class="header-copy"><h2 class="title">${escapeHtml(config.botName)}</h2><div class="online">Online</div></div></div><button class="close" data-close aria-label="Close chat">×</button></header>
      <div class="identity" data-identity hidden><span data-identity-text></span><button type="button" class="icon-button identity-reset" data-identity-reset aria-label="Reset session and start a new conversation"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3 12a9 9 0 1 1 2.64 6.36M3 12V6m0 6h6"/></svg></button></div>
      <div class="content"><div class="welcome"><div class="welcome-icon"><svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true"><path fill="currentColor" d="M7 9.5A5 5 0 0 1 17 9.5V11h1.5A2.5 2.5 0 0 1 21 13.5v4A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-4A2.5 2.5 0 0 1 5.5 11H7V9.5Zm2 1.5h6V9.5a3 3 0 0 0-6 0V11Zm-.75 4.5a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Zm7.5 0a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Z"/></svg></div><h3>Hi there! 👋</h3><p>${escapeHtml(config.welcomeMessage)}</p></div><form class="pre-chat" data-pre-chat><label>Name<div class="input-wrap"><svg class="input-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0"/></svg><input class="input" name="name" autocomplete="name" placeholder="Your name" required /></div></label><label>Email<div class="input-wrap"><svg class="input-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-11Zm0 0 9 6.5 9-6.5"/></svg><input class="input" name="email" type="email" autocomplete="email" placeholder="you@company.com" required /></div></label><p class="error" data-pre-chat-error hidden>We could not start your chat. Please try again.</p><button class="start" type="submit" data-pre-chat-submit>Start chat<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M5 12h14m-6-6 6 6-6 6"/></svg></button></form><p class="privacy"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M6 10V7a6 6 0 0 1 12 0v3m-13 0h14v11H5V10Zm7 4v3"/></svg>Your information is only used to provide support and will never be shared with third parties.</p><div data-chat hidden><div data-messages></div><p class="session-ready" data-session-ended hidden>This conversation is resolved and is now read-only.</p><button class="start" data-start-new type="button" hidden>Start a new conversation</button><p class="error" data-message-error hidden>Message failed to send. Your text and attachments are still ready to retry.</p><form class="composer" data-message-form><div class="attachment-tray" data-attachment-tray></div><button class="icon-button" type="button" data-attach-trigger aria-label="Attach files"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M21.44 11.05 12.25 20.24a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></button><input class="composer-input" data-input placeholder="Type your message…" aria-label="Message" /><input data-attachment-input type="file" multiple hidden accept="application/pdf,text/plain,image/jpeg,image/png" aria-label="Attachments" /><button class="icon-button send" type="submit" data-send aria-label="Send message"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="m3 11.5 18-8-8 18-2.5-7.5L3 11.5Z"/></svg></button></form></div></div>
    </section>
    <button class="launcher" data-launcher aria-label="Open ${escapeHtml(config.botName)} support chat" aria-expanded="false"><svg viewBox="0 0 24 24" width="25" height="25" aria-hidden="true"><path fill="currentColor" d="M4 4.5A2.5 2.5 0 0 1 6.5 2h11A2.5 2.5 0 0 1 20 4.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4.4A2.5 2.5 0 0 1 4 12.5z"/></svg></button>
  </div>`;
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ??
      character,
  );
}

function escapeCss(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#2563eb";
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = sizeBytes;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function tightenMessageCopyWidth(copy: HTMLElement) {
  const blocks = copy.querySelectorAll("p, li, pre");
  const targets = blocks.length ? [...blocks] : [copy];
  let widest = 0;
  for (const target of targets) {
    const range = document.createRange();
    range.selectNodeContents(target);
    for (const rect of range.getClientRects()) widest = Math.max(widest, rect.width);
  }
  if (widest > 0) copy.style.maxWidth = `${Math.ceil(widest)}px`;
}
