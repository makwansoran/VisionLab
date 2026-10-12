import { useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { createEmailAccount, isAuthConfigured, signInWithEmail, signOut } from "../auth/authService";

export function LoginPage({ session, onSignedIn }: { session: Session | null; onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsError(false);
    setBusy(true);
    try {
      if (creatingAccount) {
        const { session: newSession } = await createEmailAccount(email, password);
        if (newSession) {
          onSignedIn();
        } else {
          setMessage("Account created. Check your email for a confirmation link, then sign in.");
        }
      } else {
        await signInWithEmail(email, password);
        onSignedIn();
      }
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    setMessage("");
    try {
      await signOut();
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Sign out failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page" aria-label="Account">
      <section className="login-card">
        <img className="login-logo" src="/spectr-logo.png" alt="VisionLab" />
        {session ? (
          <>
            <h1>You’re signed in</h1>
            <p className="login-subtitle">{session.user.email}</p>
            <button type="button" className="login-submit" disabled={busy} onClick={handleSignOut}>
              {busy ? "Signing out…" : "Sign out"}
            </button>
          </>
        ) : (
          <>
            <h1>{creatingAccount ? "Create your account" : "Welcome back"}</h1>
            <p className="login-subtitle">{creatingAccount ? "Create a VisionLab account with your email" : "Sign in to your VisionLab account"}</p>
            {!isAuthConfigured && (
              <p className="login-message" role="status">
                Add your Supabase project URL and publishable key to <code>.env.local</code> to enable sign-in.
              </p>
            )}
            <form className="login-form" onSubmit={submit}>
              <label htmlFor="login-email">Email</label>
              <input id="login-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                autoComplete={creatingAccount ? "new-password" : "current-password"}
                minLength={creatingAccount ? 6 : undefined}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button className="login-submit" type="submit" disabled={busy || !isAuthConfigured}>
                {busy ? "Please wait…" : creatingAccount ? "Create account" : "Sign in"}
              </button>
            </form>
            <p className="login-footer">
              {creatingAccount ? "Already have an account? " : "New to VisionLab? "}
              <button type="button" onClick={() => { setCreatingAccount((current) => !current); setMessage(""); }}>
                {creatingAccount ? "Sign in" : "Create an account"}
              </button>
            </p>
          </>
        )}
        {message && <p className={isError ? "login-message is-error" : "login-message"} role="status">{message}</p>}
      </section>
    </main>
  );
}
