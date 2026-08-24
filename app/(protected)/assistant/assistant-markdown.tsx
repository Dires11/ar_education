import Link from "next/link";
import { ExternalLink } from "lucide-react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

function isInternalHref(href: string) {
  return href.startsWith("/") && !href.startsWith("//");
}

const components: Components = {
  h1: ({ children }) => (
    <h1 className="mb-3 mt-6 text-xl font-semibold tracking-tight first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2.5 mt-6 text-lg font-semibold tracking-tight first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-5 text-base font-semibold first:mt-0">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="my-3 leading-7 first:mt-0 last:mb-0">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  ul: ({ children }) => (
    <ul className="my-3 list-disc space-y-1.5 pl-5 marker:text-primary">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 list-decimal space-y-1.5 pl-5 marker:font-medium marker:text-muted-foreground">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-1 leading-7">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-2 border-primary/40 pl-4 text-muted-foreground">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-5 border-border" />,
  a: ({ href, children }) => {
    if (!href) return <span>{children}</span>;

    if (isInternalHref(href)) {
      return (
        <Link
          href={href}
          className="my-1 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1 font-medium text-primary no-underline transition-colors hover:border-primary/35 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span className="truncate">{children}</span>
          <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </Link>
      );
    }

    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-primary underline decoration-primary/35 underline-offset-4 transition-colors hover:decoration-primary"
      >
        {children}
        <ExternalLink
          className="ml-1 inline h-3.5 w-3.5 align-[-0.1em]"
          aria-hidden="true"
        />
      </a>
    );
  },
  code: ({ className, children }) => (
    <code
      className={cn(
        "rounded bg-muted px-1.5 py-0.5 font-mono text-[0.88em] text-foreground",
        className,
      )}
    >
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="my-4 max-w-full overflow-x-auto rounded-xl border bg-muted/60 p-4 text-xs leading-6 [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-4 max-w-full overflow-x-auto rounded-xl border">
      <table className="w-full min-w-md border-collapse text-left text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/70">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b px-3 py-2 font-semibold">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-b px-3 py-2 align-top last:border-b-0">
      {children}
    </td>
  ),
};

export function AssistantMarkdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 break-words text-[15px] text-foreground",
        className,
      )}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={components}
        skipHtml
        disallowedElements={["img"]}
      >
        {children}
      </Markdown>
    </div>
  );
}
