import { mountWidget } from "./widget";

const parameters = new URLSearchParams(window.location.search);
const widgetKey = parameters.get("widgetKey");
const apiUrl = parameters.get("apiUrl") ?? import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const status = document.querySelector<HTMLElement>("#status");

if (!widgetKey) {
  if (status) {
    status.textContent = "Add ?widgetKey=<your Web Widget key> to this URL, then reload.";
  }
} else {
  if (status) {
    status.textContent = `Loading the widget against ${apiUrl}…`;
  }

  void mountWidget({ apiUrl, widgetKey }).then((loaded) => {
    if (status) {
      status.textContent = loaded
        ? "Widget loaded. Open the launcher in the bottom-right corner."
        : "Widget configuration was refused. Confirm this host is in the allowed domains list.";
    }
  });
}
