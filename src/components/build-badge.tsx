'use client';

import { GitCommit } from 'lucide-react';
import { cn, relTime } from '@/lib/utils';

/**
 * Build badge — clickable micro-text showing repo · short SHA · relative date,
 * tooltipped with the commit subject. Deep-links to the commit on GitHub.
 *
 * Render in the login footer and the sidebar footer. Gracefully renders
 * nothing if next.config.ts couldn't capture git info (non-git build).
 */
export function BuildBadge({
    className,
    variant = 'inline',
}: {
    className?: string;
    /** `inline` = single-line mono. `stacked` = sha on top, repo below. */
    variant?: 'inline' | 'stacked';
}) {
    const sha = process.env.NEXT_PUBLIC_GIT_SHA;
    const repo = process.env.NEXT_PUBLIC_GITHUB_REPO;
    const msg = process.env.NEXT_PUBLIC_GIT_MSG;
    const date = process.env.NEXT_PUBLIC_GIT_DATE;

    if (!sha || !repo) return null;

    const commitUrl = `https://github.com/${repo}/commit/${sha}`;
    const repoName = repo.split('/')[1] ?? repo;
    const when = date ? relTime(date) : null;
    const title = msg ? `${msg}${when ? ` · ${when}` : ''}` : sha;

    if (variant === 'stacked') {
        return (
            <a
                href={commitUrl}
                target="_blank"
                rel="noreferrer"
                title={title}
                className={cn(
                    'block group leading-tight',
                    'text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 hover:text-foreground transition-colors',
                    className,
                )}
            >
                <span className="inline-flex items-center gap-1.5">
                    <GitCommit className="size-3" />
                    <span className="truncate">{repoName}</span>
                </span>
                <span className="block mt-0.5 tabular-nums">
                    {sha}{when && <span className="opacity-70"> · {when}</span>}
                </span>
            </a>
        );
    }

    return (
        <a
            href={commitUrl}
            target="_blank"
            rel="noreferrer"
            title={title}
            aria-label={`Build ${sha} on GitHub`}
            className={cn(
                'group inline-flex items-center gap-1.5',
                'text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 hover:text-foreground transition-colors',
                className,
            )}
        >
            <GitCommit className="size-3 shrink-0" />
            <span className="truncate">
                <span className="group-hover:underline underline-offset-2">{repoName}</span>
                <span className="opacity-50 mx-1">·</span>
                <span className="tabular-nums">{sha}</span>
                {when && <span className="opacity-70 ml-1">· {when}</span>}
            </span>
        </a>
    );
}

