import ReactMarkdown from "react-markdown";

/**
 * Renders long-form MDX-body text with Ledra's marketing brand style.
 * Uses the already-loaded `react-markdown` and applies typography classes
 * tuned for the dark background (white/80 leading-[1.85] etc).
 */
export function MarkdownBody({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => (
          <h1 className="mt-12 mb-6 text-2xl md:text-3xl font-bold text-white leading-snug tracking-tight">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="mt-14 mb-5 text-xl md:text-2xl font-bold text-white leading-snug tracking-tight">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mt-10 mb-4 text-lg font-bold text-white leading-snug">
            {children}
          </h3>
        ),
        p: ({ children }) => (
          <p className="my-5 text-[0.938rem] md:text-base leading-[1.9] text-white/75">
            {children}
          </p>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target={href?.startsWith("http") ? "_blank" : undefined}
            rel={href?.startsWith("http") ? "noreferrer noopener" : undefined}
            className="text-blue-400 underline hover:text-blue-300 transition-colors"
          >
            {children}
          </a>
        ),
        ul: ({ children }) => (
          <ul className="my-5 list-disc pl-6 space-y-2 text-[0.938rem] leading-[1.9] text-white/75 marker:text-white/70">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="my-5 list-decimal pl-6 space-y-2 text-[0.938rem] leading-[1.9] text-white/75 marker:text-white/75">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="pl-1">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="my-6 border-l-2 border-blue-500/40 bg-blue-500/[0.04] pl-5 pr-4 py-3 text-white/70 italic">
            {children}
          </blockquote>
        ),
        code: ({ children }) => (
          <code className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[0.85em] text-blue-200 font-mono">
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="my-6 overflow-x-auto rounded-xl border border-white/[0.08] bg-black/40 p-5 text-[0.85rem] leading-relaxed text-white/85">
            {children}
          </pre>
        ),
        hr: () => <hr className="my-10 border-white/[0.08]" />,
        strong: ({ children }) => (
          <strong className="font-bold text-white">{children}</strong>
        ),
        em: ({ children }) => <em className="italic text-white/80">{children}</em>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
