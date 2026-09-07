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

  const setOpen = (open: boolean) => {
    if (!launcher || !panel) return;
    launcher.setAttribute("aria-expanded", String(open));
    panel.hidden = !open;
    if (open) input?.focus();
  };

  launcher?.addEventListener("click", () => setOpen(panel?.hidden ?? true));
  close?.addEventListener("click", () => setOpen(false));
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
    .message { width: fit-content; max-width: 90%; margin: 0; padding: 10px 12px; border-radius: 12px 12px 12px 3px; background: #f1f5f9; font-size: 14px; line-height: 1.45; }
    .input { width: 100%; margin-top: 16px; padding: 11px 12px; border: 1px solid #cbd5e1; border-radius: 9px; outline: none; color: inherit; background: white; font-size: 14px; }
    .input:focus { border-color: ${escapeCss(config.primaryColor)}; box-shadow: 0 0 0 3px color-mix(in srgb, ${escapeCss(config.primaryColor)} 22%, transparent); }
    @media (max-width: 480px) { .root { right: 16px; bottom: 16px; } }
  </style>
  <div class="root">
    <section class="panel" data-panel hidden aria-label="${escapeHtml(config.botName)} support chat">
      <header class="header"><h2 class="title">${escapeHtml(config.botName)}</h2><button class="close" data-close aria-label="Close chat">×</button></header>
      <div class="content"><p class="message">${escapeHtml(config.welcomeMessage)}</p><input class="input" data-input placeholder="Type your message…" aria-label="Message" /></div>
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
