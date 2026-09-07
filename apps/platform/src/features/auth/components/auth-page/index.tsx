import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { toast } from "@repo/ui/components/sonner";
import { Link } from "@tanstack/react-router";
import { CommandIcon, GlobeIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useLoginMutation, useRegisterMutation } from "../../auth.hooks";
export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useLoginMutation();
  const register = useRegisterMutation();
  const isLogin = mode === "login";
  const mutation = isLogin ? login : register;
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const onError = (error: Error) => toast.error(error.message);
    if (isLogin) login.mutate({ email, password }, { onError });
    else register.mutate({ name, email, password }, { onError });
  }
  return (
    <main className="grid min-h-screen justify-center p-2 lg:grid-cols-2">
      <section className="relative order-2 hidden h-full rounded-3xl bg-primary lg:flex">
        <div className="absolute top-10 space-y-1 px-10 text-primary-foreground">
          <CommandIcon className="size-10" />
          <h1 className="text-2xl font-medium">SupportOps</h1>
          <p className="text-sm">Support, resolved with confidence.</p>
        </div>
        <div className="absolute bottom-10 grid w-full grid-cols-2 gap-6 px-10 text-sm text-primary-foreground">
          <div>
            <h2 className="font-medium">AI-first support</h2>
            <p className="mt-1 opacity-80">
              Grounded answers for every Customer.
            </p>
          </div>
          <div className="border-l border-primary-foreground/30 pl-6">
            <h2 className="font-medium">Human when needed</h2>
            <p className="mt-1 opacity-80">A Human Agent takes over safely.</p>
          </div>
        </div>
      </section>
      <section className="relative order-1 flex min-h-[calc(100vh-1rem)] items-center justify-center px-6 py-20">
        <div className="absolute top-5 right-6 text-sm text-muted-foreground">
          {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
          <Link
            className="text-foreground underline-offset-4 hover:underline"
            to={isLogin ? "/register" : "/login"}
          >
            {isLogin ? "Register" : "Login"}
          </Link>
        </div>
        <div className="w-full space-y-8 sm:max-w-[350px]">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-medium">
              {isLogin ? "Login to your account" : "Create your account"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isLogin
                ? "Please enter your details to login."
                : "Please enter your details to register."}
            </p>
          </div>
          <form className="grid gap-4" onSubmit={handleSubmit}>
            {!isLogin && (
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={isLogin ? "current-password" : "new-password"}
                minLength={isLogin ? undefined : 8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <Button
              className="mt-2 w-full"
              type="submit"
              disabled={mutation.isPending}
            >
              {mutation.isPending
                ? "Please wait..."
                : isLogin
                  ? "Login"
                  : "Create account"}
            </Button>
          </form>
        </div>
        <div className="absolute right-6 bottom-5 left-6 flex justify-between text-xs text-muted-foreground">
          <span>© 2026 SupportOps</span>
          <span className="flex items-center gap-1">
            <GlobeIcon className="size-3.5" /> ENG
          </span>
        </div>
      </section>
    </main>
  );
}
