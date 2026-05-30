/**
 * Entity drawer — public surface.
 *
 * Consumers import these three:
 *   - <EntityDrawerProvider> wraps the app shell (mounts state)
 *   - <EntityDrawer/> renders the slide-over (one per app)
 *   - useEntityDrawer() — call .open({type, id}) from any row/click
 */

export { EntityDrawerProvider, useEntityDrawer, type EntityKind, type EntityTarget } from './context';
export { EntityDrawer } from './drawer';
