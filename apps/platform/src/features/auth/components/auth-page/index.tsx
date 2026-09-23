import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { toast } from "@repo/ui/components/sonner";
import { AuthLayout } from "@repo/layouts/auth-layout";
import { Link } from "@tanstack/react-router";
import { EyeIcon, EyeOffIcon, GlobeIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useLoginMutation, useRegisterMutation } from "../../auth.hooks";
export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <AuthLayout
      title={isLogin ? "Login to your account" : "Create your account"}
      subtitle={
        isLogin ? "Please enter your details to login." : "Please enter your details to register."
      }
      topRight={
        <>
          {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
          <Link
            className="text-foreground underline-offset-4 hover:underline"
            to={isLogin ? "/register" : "/login"}
          >
            {isLogin ? "Register" : "Login"}
          </Link>
        </>
      }
      footerRight={
        <span className="flex items-center gap-1">
          <GlobeIcon className="size-3.5" /> ENG
        </span>
      }
    >
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
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              className="pr-10"
              autoComplete={isLogin ? "current-password" : "new-password"}
              minLength={isLogin ? undefined : 8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </button>
          </div>
        </div>
        <Button className="mt-2 w-full" type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Please wait..." : isLogin ? "Login" : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
