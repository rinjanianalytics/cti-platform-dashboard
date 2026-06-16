'use client';

/**
 * Markdown — renders LLM/agent output (Hunt answers etc.) as styled HTML.
 *
 * Unlike EntityDescription (plain-text entity blurbs, links-only), agent
 * answers are genuinely rich markdown — headers, bold, numbered lists,
 * occasionally tables — so a real renderer (react-markdown + GFM) is the right
 * tool. Element overrides keep it on the Command Center type scale (compact,
 * muted, full-bleed-safe wrapping) rather than a generic `prose` block.
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

export function Markdown({ children, className }: { children: string; className?: string }) {
    return (
        <div className={cn('min-w-0 space-y-2 text-sm leading-relaxed wrap-break-word', className)}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    h1: ({ children }) => <h3 className="mt-3 text-sm font-semibold">{children}</h3>,
                    h2: ({ children }) => <h3 className="mt-3 text-sm font-semibold">{children}</h3>,
                    h3: ({ children }) => <h4 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h4>,
                    p: ({ children }) => <p className="wrap-break-word">{children}</p>,
                    ul: ({ children }) => <ul className="ml-4 list-disc space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="ml-4 list-decimal space-y-1">{children}</ol>,
                    li: ({ children }) => <li className="wrap-break-word">{children}</li>,
                    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                    em: ({ children }) => <em className="italic">{children}</em>,
                    a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">{children}</a>
                    ),
                    code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs wrap-break-word">{children}</code>,
                    pre: ({ children }) => <pre className="overflow-x-auto rounded bg-muted/50 p-2 text-xs">{children}</pre>,
                    blockquote: ({ children }) => <blockquote className="border-l-2 border-border pl-3 text-muted-foreground">{children}</blockquote>,
                    hr: () => <hr className="border-border" />,
                    table: ({ children }) => <div className="overflow-x-auto"><table className="w-full text-xs">{children}</table></div>,
                    th: ({ children }) => <th className="border border-border px-2 py-1 text-left font-medium">{children}</th>,
                    td: ({ children }) => <td className="border border-border px-2 py-1 align-top">{children}</td>,
                }}
            >
                {children}
            </ReactMarkdown>
        </div>
    );
}
