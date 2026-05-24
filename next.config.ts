import type { NextConfig } from 'next';
import { execSync } from 'child_process';

/**
 * Capture the current git commit at build time so the dashboard can display
 * a clickable build badge ("rinjanianalytics/v304-dashboard-rinjani · abc1234")
 * that deep-links to the exact commit on GitHub.
 *
 * Wrapped in try/catch because:
 *   - The container image may have been built outside a git checkout
 *   - `git` may not be on the PATH at build time
 * In either case we fall back to a "dev" build with no SHA, which gracefully
 * hides the badge instead of breaking the build.
 */
function safeExec(cmd: string): string {
    try {
        return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
        return '';
    }
}

const gitSha    = safeExec('git rev-parse --short=7 HEAD');
const gitFull   = safeExec('git rev-parse HEAD');
const gitMsg    = safeExec('git log -1 --pretty=format:%s');
const gitDate   = safeExec('git log -1 --pretty=format:%cI');
const gitBranch = safeExec('git rev-parse --abbrev-ref HEAD');

const nextConfig: NextConfig = {
    env: {
        NEXT_PUBLIC_GIT_SHA: gitSha,
        NEXT_PUBLIC_GIT_SHA_FULL: gitFull,
        NEXT_PUBLIC_GIT_MSG: gitMsg,
        NEXT_PUBLIC_GIT_DATE: gitDate,
        NEXT_PUBLIC_GIT_BRANCH: gitBranch,
        NEXT_PUBLIC_GITHUB_REPO: 'rinjanianalytics/v304-dashboard-rinjani',
    },
};

export default nextConfig;
