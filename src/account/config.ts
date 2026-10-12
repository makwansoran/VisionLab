export type AccountBackend = "local" | "supabase";

// One switch for where account data lives, one for the demo seed. Supabase comes later.
export const accountConfig = { backend: "local" as AccountBackend, seedDemo: true };
