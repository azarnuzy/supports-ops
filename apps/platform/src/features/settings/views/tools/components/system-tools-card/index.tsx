import { BookOpenIcon, CircleCheckIcon, HistoryIcon, UserRoundIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SystemToolsCardProps } from "./index.types";

/** Capabilities the agent always has. They are not switches: turning off the transfer or the
 * close would strand a Customer with the AI, so this panel only explains what already works. */
const fixedCapabilities: ReadonlyArray<{ description: string; icon: LucideIcon; name: string }> = [
  {
    description: "Hands the conversation to a teammate and sends your transfer message.",
    icon: UserRoundIcon,
    name: "Transfer to human",
  },
  {
    description: "Closes the ticket once the customer's problem is solved.",
    icon: CircleCheckIcon,
    name: "End conversation",
  },
];

const builtInIcon: Record<string, LucideIcon> = {
  searchCustomerTicketHistory: HistoryIcon,
  searchKnowledge: BookOpenIcon,
};

export default function SystemToolsCard({ tools }: SystemToolsCardProps) {
  const builtIns = tools.filter((tool) => tool.origin === "BUILT_IN");

  return (
    <aside className="grid gap-3 rounded-xl border bg-card p-5 shadow-sm lg:sticky lg:top-6">
      <div>
        <h2 className="text-sm font-semibold">System tools</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          Built-in actions your agent can already perform. They need no setup and cannot be turned
          off.
        </p>
      </div>
      <ul className="grid gap-3">
        {builtIns.map((tool) => {
          const Icon = builtInIcon[tool.name] ?? BookOpenIcon;
          return (
            <li key={tool.id} className="flex gap-2.5">
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-[13px] font-medium">{tool.name}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{tool.description}</p>
              </div>
            </li>
          );
        })}
        {fixedCapabilities.map((capability) => (
          <li key={capability.name} className="flex gap-2.5">
            <capability.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-[13px] font-medium">{capability.name}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {capability.description}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
