import { ConsolePageHeader } from "../../components/console-patterns";

export default function ConsoleView({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return <ConsolePageHeader title={title} description={description} />;
}
