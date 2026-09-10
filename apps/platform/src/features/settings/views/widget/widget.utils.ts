const widgetScriptUrl = (import.meta.env.VITE_WIDGET_URL ?? "http://localhost:3001").replace(
  /\/$/,
  "",
);

export const domainPattern =
  /^(?:localhost|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63})(?::\d{1,5})?$/i;
export const hexColorPattern = /^#[0-9a-f]{6}$/i;

export function validateWidgetConfig(
  botName: string,
  welcomeMessage: string,
  primaryColor: string,
  closingMessage: string,
) {
  if (!botName.trim()) {
    return "Bot name is required.";
  }

  if (botName.trim().length > 60) {
    return "Bot name must be 60 characters or fewer.";
  }

  if (!welcomeMessage.trim()) {
    return "Welcome message is required.";
  }

  if (welcomeMessage.trim().length > 500) {
    return "Welcome message must be 500 characters or fewer.";
  }

  if (!hexColorPattern.test(primaryColor)) {
    return "Enter a hex colour, e.g. #2563eb.";
  }

  if (closingMessage.trim().length > 1000) {
    return "Closing message must be 1000 characters or fewer.";
  }

  return null;
}

export function domainsAreEqual(a: string[], b: string[]) {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((domain, index) => domain === b[index]);
}

export function buildEmbedSnippet(widgetKey: string | undefined) {
  if (!widgetKey) {
    return "";
  }

  return `<script\n  src="${widgetScriptUrl}/widget.js"\n  data-widget-key="${widgetKey}">\n</script>`;
}
