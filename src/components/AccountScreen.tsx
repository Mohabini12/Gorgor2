"use client";

import { apiUrl } from "@/lib/api";
import React, { useCallback, useEffect, useState } from "react";
import {
  Ban,
  Check,
  Download,
  Edit3,
  Globe,
  KeyRound,
  Lock,
  LogOut,
  Palette,
  Shield,
  UserCheck,
  UserCog,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { GorgorLogo } from "./GorgorLogo";
import { DEFAULT_EMBLEM, type EmblemVariant } from "@/lib/emblem";
import type {
  CoordFormat,
  DmPermission,
  LocationSharingMode,
  ProfileVisibility,
  PublicOperator,
} from "@/types/gorgor";

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-12 h-7 rounded-full transition-colors shrink-0 border ${
        checked
          ? "bg-[#2D8CFF] border-[#53A4FF]"
          : "bg-[#132642] border-[#94B8E8]/25"
      }`}
    >
      <span
        className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export function AccountScreen() {
  const {
    user,
    t,
    lang,
    setLang,
    coordFormat,
    setCoordFormat,
    updateAccount,
    signOut,
    showToast,
    branding,
    updateBranding,
  } = useApp();

  const [editingProfile, setEditingProfile] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [callsign, setCallsign] = useState(user?.callsign ?? "");
  const [rankRole, setRankRole] = useState(user?.rankRole ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [savingProfile, setSavingProfile] = useState(false);

  const [showPwForm, setShowPwForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [savingPw, setSavingPw] = useState(false);

  const [blocked, setBlocked] = useState<PublicOperator[]>([]);

  // Backend-managed emblem / branding editor
  const [ringText, setRingText] = useState(DEFAULT_EMBLEM.ringText);
  const [emblemVariant, setEmblemVariant] = useState<EmblemVariant>("seal");
  const [emblemGold, setEmblemGold] = useState(DEFAULT_EMBLEM.gold);
  const [emblemGoldDeep, setEmblemGoldDeep] = useState(DEFAULT_EMBLEM.goldDeep);
  const [emblemRed, setEmblemRed] = useState(DEFAULT_EMBLEM.red);
  const [emblemRedDeep, setEmblemRedDeep] = useState(DEFAULT_EMBLEM.redDeep);
  const [emblemInk, setEmblemInk] = useState(DEFAULT_EMBLEM.ink);
  const [emblemRingInk, setEmblemRingInk] = useState(DEFAULT_EMBLEM.ringInk);
  const [emblemPlate, setEmblemPlate] = useState(DEFAULT_EMBLEM.plate);
  const [savingBranding, setSavingBranding] = useState(false);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName);
    setCallsign(user.callsign);
    setRankRole(user.rankRole);
    setBio(user.bio);
  }, [user]);

  // Reflect the emblem configuration stored in PostgreSQL
  useEffect(() => {
    if (!branding) return;
    setRingText(branding.emblem.ringText);
    setEmblemVariant(branding.variant);
    setEmblemGold(branding.emblem.gold);
    setEmblemGoldDeep(branding.emblem.goldDeep);
    setEmblemRed(branding.emblem.red);
    setEmblemRedDeep(branding.emblem.redDeep);
    setEmblemInk(branding.emblem.ink);
    setEmblemRingInk(branding.emblem.ringInk);
    setEmblemPlate(branding.emblem.plate);
  }, [branding]);

  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBranding(true);
    const res = await updateBranding({
      ringText,
      variant: emblemVariant,
      gold: emblemGold,
      goldDeep: emblemGoldDeep,
      red: emblemRed,
      redDeep: emblemRedDeep,
      ink: emblemInk,
      ringInk: emblemRingInk,
      plate: emblemPlate,
    });
    setSavingBranding(false);
    showToast(res.ok ? t.account.profileSaved : res.error || "Save failed.");
  };

  const loadBlocked = useCallback(async () => {
    try {
      const res = await fetch("/api/users/blocked", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setBlocked(data.blocked ?? []);
      }
    } catch {
      // ignore offline
    }
  }, []);

  useEffect(() => {
    loadBlocked();
  }, [loadBlocked]);

  if (!user) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    const res = await updateAccount({
      displayName,
      callsign,
      rankRole,
      bio,
    });
    setSavingProfile(false);
    if (res.ok) {
      setEditingProfile(false);
      showToast(t.account.profileSaved);
    } else if (res.error) {
      showToast(res.error);
    }
  };

  const handlePrivacyUpdate = async (patch: Record<string, unknown>) => {
    const res = await updateAccount(patch);
    if (res.ok) {
      showToast(t.account.privacySaved);
    } else if (res.error) {
      showToast(res.error);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setSavingPw(true);
    const res = await updateAccount({ currentPassword, newPassword });
    setSavingPw(false);
    if (res.ok) {
      setCurrentPassword("");
      setNewPassword("");
      setShowPwForm(false);
      showToast(t.account.passwordUpdated);
    } else {
      setPwError(res.error || "Password update failed.");
    }
  };

  const handleUnblock = async (id: string) => {
    await fetch(`/api/users/blocked?userId=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    loadBlocked();
  };

  return (
    <div className="h-full overflow-y-auto px-4 pt-4 pb-24 lg:pb-8">
      <div className="max-w-3xl mx-auto space-y-5">
        <h2 className="text-lg font-bold text-white">{t.account.title}</h2>

        {/* 1. Operator Profile Card */}
        <section className="rounded-2xl bg-[#0D1B30] border border-[#94B8E8]/16 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#7F95B2] flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#2D8CFF]" />
              {t.account.profileSection}
            </span>
            <button
              type="button"
              onClick={() => setEditingProfile((v) => !v)}
              className="min-h-[38px] px-3 rounded-xl bg-[#132642] hover:bg-[#1B3458] border border-[#94B8E8]/20 text-xs font-medium text-white flex items-center gap-1.5"
            >
              <Edit3 className="w-3.5 h-3.5 text-[#53A4FF]" />
              {editingProfile ? t.app.cancel : t.account.editProfile}
            </button>
          </div>

          {!editingProfile ? (
            <div className="flex items-start gap-3.5">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-base font-mono-grid font-bold text-white shrink-0 border border-white/15"
                style={{ backgroundColor: user.avatarColor }}
              >
                {user.callsign.slice(0, 3)}
              </div>
              <div className="min-w-0 space-y-0.5">
                <div className="text-xs font-mono-grid font-bold text-[#53A4FF]">
                  {user.callsign}
                </div>
                <div className="text-base font-semibold text-white">
                  {user.displayName}
                </div>
                <div className="text-xs text-[#B8C7DC]">{user.rankRole}</div>
                <div className="text-xs font-mono-grid text-[#7F95B2]">
                  @{user.username} · {user.email}
                </div>
                {user.bio && (
                  <p className="text-xs text-[#B8C7DC] pt-1.5">{user.bio}</p>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={handleSaveProfile} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#B8C7DC] mb-1">
                    {t.auth.displayName}
                  </label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-[#132642] border border-[#94B8E8]/20 text-sm text-white focus:outline-none focus:border-[#2D8CFF]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#B8C7DC] mb-1">
                    {t.auth.callsign}
                  </label>
                  <input
                    type="text"
                    required
                    value={callsign}
                    onChange={(e) => setCallsign(e.target.value.toUpperCase())}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-[#132642] border border-[#94B8E8]/20 text-sm font-mono-grid uppercase text-white focus:outline-none focus:border-[#2D8CFF]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#B8C7DC] mb-1">
                  {t.auth.rankRole}
                </label>
                <input
                  type="text"
                  required
                  value={rankRole}
                  onChange={(e) => setRankRole(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-[#132642] border border-[#94B8E8]/20 text-sm text-white focus:outline-none focus:border-[#2D8CFF]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#B8C7DC] mb-1">Bio</label>
                <textarea
                  rows={2}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full p-3 rounded-xl bg-[#132642] border border-[#94B8E8]/20 text-xs text-white focus:outline-none focus:border-[#2D8CFF]"
                />
              </div>
              <button
                type="submit"
                disabled={savingProfile}
                className="min-h-[46px] px-5 rounded-xl bg-[#2D8CFF] hover:bg-[#53A4FF] disabled:opacity-60 text-xs font-semibold text-white flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                {t.account.saveProfile}
              </button>
            </form>
          )}
        </section>

        {/* 2. Bilingual Language (Somali / English) & Coordinate Display */}
        <section className="rounded-2xl bg-[#0D1B30] border border-[#94B8E8]/16 p-4 sm:p-5 space-y-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#7F95B2] flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#2D8CFF]" />
            {t.account.languageSection}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#B8C7DC] mb-2">
              {t.account.appLanguage}
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {(
                [
                  { code: "en", label: t.account.langEnglish, tag: "EN" },
                  { code: "so", label: t.account.langSomali, tag: "SO" },
                ] as const
              ).map((item) => (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => setLang(item.code)}
                  className={`min-h-[48px] px-3.5 rounded-xl border text-left flex items-center justify-between transition-colors ${
                    lang === item.code
                      ? "bg-[#2D8CFF]/20 border-[#2D8CFF] text-white"
                      : "bg-[#071120] border-[#94B8E8]/16 text-[#B8C7DC] hover:text-white"
                  }`}
                >
                  <span className="text-xs sm:text-sm font-medium">
                    {item.label}
                  </span>
                  <span className="text-xs font-mono-grid font-bold text-[#53A4FF]">
                    {item.tag}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#B8C7DC] mb-2">
              {t.account.defaultCoord}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["MGRS", "DMS", "DD"] as CoordFormat[]).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setCoordFormat(fmt)}
                  className={`min-h-[44px] rounded-xl border text-xs font-mono-grid font-bold transition-colors ${
                    coordFormat === fmt
                      ? "bg-[#2D8CFF] border-[#53A4FF] text-white"
                      : "bg-[#071120] border-[#94B8E8]/16 text-[#B8C7DC] hover:text-white"
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* 3. Server-Enforced Privacy & OPSEC Settings */}
        <section className="rounded-2xl bg-[#0D1B30] border border-[#94B8E8]/16 p-4 sm:p-5 space-y-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#7F95B2] flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#2D8CFF]" />
            {t.account.privacySection}
          </div>

          {/* GPS Sharing Precision */}
          <div>
            <label className="block text-xs font-medium text-white mb-1.5">
              {t.account.locSharing}
            </label>
            <select
              value={user.locationSharing}
              onChange={(e) =>
                handlePrivacyUpdate({
                  locationSharing: e.target.value as LocationSharingMode,
                })
              }
              className="w-full min-h-[46px] px-3.5 rounded-xl bg-[#071120] border border-[#94B8E8]/22 text-xs sm:text-sm text-white focus:outline-none focus:border-[#2D8CFF]"
            >
              <option value="off">{t.account.locOff}</option>
              <option value="coarse_mgrs">{t.account.locCoarse}</option>
              <option value="exact">{t.account.locExact}</option>
            </select>
          </div>

          {/* Private DM Permission */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-white mb-1.5">
                {t.account.dmPermission}
              </label>
              <select
                value={user.allowDirectMessages}
                onChange={(e) =>
                  handlePrivacyUpdate({
                    allowDirectMessages: e.target.value as DmPermission,
                  })
                }
                className="w-full min-h-[46px] px-3 rounded-xl bg-[#071120] border border-[#94B8E8]/22 text-xs text-white focus:outline-none focus:border-[#2D8CFF]"
              >
                <option value="everyone">{t.account.dmEveryone}</option>
                <option value="groups_only">{t.account.dmGroupsOnly}</option>
                <option value="nobody">{t.account.dmNobody}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-white mb-1.5">
                {t.account.profileVis}
              </label>
              <select
                value={user.profileVisibility}
                onChange={(e) =>
                  handlePrivacyUpdate({
                    profileVisibility: e.target.value as ProfileVisibility,
                  })
                }
                className="w-full min-h-[46px] px-3 rounded-xl bg-[#071120] border border-[#94B8E8]/22 text-xs text-white focus:outline-none focus:border-[#2D8CFF]"
              >
                <option value="everyone">{t.account.visEveryone}</option>
                <option value="groups_only">{t.account.visGroupsOnly}</option>
              </select>
            </div>
          </div>

          {/* Toggle Rows */}
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#071120] border border-[#94B8E8]/12">
              <div>
                <div className="text-xs sm:text-sm font-medium text-white">
                  {t.account.showOnline}
                </div>
                <div className="text-[11px] text-[#7F95B2]">
                  {t.account.showOnlineDesc}
                </div>
              </div>
              <ToggleSwitch
                label={t.account.showOnline}
                checked={user.showOnlineStatus}
                onChange={(v) => handlePrivacyUpdate({ showOnlineStatus: v })}
              />
            </div>

            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#071120] border border-[#94B8E8]/12">
              <div>
                <div className="text-xs sm:text-sm font-medium text-white">
                  {t.account.readReceipts}
                </div>
                <div className="text-[11px] text-[#7F95B2]">
                  {t.account.readReceiptsDesc}
                </div>
              </div>
              <ToggleSwitch
                label={t.account.readReceipts}
                checked={user.readReceipts}
                onChange={(v) => handlePrivacyUpdate({ readReceipts: v })}
              />
            </div>

            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#071120] border border-[#94B8E8]/12">
              <div>
                <div className="text-xs sm:text-sm font-medium text-white">
                  {t.account.allowInvites}
                </div>
                <div className="text-[11px] text-[#7F95B2]">
                  {t.account.allowInvitesDesc}
                </div>
              </div>
              <ToggleSwitch
                label={t.account.allowInvites}
                checked={user.allowGroupInvites}
                onChange={(v) => handlePrivacyUpdate({ allowGroupInvites: v })}
              />
            </div>
          </div>
        </section>

        {/* 4. Emblem & Branding (generated and stored by the backend) */}
        <section className="rounded-2xl bg-[#0D1B30] border border-[#2D8CFF]/30 p-4 sm:p-5 space-y-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[#7F95B2] flex items-center gap-2">
              <Palette className="w-4 h-4 text-[#2D8CFF]" />
              {t.account.emblemSection}
            </div>
            <p className="text-xs text-[#B8C7DC] mt-1.5 leading-relaxed">
              {t.account.emblemDesc}
            </p>
          </div>

          <form onSubmit={handleSaveBranding} className="space-y-4">
            {/* Live vector preview of the backend configuration */}
            <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-xl bg-[#071120] border border-[#94B8E8]/14">
              <div className="shrink-0 rounded-xl p-2 bg-white/95 shadow-inner">
                <GorgorLogo
                  size={104}
                  variant={emblemVariant}
                  plate
                  config={{
                    ringText,
                    gold: emblemGold,
                    goldDeep: emblemGoldDeep,
                    red: emblemRed,
                    redDeep: emblemRedDeep,
                    ink: emblemInk,
                    ringInk: emblemRingInk,
                    plate: emblemPlate,
                  }}
                />
              </div>
              <div className="flex-1 w-full space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-[#7F95B2]">
                  {t.account.emblemPreview}
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={apiUrl("/api/branding/icon.svg?download=1")}
                    download="gorgor-emblem-seal.svg"
                    className="min-h-[40px] px-3.5 rounded-xl bg-[#2D8CFF] hover:bg-[#53A4FF] text-xs font-semibold text-white flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {t.account.emblemDownload} — Seal
                  </a>
                  <a
                    href={apiUrl("/api/branding/icon.svg?variant=mono&download=1")}
                    download="gorgor-emblem-mono.svg"
                    className="min-h-[40px] px-3.5 rounded-xl bg-[#132642] hover:bg-[#1B3458] border border-[#94B8E8]/20 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {t.account.emblemDownload} — Mono
                  </a>
                </div>
                <div className="text-[11px] font-mono-grid text-[#7F95B2]">
                  /api/branding/icon.svg
                </div>
              </div>
            </div>

            {/* Ring lettering + variant */}
            <div>
              <label className="block text-xs font-medium text-white mb-1.5">
                {t.account.emblemRingText}
              </label>
              <input
                type="text"
                maxLength={90}
                value={ringText}
                onChange={(e) => setRingText(e.target.value)}
                placeholder={DEFAULT_EMBLEM.ringText}
                className="w-full min-h-[46px] px-3.5 rounded-xl bg-[#071120] border border-[#94B8E8]/22 text-xs sm:text-sm text-white placeholder:text-[#7F95B2] focus:outline-none focus:border-[#2D8CFF]"
              />
              <div className="text-[11px] text-[#7F95B2] mt-1">
                {t.account.emblemRingHint}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-white mb-1.5">
                {t.account.emblemVariant}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: "seal", label: t.account.variantSeal },
                    { id: "mono", label: t.account.variantMono },
                  ] as const
                ).map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setEmblemVariant(v.id)}
                    className={`min-h-[44px] rounded-xl border text-xs font-semibold transition-colors ${
                      emblemVariant === v.id
                        ? "bg-[#2D8CFF] border-[#53A4FF] text-white"
                        : "bg-[#071120] border-[#94B8E8]/18 text-[#B8C7DC] hover:text-white"
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Emblem colours */}
            <div>
              <div className="text-xs font-medium text-white mb-2">
                {t.account.emblemColours}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {[
                  {
                    label: t.account.emblemGold,
                    value: emblemGold,
                    set: setEmblemGold,
                  },
                  {
                    label: `${t.account.emblemGold} 2`,
                    value: emblemGoldDeep,
                    set: setEmblemGoldDeep,
                  },
                  {
                    label: t.account.emblemRed,
                    value: emblemRed,
                    set: setEmblemRed,
                  },
                  {
                    label: `${t.account.emblemRed} 2`,
                    value: emblemRedDeep,
                    set: setEmblemRedDeep,
                  },
                  {
                    label: t.account.emblemInk,
                    value: emblemInk,
                    set: setEmblemInk,
                  },
                  {
                    label: t.account.emblemRingInk,
                    value: emblemRingInk,
                    set: setEmblemRingInk,
                  },
                ].map((swatch) => (
                  <label
                    key={swatch.label}
                    className="flex items-center justify-between gap-2 min-h-[44px] px-3 rounded-xl bg-[#071120] border border-[#94B8E8]/14 cursor-pointer"
                  >
                    <span className="text-xs text-[#B8C7DC] truncate">
                      {swatch.label}
                    </span>
                    <input
                      type="color"
                      value={swatch.value}
                      onChange={(e) => swatch.set(e.target.value)}
                      className="w-9 h-8 rounded-md bg-transparent border border-[#94B8E8]/25 shrink-0"
                    />
                  </label>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={savingBranding}
              className="min-h-[46px] px-5 rounded-xl bg-[#2D8CFF] hover:bg-[#53A4FF] disabled:opacity-60 text-xs font-semibold text-white flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              {t.account.saveProfile}
            </button>
          </form>
        </section>

        {/* 5. Blocked Accounts */}
        <section className="rounded-2xl bg-[#0D1B30] border border-[#94B8E8]/16 p-4 sm:p-5 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#7F95B2] flex items-center gap-2">
            <Ban className="w-4 h-4 text-[#2D8CFF]" />
            {t.account.blockedSection}
          </div>
          {blocked.length === 0 ? (
            <p className="text-xs text-[#7F95B2]">{t.account.noBlocked}</p>
          ) : (
            <div className="space-y-2">
              {blocked.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#071120] border border-[#94B8E8]/14"
                >
                  <div>
                    <div className="text-xs font-semibold text-white">
                      {b.displayName}{" "}
                      <span className="font-mono-grid text-[#53A4FF]">
                        ({b.callsign})
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUnblock(b.id)}
                    className="min-h-[36px] px-3 rounded-lg bg-[#132642] hover:bg-[#2D8CFF] text-xs font-medium text-white"
                  >
                    {t.comms.unblockOperator}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 5. Security & Session Actions */}
        <section className="rounded-2xl bg-[#0D1B30] border border-[#94B8E8]/16 p-4 sm:p-5 space-y-3.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#7F95B2] flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#2D8CFF]" />
            {t.account.securitySection}
          </div>

          <button
            type="button"
            onClick={() => {
              setShowPwForm((v) => !v);
              setPwError(null);
            }}
            className="w-full min-h-[46px] px-4 rounded-xl bg-[#132642] hover:bg-[#1B3458] border border-[#94B8E8]/20 text-xs sm:text-sm font-medium text-white flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#53A4FF]" />
              {t.account.changePassword}
            </span>
            <span className="text-xs text-[#7F95B2]">
              {showPwForm ? "−" : "+"}
            </span>
          </button>

          {showPwForm && (
            <form
              onSubmit={handlePasswordChange}
              className="p-3.5 rounded-xl bg-[#071120] border border-[#94B8E8]/15 space-y-3"
            >
              {pwError && (
                <div className="text-xs text-red-300">{pwError}</div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder={t.account.currentPassword}
                  className="min-h-[44px] px-3 rounded-xl bg-[#132642] border border-[#94B8E8]/20 text-xs text-white placeholder:text-[#7F95B2] focus:outline-none focus:border-[#2D8CFF]"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t.account.newPassword}
                  className="min-h-[44px] px-3 rounded-xl bg-[#132642] border border-[#94B8E8]/20 text-xs text-white placeholder:text-[#7F95B2] focus:outline-none focus:border-[#2D8CFF]"
                />
              </div>
              <button
                type="submit"
                disabled={savingPw}
                className="min-h-[42px] px-4 rounded-xl bg-[#2D8CFF] hover:bg-[#53A4FF] disabled:opacity-60 text-xs font-semibold text-white"
              >
                {t.account.updatePassword}
              </button>
            </form>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => signOut(false)}
              className="min-h-[46px] px-3.5 rounded-xl bg-[#132642] hover:bg-[#2D8CFF] border border-[#2D8CFF]/35 text-xs font-semibold text-white flex items-center justify-center gap-2 transition-colors"
            >
              <UserCog className="w-4 h-4" />
              {t.account.switchAccount}
            </button>
            <button
              type="button"
              onClick={() => signOut(false)}
              className="min-h-[46px] px-3.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-400/35 text-xs font-semibold text-red-200 flex items-center justify-center gap-2 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              {t.account.signOut}
            </button>
            <button
              type="button"
              onClick={() => signOut(true)}
              className="min-h-[46px] px-3.5 rounded-xl bg-[#071120] hover:bg-red-500/20 border border-[#94B8E8]/18 text-xs font-medium text-[#B8C7DC] hover:text-red-200 flex items-center justify-center gap-2 transition-colors"
            >
              {t.account.signOutAll}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
