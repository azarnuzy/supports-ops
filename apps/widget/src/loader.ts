type WidgetModule = typeof import("./widget");

const script = (document.currentScript ??
  document.querySelector("script[data-session-token]")) as HTMLScriptElement | null;

if (script) {
  const widgetKey = script.dataset.widgetKey;
  const accessToken = script.dataset.sessionToken;

  if (widgetKey || accessToken) {
    const apiUrl = script.dataset.apiUrl ?? import.meta.env.VITE_API_URL ?? "http://localhost:8000";

    import("./widget").then((module: WidgetModule) => {
      void module
        .mountWidget({ apiUrl, widgetKey, accessToken, fullPage: Boolean(accessToken) })
        .then((loaded) => {
          if (accessToken && !loaded)
            document.body.textContent = "This conversation link is invalid.";
        })
        .catch(() => {
          if (accessToken)
            document.body.textContent = "Could not load this conversation. Please try again.";
        });
    });
  }
}
