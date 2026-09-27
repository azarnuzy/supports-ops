import { toast } from "@repo/ui/components/sonner";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useCreateHumanAgentMutation, workspaceUsersQueryOptions } from "../../../auth";

export function useHumanAgentsForm() {
  const users = useQuery(workspaceUsersQueryOptions);
  const createHumanAgent = useCreateHumanAgentMutation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "HUMAN_AGENT">("HUMAN_AGENT");
  const humanAgents = users.data?.users ?? [];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    createHumanAgent.mutate(
      { email: email.trim(), name: name.trim(), password, role },
      {
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : "Failed to create Human Agent.");
        },
        onSuccess: () => {
          setName("");
          setEmail("");
          setPassword("");
          toast.success("Workspace member added.");
        },
      },
    );
  }

  return {
    createHumanAgent,
    email,
    handleSubmit,
    humanAgents,
    name,
    password,
    role,
    setEmail,
    setName,
    setPassword,
    setRole,
    users,
  };
}
