import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";

const components: Components = {
  a: ({ href, ...props }) => (
    <a
      {...props}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2"
    />
  ),
  code: ({ className, children, ...props }) => {
    const language = /language-(\w+)/.exec(className ?? "")?.[1];
    if (!language) {
      return (
        <code {...props} className="rounded bg-black/10 px-1 py-0.5 text-[0.85em]">
          {children}
        </code>
      );
    }
    return (
      <div className="my-1 overflow-hidden rounded-md border border-border">
        <div className="border-b border-border bg-black/5 px-2 py-1 text-[0.7em] uppercase tracking-wide text-muted-foreground">
          {language}
        </div>
        <pre className="overflow-x-auto p-2 text-[0.85em]">
          <code {...props} className={className}>
            {children}
          </code>
        </pre>
      </div>
    );
  },
  p: ({ children }) => <p className="[&:not(:last-child)]:mb-2">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal pl-5 last:mb-0">{children}</ol>,
};

function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      allowedElements={["p", "a", "strong", "em", "code", "pre", "ul", "ol", "li", "br"]}
      unwrapDisallowed
      remarkPlugins={[remarkBreaks]}
      components={components}
    >
      {children}
    </ReactMarkdown>
  );
}

export { Markdown };
