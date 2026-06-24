import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Rendert Markdown kompakt für Chat-Bubbles (kleine Typografie, enge Abstände).
 * Nutzt react-markdown (kein dangerouslySetInnerHTML → kein XSS-Risiko).
 */
export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        h1: ({ children }) => <p className="mb-1 mt-2 first:mt-0 font-bold text-[13px]">{children}</p>,
        h2: ({ children }) => <p className="mb-1 mt-2 first:mt-0 font-bold text-[13px]">{children}</p>,
        h3: ({ children }) => <p className="mb-1 mt-2 first:mt-0 font-bold">{children}</p>,
        ul: ({ children }) => <ul className="mb-1.5 last:mb-0 list-disc pl-4 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="mb-1.5 last:mb-0 list-decimal pl-4 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noreferrer" className="underline break-words">
            {children}
          </a>
        ),
        code: ({ children }) => (
          <code className="font-mono bg-surface-container-high rounded px-1 py-0.5">{children}</code>
        ),
        pre: ({ children }) => (
          <pre className="font-mono bg-surface-container-high rounded p-2 my-1.5 overflow-x-auto whitespace-pre-wrap [&_code]:bg-transparent [&_code]:p-0">
            {children}
          </pre>
        ),
        hr: () => <hr className="my-2 border-outline-variant" />,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-outline-variant pl-2 italic">{children}</blockquote>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
