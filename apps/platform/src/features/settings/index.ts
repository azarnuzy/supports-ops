export { default as HumanAgentsView } from "./views/agents/agents";
export { default as WebWidgetSettingsView } from "./views/widget/widget";
export {
  useUpdateWebWidgetConfigMutation,
  webWidgetConfigQueryOptions,
} from "./widget-config.hooks";
export type { UpdateWebWidgetConfigInput, WebWidgetConfig } from "./widget-config.types";
