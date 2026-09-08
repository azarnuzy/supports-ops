type WidgetConfig = {
  botName: string;
  primaryColor: string;
  welcomeMessage: string;
};

type WidgetOptions = {
  apiUrl: string;
  widgetKey: string;
};

const elementName = "supportops-widget";

export async function mountWidget({ apiUrl, widgetKey }: WidgetOptions) {
  if (document.querySelector(elementName)) {
    return;
  }

  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/widget/config?key=${encodeURIComponent(widgetKey)}`);

  if (!response.ok) {
    return;
  }

  const config = (await response.json()) as WidgetConfig;
  const host = document.createElement(elementName);
  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = renderWidget(config);
  document.body.append(host);

  const launcher = shadow.querySelector<HTMLButtonElement>("[data-launcher]");
  const panel = shadow.querySelector<HTMLElement>("[data-panel]");
  const close = shadow.querySelector<HTMLButtonElement>("[data-close]");
  const input = shadow.querySelector<HTMLInputElement>("[data-input]");
  const attachmentInput = shadow.querySelector<HTMLInputElement>("[data-attachment-input]");
  const preChat = shadow.querySelector<HTMLFormElement>("[data-pre-chat]");
  const preChatError = shadow.querySelector<HTMLElement>("[data-pre-chat-error]");
  const chat = shadow.querySelector<HTMLElement>("[data-chat]");
  const messageForm = shadow.querySelector<HTMLFormElement>("[data-message-form]");
  const messages = shadow.querySelector<HTMLElement>("[data-messages]");
  let eventSource: EventSource | undefined;

  const appendMessage = (message: { content: string; position: number; senderType: string }) => {
    if (messages?.querySelector(`[data-position="${message.position}"]`)) return;
    const bubble = document.createElement("p");
    bubble.className = `message ${message.senderType === "CUSTOMER" ? "message-customer" : ""}`;
    bubble.dataset.position = String(message.position);
    bubble.textContent = message.content;
    messages?.append(bubble);
  };

  // Used before a Ticket exists — nothing is persisted yet, so these render
  // locally with no `data-position` to dedupe against.
  const appendEphemeral = (content: string, senderType: "CUSTOMER" | "AI_AGENT") => {
    const bubble = document.createElement("p");
    bubble.className = `message ${senderType === "CUSTOMER" ? "message-customer" : ""}`;
    bubble.textContent = content;
    messages?.append(bubble);
  };

  const connect = (accessToken: string) => {
    eventSource?.close();
    eventSource = new EventSource(`${apiUrl.replace(/\/$/, "")}/widget/events?token=${encodeURIComponent(accessToken)}`);
    eventSource.addEventListener("message.created", (event) => {
      const message = JSON.parse((event as MessageEvent<string>).data) as { content: string; position: number; senderType: string };
      messages?.querySelector(`[data-provisional-id]`)?.remove();
      appendMessage(message);
    });
    eventSource.addEventListener("message.delta", (event) => {
      const delta = JSON.parse((event as MessageEvent<string>).data) as { delta: string; provisionalId: string };
      let bubble = messages?.querySelector<HTMLElement>(`[data-provisional-id="${delta.provisionalId}"]`);
      if (!bubble) {
        bubble = document.createElement("p");
        bubble.className = "message";
        bubble.dataset.provisionalId = delta.provisionalId;
        messages?.append(bubble);
      }
      bubble.textContent += delta.delta;
    });
    eventSource.addEventListener("ticket.status", (event) => {
      const status = JSON.parse((event as MessageEvent<string>).data) as { status: string };
      if (input) input.disabled = status.status === "generating";
    });
    eventSource.addEventListener("attachment.updated", (event) => {
      const update = JSON.parse((event as MessageEvent<string>).data) as { attachmentId: string; processingStatus: string };
      const status = messages?.querySelector<HTMLElement>(`[data-attachment-id="${update.attachmentId}"]`);
      if (status) status.textContent = `Attachment: ${update.processingStatus.toLowerCase()}`;
    });
  };

  const setOpen = (open: boolean) => {
    if (!launcher || !panel) return;
    launcher.setAttribute("aria-expanded", String(open));
    panel.hidden = !open;
    if (open) input?.focus();
  };

  launcher?.addEventListener("click", () => setOpen(panel?.hidden ?? true));
  close?.addEventListener("click", () => setOpen(false));
  preChat?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = new FormData(preChat);
    const name = String(values.get("name") ?? "").trim();
    const email = String(values.get("email") ?? "").trim();
    if (!name || !email) return;

    preChatError?.setAttribute("hidden", "");
    try {
      const session = await startSession(apiUrl, widgetKey, { email, name });
      sessionStorage.setItem(`supportops:web-session:${widgetKey}`, session.accessToken);
      preChat.hidden = true;
      chat?.removeAttribute("hidden");
      input?.focus();
    } catch {
      preChatError?.removeAttribute("hidden");
    }
  });
  messageForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const accessToken = sessionStorage.getItem(`supportops:web-session:${widgetKey}`);
    const content = input?.value.trim() ?? "";
    const file = attachmentInput?.files?.[0];
    if (!accessToken || (!content && !file)) return;
    input.disabled = true;
    try {
      if (file) {
        const result = await sendAttachment(apiUrl, accessToken, content, file);
        appendMessage(result.message);
        const status = document.createElement("p");
        status.className = "attachment-status";
        status.dataset.attachmentId = result.attachment.id;
        status.textContent = "Attachment: processing";
        messages?.append(status);
        connect(accessToken);
        input.value = "";
        attachmentInput.value = "";
        return;
      }
      const result = await sendMessage(apiUrl, accessToken, content);
      if ("reply" in result) {
        appendEphemeral(content, "CUSTOMER");
        appendEphemeral(result.reply, "AI_AGENT");
      } else {
        appendMessage(result);
        connect(accessToken);
      }
      input.value = "";
    } finally {
      if (!eventSource) input.disabled = false;
      if (!input.disabled) input.focus();
    }
  });

  const accessToken = sessionStorage.getItem(`supportops:web-session:${widgetKey}`);
  if (accessToken) {
    preChat && (preChat.hidden = true);
    chat?.removeAttribute("hidden");
    connect(accessToken);
  }
}

async function startSession(apiUrl: string, widgetKey: string, customer: { email: string; name: string }) {
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
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/widget/messages?token=${encodeURIComponent(accessToken)}`, {
    body: JSON.stringify({ content, idempotencyKey: crypto.randomUUID() }),
    headers: { "Content-Type": "application/json" }, method: "POST",
  });
  if (!response.ok) throw new Error("Unable to send message");
  return (await response.json()) as
    | { content: string; position: number; senderType: string }
    | { reply: string };
}

async function sendAttachment(apiUrl: string, accessToken: string, content: string, file: File) {
  const form = new FormData();
  form.set("file", file);
  if (content) form.set("content", content);
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/widget/attachments?token=${encodeURIComponent(accessToken)}`, {
    body: form,
    method: "POST",
  });
  if (!response.ok) throw new Error("Unable to upload attachment");
  return (await response.json()) as {
    attachment: { id: string };
    message: { content: string; position: number; senderType: string };
  };
}

function renderWidget(config: WidgetConfig) {
  return `<style>
    :host { all: initial; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    *, *::before, *::after { box-sizing: border-box; }
    .root { position: fixed; right: 24px; bottom: 24px; z-index: 2147483647; color: #172033; font-family: inherit; }
    button, input { font: inherit; }
    .launcher { display: grid; place-items: center; width: 56px; height: 56px; margin-left: auto; border: 0; border-radius: 999px; background: ${escapeCss(config.primaryColor)}; color: white; cursor: pointer; box-shadow: 0 12px 30px rgb(0 0 0 / 25%); }
    .launcher:hover { filter: brightness(.94); }
    .panel { width: min(360px, calc(100vw - 32px)); margin-bottom: 12px; overflow: hidden; border-radius: 16px; background: white; box-shadow: 0 16px 50px rgb(0 0 0 / 24%); }
    .header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px; background: ${escapeCss(config.primaryColor)}; color: white; }
    .title { margin: 0; font-size: 16px; font-weight: 650; line-height: 1.25; }
    .close { border: 0; background: transparent; color: inherit; cursor: pointer; font-size: 22px; line-height: 1; }
    .content { padding: 16px; }
    .message { width: fit-content; max-width: 90%; margin: 0 0 8px; padding: 10px 12px; border-radius: 12px 12px 12px 3px; background: #f1f5f9; font-size: 14px; line-height: 1.45; white-space: pre-wrap; }
    .message-customer { margin-left: auto; border-radius: 12px 12px 3px; background: ${escapeCss(config.primaryColor)}; color: white; }
    .pre-chat { display: grid; gap: 12px; margin-top: 16px; font-size: 13px; font-weight: 600; }
    .input { display: block; width: 100%; margin-top: 5px; padding: 11px 12px; border: 1px solid #cbd5e1; border-radius: 9px; outline: none; color: inherit; background: white; font-size: 14px; font-weight: 400; }
    .input:focus { border-color: ${escapeCss(config.primaryColor)}; box-shadow: 0 0 0 3px color-mix(in srgb, ${escapeCss(config.primaryColor)} 22%, transparent); }
    .start { padding: 11px 12px; border: 0; border-radius: 9px; background: ${escapeCss(config.primaryColor)}; color: white; cursor: pointer; font: inherit; font-weight: 650; }
    .error { margin: 0; color: #b91c1c; font-size: 13px; font-weight: 400; }
    .attachment-status { margin: 0 0 8px; color: #475569; font-size: 12px; }
    .session-ready { margin: 16px 0 0; font-size: 14px; line-height: 1.45; }
    @media (max-width: 480px) { .root { right: 16px; bottom: 16px; } }
  </style>
  <div class="root">
    <section class="panel" data-panel hidden aria-label="${escapeHtml(config.botName)} support chat">
      <header class="header"><h2 class="title">${escapeHtml(config.botName)}</h2><button class="close" data-close aria-label="Close chat">×</button></header>
      <div class="content"><p class="message">${escapeHtml(config.welcomeMessage)}</p><form class="pre-chat" data-pre-chat><label>Name<input class="input" name="name" autocomplete="name" required /></label><label>Email<input class="input" name="email" type="email" autocomplete="email" required /></label><p class="error" data-pre-chat-error hidden>We could not start your chat. Please try again.</p><button class="start" type="submit">Start chat</button></form><div data-chat hidden><div data-messages></div><form data-message-form><input class="input" data-input placeholder="Type your message…" aria-label="Message" /><input class="input" data-attachment-input type="file" accept="application/pdf,text/plain,image/jpeg,image/png" aria-label="Attachment" /></form></div></div>
    </section>
    <button class="launcher" data-launcher aria-label="Open ${escapeHtml(config.botName)} support chat" aria-expanded="false"><svg viewBox="0 0 24 24" width="25" height="25" aria-hidden="true"><path fill="currentColor" d="M4 4.5A2.5 2.5 0 0 1 6.5 2h11A2.5 2.5 0 0 1 20 4.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4.4A2.5 2.5 0 0 1 4 12.5z"/></svg></button>
  </div>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function escapeCss(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#2563eb";
}
