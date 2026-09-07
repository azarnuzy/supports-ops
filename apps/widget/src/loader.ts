type WidgetModule = typeof import("./widget");

const script = document.currentScript as HTMLScriptElement | null;

if (script) {
  const widgetKey = script.dataset.widgetKey;

  if (widgetKey) {
    const apiUrl = script.dataset.apiUrl ?? import.meta.env.VITE_API_URL ?? "http://localhost:8000";

    import("./widget").then((module: WidgetModule) => {
      module.mountWidget({ apiUrl, widgetKey });
    });
  }
}
