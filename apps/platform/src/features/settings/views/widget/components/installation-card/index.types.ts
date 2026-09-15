export type InstallationCardProps = {
  copySnippet: () => Promise<boolean>;
  embedSnippet: string;
  widgetKey: string;
};
