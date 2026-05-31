import * as React from "react"

const MOBILE_BREAKPOINT = 768

// `useSyncExternalStore` is the canonical React-19 pattern for subscribing to
// browser APIs without the `setState-in-effect` anti-pattern. The previous
// version used `useState` + `useEffect` and called `setIsMobile(...)` inside
// the effect to seed the initial value, which trips
// `react-hooks/set-state-in-effect` in eslint-plugin-react-hooks v6.
//
// Three callbacks:
//   subscribe         — register a media-query change listener; returns the unsubscribe
//   getSnapshot       — read the current value during render (client only)
//   getServerSnapshot — SSR-safe default; we render mobile=false on the server
//                       because we can't measure the viewport there and the
//                       broader Command Center layout assumes desktop-first.
function subscribe(callback: () => void): () => void {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    mql.addEventListener("change", callback)
    return () => mql.removeEventListener("change", callback)
}

function getSnapshot(): boolean {
    return window.innerWidth < MOBILE_BREAKPOINT
}

function getServerSnapshot(): boolean {
    return false
}

export function useIsMobile(): boolean {
    return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
