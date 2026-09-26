// Deliberately not in components/ui/sidebar.tsx. That module is 'use client', and
// a Server Component importing a plain value from a client module gets a client
// reference back, not the value -- the constant reads as undefined on the server.
// The root layout needs this name to size the sidebar on first paint, so it lives
// somewhere both sides can actually read it.
export const SIDEBAR_COOKIE_NAME = 'sidebar_state';
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
