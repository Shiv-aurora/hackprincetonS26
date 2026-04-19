// AuthGate: blocks access to the app shell until the user is authenticated.
import { useState, type FormEvent } from "react";
import { Layout, ShieldCheck, Loader2 } from "lucide-react";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";

// Google "G" logo as an inline SVG — avoids an external image dependency.
function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

// Renders a centered login/signup card; once authenticated, renders children.
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupDone, setSignupDone] = useState(false);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0d1117]">
        <Loader2 size={20} className="animate-spin text-[#4b8ec8]" />
      </div>
    );
  }

  if (user) return <>{children}</>;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    if (mode === "signin") {
      const err = await signIn(email, password);
      if (err) setError(err);
    } else {
      const err = await signUp(email, password);
      if (err) {
        setError(err);
      } else {
        setSignupDone(true);
      }
    }
    setSubmitting(false);
  }

  // Initiate Google OAuth redirect via Supabase.
  async function handleGoogle() {
    setGoogleLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
    // On success the browser redirects away; no cleanup needed.
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#0d1117]">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#13324a] text-[#d8ecff] shadow-[0_8px_24px_rgba(6,23,38,0.45)]">
            <Layout size={16} />
          </div>
          <div>
            <div className="text-[14px] font-semibold tracking-[0.02em] text-white">Asclepius</div>
            <div className="text-[11px] text-[#4b525a]">Clinical privacy workspace</div>
          </div>
        </div>

        <div className="rounded-[20px] border border-white/[0.06] bg-[#12161b] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
          {/* Google OAuth button */}
          <button
            onClick={handleGoogle}
            disabled={googleLoading}
            className="mb-4 flex w-full items-center justify-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] py-2.5 text-[13px] font-medium text-[#d5d9dd] transition-colors hover:bg-white/[0.08] disabled:opacity-50"
          >
            {googleLoading ? <Loader2 size={15} className="animate-spin" /> : <GoogleIcon />}
            Continue with Google
          </button>

          <div className="mb-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/[0.06]" />
            <span className="text-[11px] text-[#3a4248]">or</span>
            <div className="h-px flex-1 bg-white/[0.06]" />
          </div>

          <div className="mb-5 flex gap-1 rounded-xl border border-white/[0.05] bg-[#0d1117] p-1">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null); setSignupDone(false); }}
                className={`flex-1 rounded-xl py-2 text-[12px] font-medium transition-colors ${
                  mode === m
                    ? "bg-[#1c2530] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    : "text-[#5e666e] hover:text-[#adb5bc]"
                }`}
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          {signupDone ? (
            <div className="rounded-xl border border-[#2a4a2a] bg-[#1a2d1a] p-4 text-[13px] text-[#7ec87e]">
              Account created. Check your email to confirm, then sign in.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-[#5a6269]">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full rounded-xl border border-white/[0.06] bg-[#0d1117] px-3.5 py-2.5 text-[13px] text-white placeholder:text-[#3a4248] focus:border-[#2d5a8e] focus:outline-none"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-[#5a6269]">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  minLength={6}
                  className="w-full rounded-xl border border-white/[0.06] bg-[#0d1117] px-3.5 py-2.5 text-[13px] text-white placeholder:text-[#3a4248] focus:border-[#2d5a8e] focus:outline-none"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <p className="rounded-xl border border-[#4a2020] bg-[#2d1a1a] px-3 py-2.5 text-[12px] text-[#f48771]">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-[#1a4a7a] py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#1e5a94] disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ShieldCheck size={14} />
                )}
                {mode === "signin" ? "Sign in" : "Create account"}
              </button>
            </form>
          )}
        </div>

        <p className="mt-5 text-center text-[11px] text-[#3a4248]">
          Access restricted to authorised clinical staff
        </p>
      </div>
    </div>
  );
}
