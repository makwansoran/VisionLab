import { createClient, type Session } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isAuthConfigured = Boolean(supabaseUrl && supabaseKey);

const supabase = isAuthConfigured ? createClient(supabaseUrl!, supabaseKey!) : null;

function getClient() {
  if (!supabase) {
    throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to .env.local, then restart the app.");
  }
  return supabase;
}

export async function signInWithEmail(email: string, password: string) {
  const { error } = await getClient().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

export async function createEmailAccount(email: string, password: string): Promise<{ session: Session | null }> {
  const { data, error } = await getClient().auth.signUp({ email: email.trim(), password });
  if (error) throw error;
  return { session: data.session };
}

export async function signOut() {
  const { error } = await getClient().auth.signOut({ scope: "local" });
  if (error) throw error;
}

export async function getCurrentSession() {
  const { data, error } = await getClient().auth.getSession();
  if (error) throw error;
  return data.session;
}

export function subscribeToAuthChanges(callback: (session: Session | null) => void) {
  return getClient().auth.onAuthStateChange((_event, session) => callback(session)).data.subscription;
}


