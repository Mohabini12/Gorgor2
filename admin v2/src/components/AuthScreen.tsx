"use client";

import { setToken, REGISTRATION_ENABLED } from "@/lib/api";
import React, { useState } from "react";
import { Shield, LogIn, UserPlus, AlertCircle, Globe } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { GorgorLogo } from "./GorgorLogo";


export function AuthScreen({ onDone }: { onDone?: () => void }) {
  const { t, lang, setLang, setUser, branding } = useApp();
  const [mode, setMode] = useState<"login" | "register">("login");
  const activeMode = REGISTRATION_ENABLED ? mode : "login";
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [callsign, setCallsign] = useState("");
  const [rankRole, setRankRole] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent, customId?: string, customPw?: string) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: customId ?? identifier,
          password: customPw ?? password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t.auth.authError);
        return;
      }
      setToken(data.token);
      setUser(data.user);
      onDone?.();
    } catch {
      setError(t.auth.authError);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          email,
          displayName,
          callsign: callsign || undefined,
          rankRole: rankRole || undefined,
          preferredLanguage: lang,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t.auth.authError);
        return;
      }
      setToken(data.token);
      setUser(data.user);
      onDone?.();
    } catch {
      setError(t.auth.authError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-[#071120] text-white flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        {/* Top bar with EN / SO switch */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GorgorLogo size={42} />
            <div>
              <h1 className="text-xl font-bold tracking-[0.14em] text-white">
                {branding?.appName || t.app.name}
              </h1>
              <p className="text-xs text-[#7F95B2]">
                {lang === "so"
                  ? branding?.subtitleSo || t.app.subtitle
                  : branding?.subtitleEn || t.app.subtitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setLang(lang === "en" ? "so" : "en")}
            className="min-h-[40px] px-3 rounded-lg bg-[#0D1B30] border border-[#94B8E8]/20 text-xs font-semibold tracking-wider text-white flex items-center gap-1.5 hover:border-[#2D8CFF] transition-colors"
          >
            <Globe className="w-3.5 h-3.5 text-[#2D8CFF]" />
            <span className={lang === "en" ? "text-[#2D8CFF]" : "text-[#7F95B2]"}>
              EN
            </span>
            <span className="text-[#7F95B2]">/</span>
            <span className={lang === "so" ? "text-[#2D8CFF]" : "text-[#7F95B2]"}>
              SO
            </span>
          </button>
        </div>

        {/* Auth Card */}
        <div className="rounded-2xl bg-[#0D1B30] border border-[#94B8E8]/16 p-6 shadow-2xl">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-white">
              {t.auth.welcomeTitle}
            </h2>
            <p className="text-xs text-[#B8C7DC] mt-1 leading-relaxed">
              {t.auth.welcomeSub}
            </p>
          </div>

          {/* Mode Tabs (hidden when registration is disabled) */}
          {REGISTRATION_ENABLED && (
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#071120] border border-[#94B8E8]/12 mb-5">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
              }}
              className={`min-h-[44px] rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                mode === "login"
                  ? "bg-[#2D8CFF] text-white shadow"
                  : "text-[#B8C7DC] hover:text-white"
              }`}
            >
              <LogIn className="w-4 h-4" />
              {t.auth.signIn}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError(null);
              }}
              className={`min-h-[44px] rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                mode === "register"
                  ? "bg-[#2D8CFF] text-white shadow"
                  : "text-[#B8C7DC] hover:text-white"
              }`}
            >
              <UserPlus className="w-4 h-4" />
              {t.auth.register}
            </button>
          </div>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/12 border border-red-500/35 text-xs text-red-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {activeMode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#B8C7DC] mb-1.5">
                  {t.auth.usernameOrEmail}
                </label>
                <input
                  type="text"
                  required
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="warsame / warsame@gorgor.so"
                  className="w-full min-h-[48px] px-3.5 rounded-xl bg-[#132642] border border-[#94B8E8]/20 text-sm text-white placeholder:text-[#7F95B2] focus:outline-none focus:border-[#2D8CFF]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#B8C7DC] mb-1.5">
                  {t.auth.password}
                </label>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full min-h-[48px] px-3.5 rounded-xl bg-[#132642] border border-[#94B8E8]/20 text-sm text-white placeholder:text-[#7F95B2] focus:outline-none focus:border-[#2D8CFF]"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[48px] rounded-xl bg-[#2D8CFF] hover:bg-[#53A4FF] active:bg-[#1A6ED8] disabled:opacity-60 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <Shield className="w-4 h-4" />
                {submitting ? t.auth.signingIn : t.auth.signIn}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#B8C7DC] mb-1">
                    {t.auth.displayName}
                  </label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Lt. Samira Hassan"
                    className="w-full min-h-[46px] px-3 rounded-xl bg-[#132642] border border-[#94B8E8]/20 text-sm text-white placeholder:text-[#7F95B2] focus:outline-none focus:border-[#2D8CFF]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#B8C7DC] mb-1">
                    {t.auth.callsign}
                  </label>
                  <input
                    type="text"
                    value={callsign}
                    onChange={(e) => setCallsign(e.target.value)}
                    placeholder="GORGOR-09"
                    className="w-full min-h-[46px] px-3 rounded-xl bg-[#132642] border border-[#94B8E8]/20 text-sm text-white font-mono-grid uppercase placeholder:text-[#7F95B2] focus:outline-none focus:border-[#2D8CFF]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#B8C7DC] mb-1">
                    {t.auth.username}
                  </label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="samira"
                    className="w-full min-h-[46px] px-3 rounded-xl bg-[#132642] border border-[#94B8E8]/20 text-sm text-white placeholder:text-[#7F95B2] focus:outline-none focus:border-[#2D8CFF]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#B8C7DC] mb-1">
                    {t.auth.rankRole}
                  </label>
                  <input
                    type="text"
                    value={rankRole}
                    onChange={(e) => setRankRole(e.target.value)}
                    placeholder="Field Navigator"
                    className="w-full min-h-[46px] px-3 rounded-xl bg-[#132642] border border-[#94B8E8]/20 text-sm text-white placeholder:text-[#7F95B2] focus:outline-none focus:border-[#2D8CFF]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#B8C7DC] mb-1">
                  {t.auth.email}
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="samira@gorgor.so"
                  className="w-full min-h-[46px] px-3 rounded-xl bg-[#132642] border border-[#94B8E8]/20 text-sm text-white placeholder:text-[#7F95B2] focus:outline-none focus:border-[#2D8CFF]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#B8C7DC] mb-1">
                  {t.auth.password}
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t.auth.passwordHint}
                  className="w-full min-h-[46px] px-3 rounded-xl bg-[#132642] border border-[#94B8E8]/20 text-sm text-white placeholder:text-[#7F95B2] focus:outline-none focus:border-[#2D8CFF]"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[48px] rounded-xl bg-[#2D8CFF] hover:bg-[#53A4FF] active:bg-[#1A6ED8] disabled:opacity-60 text-white text-sm font-semibold transition-colors"
              >
                {submitting ? t.auth.creatingAccount : t.auth.register}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
