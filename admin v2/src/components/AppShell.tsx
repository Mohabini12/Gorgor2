"use client";

import React from "react";
import {
  HardDriveDownload,
  LayoutDashboard,
  Map as MapIcon,
  MessageSquare,
  Navigation,
  UserCircle,
  WifiOff,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { GorgorLogo } from "./GorgorLogo";
import { AuthScreen } from "./AuthScreen";
import { DashboardScreen } from "./DashboardScreen";
import { MapScreen } from "./MapScreen";
import { OfflineManagerScreen } from "./OfflineManagerScreen";
import { CommsScreen } from "./CommsScreen";
import { AccountScreen } from "./AccountScreen";
import type { AppTab } from "@/types/gorgor";

export function AppShell() {
  const {
    user,
    authLoading,
    t,
    lang,
    setLang,
    isOnline,
    gps,
    branding,
    activeTab,
    setActiveTab,
    unreadCount,
    toast,
  } = useApp();

  if (authLoading) {
    return (
      <div className="min-h-[100dvh] bg-[#071120] text-white flex flex-col items-center justify-center gap-4">
        <GorgorLogo size={64} className="animate-pulse" />
        <div className="text-sm font-mono-grid tracking-widest text-[#B8C7DC]">
          {t.app.loading}
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  const navItems: {
    id: AppTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }[] = [
    { id: "home", label: t.nav.home, icon: LayoutDashboard },
    { id: "map", label: t.nav.map, icon: MapIcon },
    { id: "offline", label: t.nav.offline, icon: HardDriveDownload },
    {
      id: "comms",
      label: t.nav.comms,
      icon: MessageSquare,
      badge: unreadCount,
    },
    { id: "account", label: t.nav.account, icon: UserCircle },
  ];

  return (
    <div className="h-[100dvh] w-full bg-[#071120] text-white flex flex-col overflow-hidden">
      {/* Compact Military Tactical Top App Bar */}
      <header className="h-14 pt-safe px-3.5 sm:px-5 bg-[#071120] border-b border-[#94B8E8]/15 flex items-center justify-between gap-3 shrink-0 z-30">
        <button
          type="button"
          onClick={() => setActiveTab("home")}
          className="flex items-center gap-2.5 min-w-0 text-left"
        >
          <GorgorLogo size={36} />
          <div className="min-w-0">
            <div className="text-base font-extrabold tracking-[0.16em] text-white leading-none">
              {branding?.appName || t.app.name}
            </div>
            <div className="text-[10px] text-[#7F95B2] truncate mt-0.5 hidden xs:block sm:block">
              {lang === "so"
                ? branding?.subtitleSo || t.app.subtitle
                : branding?.subtitleEn || t.app.subtitle}
            </div>
          </div>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          {/* Active Live GPS Badge (only when real GPS lock is active) */}
          {gps.status === "active" && (
            <button
              type="button"
              onClick={() => setActiveTab("map")}
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/35 text-[11px] font-mono-grid font-semibold text-emerald-300"
            >
              <Navigation className="w-3 h-3" />
              GPS ±{Math.round(gps.position?.accuracy ?? 0)}m
            </button>
          )}

          {/* Connectivity Pill */}
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono-grid font-semibold ${
              isOnline
                ? "bg-[#0D1B30] border-[#94B8E8]/18 text-[#B8C7DC]"
                : "bg-amber-500/15 border-amber-400/35 text-amber-200"
            }`}
          >
            {isOnline ? (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            ) : (
              <WifiOff className="w-3 h-3 text-amber-300" />
            )}
            <span className="hidden sm:inline">
              {isOnline ? t.app.online : t.app.offline}
            </span>
          </div>

          {/* Instant Bilingual EN / SO Toggle Pill */}
          <div
            role="group"
            aria-label={t.account.appLanguage}
            className="flex items-center rounded-xl bg-[#0D1B30] border border-[#94B8E8]/20 p-0.5"
          >
            <button
              type="button"
              onClick={() => setLang("en")}
              className={`min-h-[32px] px-2.5 rounded-lg text-[11px] font-mono-grid font-bold transition-colors ${
                lang === "en"
                  ? "bg-[#2D8CFF] text-white"
                  : "text-[#7F95B2] hover:text-white"
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLang("so")}
              className={`min-h-[32px] px-2.5 rounded-lg text-[11px] font-mono-grid font-bold transition-colors ${
                lang === "so"
                  ? "bg-[#2D8CFF] text-white"
                  : "text-[#7F95B2] hover:text-white"
              }`}
            >
              SO
            </button>
          </div>
        </div>
      </header>

      {/* Main Responsive Body: Desktop Left Rail + Screen Canvas */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Desktop Navigation Rail */}
        <nav
          aria-label="Primary Navigation"
          className="hidden lg:flex w-52 flex-col justify-between bg-[#0D1B30]/75 border-r border-[#94B8E8]/15 p-3 shrink-0"
        >
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full min-h-[46px] px-3.5 rounded-xl flex items-center justify-between gap-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-[#2D8CFF] text-white shadow-md shadow-[#2D8CFF]/20"
                      : "text-[#B8C7DC] hover:bg-[#132642] hover:text-white"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  {item.badge && item.badge > 0 ? (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono-grid font-bold ${
                        active
                          ? "bg-white text-[#071120]"
                          : "bg-[#2D8CFF] text-white"
                      }`}
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setActiveTab("account")}
            className="p-2.5 rounded-xl bg-[#071120] hover:bg-[#132642] border border-[#94B8E8]/14 flex items-center gap-2.5 text-left transition-colors"
          >
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-[11px] font-mono-grid font-bold text-white shrink-0"
              style={{ backgroundColor: user.avatarColor }}
            >
              {user.callsign.slice(0, 3)}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-mono-grid font-bold text-[#53A4FF] truncate">
                {user.callsign}
              </div>
              <div className="text-[11px] text-[#B8C7DC] truncate">
                {user.displayName}
              </div>
            </div>
          </button>
        </nav>

        {/* Active Screen Viewport */}
        <main
          className={`flex-1 min-w-0 min-h-0 relative ${
            activeTab === "map" ? "pb-16 lg:pb-0" : ""
          }`}
        >
          {activeTab === "home" && <DashboardScreen />}
          {activeTab === "map" && <MapScreen />}
          {activeTab === "offline" && <OfflineManagerScreen />}
          {activeTab === "comms" && <CommsScreen />}
          {activeTab === "account" && <AccountScreen />}
        </main>
      </div>

      {/* Android Material-3 Bottom Navigation Bar (mobile & tablet < 1024px) */}
      <nav
        aria-label="Mobile Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0D1B30]/96 backdrop-blur-md border-t border-[#94B8E8]/18 pb-safe"
      >
        <div className="grid grid-cols-5 h-16 px-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className="relative flex flex-col items-center justify-center gap-0.5 min-h-[48px] text-center"
              >
                <span
                  className={`relative px-3.5 py-1 rounded-full transition-colors ${
                    active
                      ? "bg-[#2D8CFF]/22 text-[#53A4FF]"
                      : "text-[#7F95B2]"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.badge && item.badge > 0 ? (
                    <span className="absolute -top-1 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#2D8CFF] text-[10px] font-mono-grid font-bold text-white flex items-center justify-center">
                      {item.badge}
                    </span>
                  ) : null}
                </span>
                <span
                  className={`text-[10px] font-medium truncate max-w-[68px] ${
                    active ? "text-white font-semibold" : "text-[#7F95B2]"
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Subtle Floating Confirmation Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-[#132642] border border-[#2D8CFF]/60 text-xs font-medium text-white shadow-2xl pointer-events-none max-w-[90vw] truncate"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
