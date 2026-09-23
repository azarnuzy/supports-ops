import type { ReactNode } from "react";

export function AuthLayout({
  children,
  eyebrow,
  footerRight,
  subtitle,
  title,
  topRight,
}: {
  children: ReactNode;
  eyebrow?: ReactNode;
  footerRight?: ReactNode;
  subtitle?: ReactNode;
  title: ReactNode;
  topRight?: ReactNode;
}) {
  return (
    <main className="grid min-h-screen justify-center p-2 lg:grid-cols-2">
      <section className="auth-brand-panel relative order-2 hidden h-full overflow-hidden rounded-3xl bg-primary lg:flex">
        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/20 to-black/55" />
        <div className="absolute top-10 space-y-1 px-10 text-white">
          <h1 className="text-2xl font-medium">SupportOps</h1>
          <p className="text-sm">Support, resolved with confidence.</p>
        </div>
        <div className="absolute bottom-10 grid w-full grid-cols-2 gap-6 px-10 text-sm text-white">
          <div>
            <h2 className="font-medium">AI-first support</h2>
            <p className="mt-1 opacity-80">Grounded answers for every Customer.</p>
          </div>
          <div className="border-l border-white/30 pl-6">
            <h2 className="font-medium">Human when needed</h2>
            <p className="mt-1 opacity-80">A Human Agent takes over safely.</p>
          </div>
        </div>
      </section>
      <section className="relative order-1 flex min-h-[calc(100vh-1rem)] items-center justify-center px-6 py-20">
        {topRight ? (
          <div className="absolute top-5 right-6 text-sm text-muted-foreground">{topRight}</div>
        ) : null}
        <div className="w-full space-y-8 sm:max-w-[350px]">
          <div className="space-y-2 text-center">
            {eyebrow}
            <h1 className="text-3xl font-medium">{title}</h1>
            {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          {children}
        </div>
        <div className="absolute right-6 bottom-5 left-6 flex justify-between text-xs text-muted-foreground">
          <span>© 2026 SupportOps</span>
          {footerRight}
        </div>
      </section>
    </main>
  );
}
