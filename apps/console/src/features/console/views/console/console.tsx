export default function ConsoleView({ title }: { title: string }) {
  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
    </main>
  );
}
