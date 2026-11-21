"use client";

import { useCallback, useEffect, useState } from "react";
import "@/lib/api";

type Stats = {
  users: number;
  groups: number;
  messages: number;
  waypoints: number;
  sessions: number;
  onlineNow: number;
};
type AUser = {
  id: string;
  username: string;
  email: string;
  displayName: string;
  callsign: string;
  rankRole: string;
  lastSeenAt: string | null;
  createdAt: string;
};
type AGroup = {
  id: string;
  name: string;
  code: string;
  sector: string;
  members: number;
  createdBy: string | null;
};

async function call(url: string, method = "GET", body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

const input =
  "w-full rounded-lg bg-[#132642] border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500";
const btn =
  "rounded-lg px-3 py-2 text-sm font-semibold bg-[#2d8cff] text-white disabled:opacity-50";
const btnGhost =
  "rounded-lg px-3 py-1.5 text-xs font-semibold border border-white/15 text-slate-200";

export default function AdminPage() {
  const [tab, setTab] = useState<"overview" | "users" | "groups">("overview");
  const [denied, setDenied] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AUser[]>([]);
  const [groups, setGroups] = useState<AGroup[]>([]);
  const [adminId, setAdminId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    displayName: "",
    callsign: "",
    username: "",
    email: "",
    password: "",
    rankRole: "",
  });

  const load = useCallback(async () => {
    try {
      const [s, u, g] = await Promise.all([
        call("/api/admin/stats"),
        call("/api/admin/users"),
        call("/api/admin/groups"),
      ]);
      setStats(s);
      setUsers(u.users);
      setAdminId(u.adminId);
      setGroups(g.groups);
      setDenied(null);
    } catch (e) {
      setDenied(e instanceof Error ? e.message : "Access denied");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setMsg(null);
    try {
      await fn();
      setMsg(ok);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  }

  if (denied) {
    return (
      <div className="min-h-dvh bg-[#071120] text-white p-6">
        <h1 className="text-xl font-bold">GORGOR Admin</h1>
        <p className="mt-3 text-slate-300">
          {denied}. Sign in to the app first with an admin account, then open
          this page again.
        </p>
        <a href="/" className="mt-4 inline-block text-[#53a4ff] underline">
          Go to app
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#071120] text-white pb-16">
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">GORGOR Admin</h1>
          <a href="/" className={btnGhost}>
            App
          </a>
        </div>

        <div className="flex gap-2">
          {(["overview", "users", "groups"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold capitalize ${
                tab === t ? "bg-[#2d8cff]" : "bg-[#132642] text-slate-300"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {msg && (
          <div className="rounded-lg bg-[#132642] border border-white/10 px-3 py-2 text-sm">
            {msg}
          </div>
        )}

        {tab === "overview" && stats && (
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["Users", stats.users],
                ["Online (5 min)", stats.onlineNow],
                ["Groups", stats.groups],
                ["Messages", stats.messages],
                ["Waypoints", stats.waypoints],
                ["Active sessions", stats.sessions],
              ] as const
            ).map(([k, v]) => (
              <div
                key={k}
                className="rounded-xl bg-[#0d1b30] border border-white/10 p-4"
              >
                <div className="text-2xl font-bold">{v}</div>
                <div className="text-xs text-slate-400 mt-1">{k}</div>
              </div>
            ))}
          </div>
        )}

        {tab === "users" && (
          <div className="space-y-4">
            <div className="rounded-xl bg-[#0d1b30] border border-white/10 p-4 space-y-2">
              <h2 className="font-semibold">Add user</h2>
              {(
                [
                  ["displayName", "Full name & rank"],
                  ["callsign", "Callsign (optional)"],
                  ["username", "Username"],
                  ["email", "Email"],
                  ["password", "Password (min 8)"],
                  ["rankRole", "Role / specialty (optional)"],
                ] as const
              ).map(([k, ph]) => (
                <input
                  key={k}
                  className={input}
                  placeholder={ph}
                  type={k === "password" ? "text" : "text"}
                  value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                />
              ))}
              <button
                className={btn}
                onClick={() =>
                  run(async () => {
                    await call("/api/admin/users", "POST", form);
                    setForm({
                      displayName: "",
                      callsign: "",
                      username: "",
                      email: "",
                      password: "",
                      rankRole: "",
                    });
                  }, "User created.")
                }
              >
                Create user
              </button>
            </div>

            {users.map((u) => (
              <div
                key={u.id}
                className="rounded-xl bg-[#0d1b30] border border-white/10 p-4 space-y-2"
              >
                <div>
                  <div className="font-semibold">
                    {u.displayName}{" "}
                    <span className="text-xs text-[#53a4ff]">{u.callsign}</span>
                  </div>
                  <div className="text-xs text-slate-400">
                    @{u.username} · {u.email} · {u.rankRole}
                  </div>
                  <div className="text-xs text-slate-500">
                    Last seen:{" "}
                    {u.lastSeenAt
                      ? new Date(u.lastSeenAt).toLocaleString()
                      : "never"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={btnGhost}
                    onClick={() => {
                      const pw = window.prompt(
                        `New password for ${u.username} (min 8):`
                      );
                      if (pw)
                        run(
                          () =>
                            call(`/api/admin/users/${u.id}`, "PATCH", {
                              password: pw,
                            }),
                          "Password reset."
                        );
                    }}
                  >
                    Reset password
                  </button>
                  <button
                    className={btnGhost}
                    onClick={() =>
                      run(
                        () => call(`/api/admin/users/${u.id}/logout`, "POST"),
                        "User signed out everywhere."
                      )
                    }
                  >
                    Force sign-out
                  </button>
                  {u.id !== adminId && (
                    <button
                      className={`${btnGhost} !border-red-500/40 text-red-300`}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete ${u.username} and all their data?`
                          )
                        )
                          run(
                            () => call(`/api/admin/users/${u.id}`, "DELETE"),
                            "User deleted."
                          );
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "groups" && (
          <div className="space-y-3">
            {groups.length === 0 && (
              <p className="text-slate-400 text-sm">No groups yet.</p>
            )}
            {groups.map((g) => (
              <div
                key={g.id}
                className="rounded-xl bg-[#0d1b30] border border-white/10 p-4 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="font-semibold">
                    {g.name}{" "}
                    <span className="text-xs text-[#53a4ff]">{g.code}</span>
                  </div>
                  <div className="text-xs text-slate-400">
                    {g.members} members · {g.sector} · by {g.createdBy ?? "?"}
                  </div>
                </div>
                <button
                  className={`${btnGhost} !border-red-500/40 text-red-300`}
                  onClick={() => {
                    if (window.confirm(`Delete group ${g.name}?`))
                      run(
                        () => call(`/api/admin/groups/${g.id}`, "DELETE"),
                        "Group deleted."
                      );
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}




