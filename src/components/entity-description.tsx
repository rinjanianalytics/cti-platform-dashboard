'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Renders an entity description (actor, IOC, vulnerability, pulse, …)
 * with safe markdown-link rendering and citation cleanup.
 *
 * Why a purpose-built helper instead of `react-markdown`:
 *
 * Sampling the corpus shows only two markdown-ish patterns appear in
 * descriptions, and only on MITRE-imported actors:
 *   • `[Label](https://attack.mitre.org/...)` — anchored links to MITRE
 *   • `(Citation: Author Source Date)` — academic-style refs to papers
 *     we can't navigate to from the dashboard
 *
 * Other corpora (NVD, OTX pulses, IOC notes) are plain text — no bold,
 * italic, lists, headings, or code. Loading a full markdown parser
 * would import a remark/rehype tree for two patterns; the strict
 * pass-through here is both smaller and safer when descriptions come
 * from many ingestion sources of varying trust.
 *
 * Security notes:
 *   • Renders text as React children (no `dangerouslySetInnerHTML`),
 *     so any stray HTML tags appear as text — not executed.
 *   • Link targets allow-listed to http/https/mailto; other schemes
 *     (`javascript:`, `data:`) drop to plain text.
 *   • `rel="noopener noreferrer"` on every external link.
 */

const CITATION_RE = /\s*\(Citation:[^)]+\)/g;
const LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const SAFE_SCHEME = /^(https?:|mailto:)/i;

interface EntityDescriptionProps {
    /** Description text from the entity. Markdown links are rendered;
     *  `(Citation: …)` blocks are stripped as ingestion-time noise. */
    text: string | null | undefined;
    /** Tailwind classes for the outer wrapper. Defaults preserve
     *  newlines and use the standard body type scale. */
    className?: string;
    /** Copy shown when `text` is null / empty. */
    emptyText?: string;
    /** Tailwind classes for the empty-state span. */
    emptyClassName?: string;
}

export function EntityDescription({
    text,
    className,
    emptyText = 'No description available.',
    emptyClassName = 'text-sm text-muted-foreground',
}: EntityDescriptionProps) {
    if (!text || !text.trim()) {
        return <span className={emptyClassName}>{emptyText}</span>;
    }
    const stripped = text.replace(CITATION_RE, '');
    return (
        <div className={cn('text-sm leading-relaxed whitespace-pre-wrap', className)}>
            {renderWithLinks(stripped)}
        </div>
    );
}

function renderWithLinks(input: string): React.ReactNode[] {
    const out: React.ReactNode[] = [];
    let lastIndex = 0;
    let key = 0;
    LINK_RE.lastIndex = 0;

    let m: RegExpExecArray | null;
    while ((m = LINK_RE.exec(input)) !== null) {
        if (m.index > lastIndex) {
            out.push(input.slice(lastIndex, m.index));
        }
        const [, label, href] = m;
        if (SAFE_SCHEME.test(href)) {
            out.push(
                <a
                    key={`l${key++}`}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand hover:underline"
                >
                    {label}
                </a>,
            );
        } else {
            // Unsafe scheme — keep the visible label, drop the URL.
            out.push(label);
        }
        lastIndex = m.index + m[0].length;
    }
    if (lastIndex < input.length) {
        out.push(input.slice(lastIndex));
    }
    return out;
}
