export { default as HumanAgentsView } from "./views/agents/agents";
export { default as WebWidgetSettingsView } from "./views/widget/widget";
export { default as AiSettingsView } from "./views/ai/ai";
export {
  useUpdateWebWidgetConfigMutation,
  webWidgetConfigQueryOptions,
} from "./widget-config.hooks";
export type { UpdateWebWidgetConfigInput, WebWidgetConfig } from "./widget-config.types";
