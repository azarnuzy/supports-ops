import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Field, FieldError, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { PlatformAppShell } from "../../../app-shell";
import { SettingsNav } from "../../components/settings-nav";
import { useHumanAgentsForm } from "./agents.hooks";

const HumanAgentsView = () => {
  const {
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
  } = useHumanAgentsForm();

  return (
    <PlatformAppShell>
      <section className="grid gap-8">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-muted-foreground">Workspace settings</p>
          <h1 className="text-3xl font-semibold text-balance">Human Agents</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Create a Human Agent with credentials they can use to sign in immediately.
          </p>
        </div>

        <SettingsNav />

        <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Add a Human Agent</CardTitle>
              <CardDescription>Set a temporary password and share it securely.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4" onSubmit={handleSubmit}>
                <Field>
                  <FieldLabel htmlFor="human-agent-name">Name</FieldLabel>
                  <Input
                    id="human-agent-name"
                    autoComplete="name"
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="human-agent-email">Email</FieldLabel>
                  <Input
                    id="human-agent-email"
                    autoComplete="email"
                    required
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="human-agent-password">Temporary password</FieldLabel>
                  <Input
                    id="human-agent-password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <FieldError>
                    {password && password.length < 8
                      ? "Temporary password must be at least 8 characters."
                      : null}
                  </FieldError>
                </Field>
                <Button type="submit" disabled={createHumanAgent.isPending || password.length < 8}>
                  {createHumanAgent.isPending ? "Creating..." : "Create Human Agent"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Human Agents in this Workspace</CardTitle>
              <CardDescription>Only people in this Workspace can appear here.</CardDescription>
            </CardHeader>
            <CardContent>
              {users.isPending ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
              {users.isError ? (
                <p className="text-sm text-destructive">Unable to load Human Agents.</p>
              ) : null}
              {!users.isPending && !users.isError && humanAgents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No Human Agents yet.</p>
              ) : null}
              <ul className="divide-y">
                {humanAgents.map((humanAgent) => (
                  <li className="flex items-center justify-between gap-4 py-4" key={humanAgent.id}>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{humanAgent.name}</p>
                      <p className="truncate text-sm text-muted-foreground">{humanAgent.email}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">Human Agent</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>
    </PlatformAppShell>
  );
};

export default HumanAgentsView;
