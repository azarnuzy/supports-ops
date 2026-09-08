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
  const humanAgents = users.data?.users.filter((user) => user.role === "HUMAN_AGENT") ?? [];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    createHumanAgent.mutate(
      { email: email.trim(), name: name.trim(), password },
      {
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : "Failed to create Human Agent.");
        },
        onSuccess: () => {
          setName("");
          setEmail("");
          setPassword("");
          toast.success("Human Agent created.");
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
    setEmail,
    setName,
    setPassword,
    users,
  };
}
