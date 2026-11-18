"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  Camera,
  Check,
  CheckCheck,
  Crosshair,
  Download,
  FileText,
  Image as ImageIcon,
  LogOut,
  MapPin,
  MessageSquare,
  Paperclip,
  Plus,
  Send,
  Shield,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { applyLocationPrivacy, formatBytes } from "@/lib/coordinates";
import type {
  ChatMessage,
  MessageAttachment,
  PublicOperator,
  TacticalGroup,
} from "@/types/gorgor";

function formatShortTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function CommsScreen() {
  const {
    user,
    t,
    commsView,
    setCommsView,
    activeGroupId,
    setActiveGroupId,
    activePeerId,
    setActivePeerId,
    groups,
    refreshGroups,
    threads,
    unreadCount,
    refreshThreads,
    gps,
    jumpToMap,
    pendingCoordShare,
    setPendingCoordShare,
    showToast,
  } = useApp();

  const [operators, setOperators] = useState<PublicOperator[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [stagedAttachments, setStagedAttachments] = useState<
    MessageAttachment[]
  >([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Mobile pane state (when in chat view on mobile: list vs active conversation)
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  // Lightbox image viewer
  const [lightboxAtt, setLightboxAtt] = useState<MessageAttachment | null>(
    null
  );

  // Squad management modals
  const [showCreateSquad, setShowCreateSquad] = useState(false);
  const [squadName, setSquadName] = useState("");
  const [squadCode, setSquadCode] = useState("");
  const [squadSector, setSquadSector] = useState("38N NH — Field Sector");
  const [squadDesc, setSquadDesc] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [squadFormError, setSquadFormError] = useState<string | null>(null);
  const [creatingSquad, setCreatingSquad] = useState(false);

  const [addMemberGroup, setAddMemberGroup] = useState<TacticalGroup | null>(
    null
  );
  const [showNewDmModal, setShowNewDmModal] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Load operator directory
  const loadOperators = useCallback(async () => {
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setOperators(data.operators ?? []);
      }
    } catch {
      // ignore offline
    }
  }, []);

  useEffect(() => {
    loadOperators();
  }, [loadOperators]);

  // Auto-open mobile chat when navigated with a pending coord pin or explicit open
  useEffect(() => {
    if (pendingCoordShare) {
      if (commsView === "group_chat" && activeGroupId) {
        setMobileChatOpen(true);
      } else if (commsView === "private" && activePeerId) {
        setMobileChatOpen(true);
      }
    }
  }, [pendingCoordShare, commsView, activeGroupId, activePeerId]);

  // Fetch messages for active group or private conversation
  const loadMessages = useCallback(
    async (silent = false) => {
      const isGroup = commsView === "group_chat" && activeGroupId;
      const isDm = commsView === "private" && activePeerId;
      if (!isGroup && !isDm) {
        setChatMessages([]);
        return;
      }

      if (!silent) setLoadingMsgs(true);
      try {
        const query = isGroup
          ? `groupId=${encodeURIComponent(activeGroupId!)}`
          : `userId=${encodeURIComponent(activePeerId!)}`;
        const res = await fetch(`/api/messages?${query}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          setChatMessages(data.messages ?? []);
          if (isDm) {
            refreshThreads();
          }
        }
      } catch {
        // offline
      } finally {
        if (!silent) setLoadingMsgs(false);
      }
    },
    [commsView, activeGroupId, activePeerId, refreshThreads]
  );

  useEffect(() => {
    setChatError(null);
    loadMessages(false);

    if (commsView === "groups") return;
    const timer = setInterval(() => {
      if (navigator.onLine && document.visibilityState === "visible") {
        loadMessages(true);
      }
    }, 3500);
    return () => clearInterval(timer);
  }, [commsView, activeGroupId, activePeerId, loadMessages]);

  // Auto-scroll to latest message when count changes
  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    if (chatMessages.length !== prevMsgCountRef.current) {
      prevMsgCountRef.current = chatMessages.length;
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages.length]);

  // Handle real multipart file upload (images + documents)
  const handleFilesSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    setChatError(null);
    setUploading(true);
    try {
      for (const file of files.slice(0, 4)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/uploads", {
          method: "POST",
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) {
          setChatError(data.error || "Upload failed.");
          break;
        }
        if (data.attachment) {
          setStagedAttachments((prev) => [...prev, data.attachment]);
        }
      }
    } catch {
      setChatError("Network error uploading file.");
    } finally {
      setUploading(false);
    }
  };

  // Attach operator's genuine live GPS coordinate (honoring privacy masking)
  const handleAttachLiveGps = () => {
    if (!gps.position) {
      gps.acquireOnce();
      showToast(t.dashboard.gpsRequesting);
      return;
    }
    const mode = user?.locationSharing ?? "coarse_mgrs";
    if (mode === "off") {
      setChatError(t.dashboard.broadcastBlockedByPrivacy);
      return;
    }
    const masked = applyLocationPrivacy(
      gps.position.lat,
      gps.position.lon,
      gps.position.accuracy,
      mode
    );
    if (!masked || masked.lat === null || masked.lon === null || !masked.mgrs) {
      setChatError(t.dashboard.broadcastBlockedByPrivacy);
      return;
    }
    setPendingCoordShare({
      lat: masked.lat,
      lon: masked.lon,
      mgrs: masked.mgrs,
      label:
        mode === "coarse_mgrs"
          ? `${user?.callsign} (1km MGRS)`
          : `${user?.callsign} GPS (±${Math.round(gps.position.accuracy)}m)`,
    });
  };

  // Transmit real message to PostgreSQL
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const isGroup = commsView === "group_chat" && activeGroupId;
    const isDm = commsView === "private" && activePeerId;
    if (!isGroup && !isDm) return;

    if (
      !draftText.trim() &&
      !pendingCoordShare &&
      stagedAttachments.length === 0
    ) {
      return;
    }

    setChatError(null);
    setSending(true);
    try {
      const payload: Record<string, unknown> = {
        content: draftText.trim(),
        attachmentIds: stagedAttachments.map((a) => a.id),
      };
      if (isGroup) payload.groupId = activeGroupId;
      if (isDm) payload.recipientId = activePeerId;
      if (pendingCoordShare) {
        payload.coord = {
          lat: pendingCoordShare.lat,
          lon: pendingCoordShare.lon,
          mgrs: pendingCoordShare.mgrs,
          label: pendingCoordShare.label,
        };
      }

      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setChatError(data.error || "Failed to send message.");
        return;
      }

      setDraftText("");
      setStagedAttachments([]);
      setPendingCoordShare(null);
      if (data.message) {
        setChatMessages((prev) => [...prev, data.message]);
      }
      if (isGroup) refreshGroups();
      if (isDm) refreshThreads();
    } catch {
      setChatError("Network error sending message.");
    } finally {
      setSending(false);
    }
  };

  const handleDeleteMessage = async (id: string) => {
    const res = await fetch(`/api/messages/${id}`, { method: "DELETE" });
    if (res.ok) {
      setChatMessages((prev) => prev.filter((m) => m.id !== id));
      refreshGroups();
      refreshThreads();
    }
  };

  const handleToggleBlock = async (peer: PublicOperator) => {
    if (peer.isBlocked) {
      await fetch(`/api/users/blocked?userId=${encodeURIComponent(peer.id)}`, {
        method: "DELETE",
      });
    } else {
      await fetch("/api/users/blocked", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: peer.id }),
      });
    }
    await Promise.all([loadOperators(), refreshThreads()]);
  };

  // Create new 5–6 member tactical squad
  const handleCreateSquad = async (e: React.FormEvent) => {
    e.preventDefault();
    setSquadFormError(null);
    if (selectedMemberIds.length < 4 || selectedMemberIds.length > 5) {
      setSquadFormError(t.comms.selectMembers);
      return;
    }
    setCreatingSquad(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: squadName,
          code: squadCode,
          sector: squadSector,
          description: squadDesc,
          memberIds: selectedMemberIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSquadFormError(data.error || "Failed to create squad.");
        return;
      }
      await refreshGroups();
      setShowCreateSquad(false);
      setSquadName("");
      setSquadCode("");
      setSquadDesc("");
      setSelectedMemberIds([]);
      if (data.group?.id) {
        setActiveGroupId(data.group.id);
      }
    } catch {
      setSquadFormError("Network error creating squad.");
    } finally {
      setCreatingSquad(false);
    }
  };

  const handleSquadMemberAction = async (
    groupId: string,
    body: Record<string, unknown>
  ) => {
    const res = await fetch(`/api/groups/${groupId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Action failed.");
      return;
    }
    await refreshGroups();
    setAddMemberGroup(null);
  };

  const handleDisbandSquad = async (groupId: string) => {
    const res = await fetch(`/api/groups/${groupId}`, { method: "DELETE" });
    if (res.ok) {
      await refreshGroups();
    }
  };

  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null;
  const activePeer =
    threads.find((th) => th.peer.id === activePeerId)?.peer ??
    operators.find((o) => o.id === activePeerId) ??
    null;

  // Render reusable chat conversation pane (used for both Group Chat & Private DMs)
  const renderConversationPane = () => {
    const isGroup = commsView === "group_chat";
    const hasTarget = isGroup ? Boolean(activeGroup) : Boolean(activePeer);

    if (!hasTarget) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-[#7F95B2]">
          <MessageSquare className="w-10 h-10 text-[#2D8CFF]/45 mb-3" />
          <p className="text-sm">
            {isGroup ? t.comms.selectGroupPrompt : t.comms.selectDmPrompt}
          </p>
        </div>
      );
    }

    return (
      <div className="flex-1 flex flex-col min-h-0 bg-[#071120]">
        {/* Conversation Header */}
        <div className="px-3.5 py-2.5 bg-[#0D1B30] border-b border-[#94B8E8]/15 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileChatOpen(false)}
              className="lg:hidden w-9 h-9 rounded-xl bg-[#132642] flex items-center justify-center text-white shrink-0"
              aria-label={t.app.back}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            {isGroup && activeGroup ? (
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono-grid font-bold text-[#53A4FF]">
                    {activeGroup.code}
                  </span>
                  <span className="text-sm font-semibold text-white truncate">
                    {activeGroup.name}
                  </span>
                </div>
                <div className="text-[11px] text-[#7F95B2] truncate">
                  {activeGroup.memberCount}/{activeGroup.maxMembers}{" "}
                  {t.dashboard.operators} · {activeGroup.sector}
                </div>
              </div>
            ) : activePeer ? (
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-mono-grid font-bold text-white shrink-0"
                  style={{ backgroundColor: activePeer.avatarColor }}
                >
                  {activePeer.callsign.slice(0, 3)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">
                    {activePeer.displayName}
                  </div>
                  <div className="text-[11px] text-[#7F95B2] flex items-center gap-1.5">
                    <span className="font-mono-grid text-[#53A4FF]">
                      {activePeer.callsign}
                    </span>
                    <span>·</span>
                    {activePeer.isOnline === true ? (
                      <span className="text-emerald-300">
                        {t.comms.onlineNow}
                      </span>
                    ) : activePeer.isOnline === null ? (
                      <span>{t.comms.statusHidden}</span>
                    ) : (
                      <span>{activePeer.rankRole}</span>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {!isGroup && activePeer && (
            <button
              type="button"
              onClick={() => handleToggleBlock(activePeer)}
              className={`min-h-[36px] px-2.5 rounded-xl border text-[11px] font-medium flex items-center gap-1 shrink-0 ${
                activePeer.isBlocked
                  ? "bg-red-500/20 border-red-400/45 text-red-200"
                  : "bg-[#132642] border-[#94B8E8]/20 text-[#B8C7DC] hover:text-white"
              }`}
            >
              <Ban className="w-3.5 h-3.5" />
              {activePeer.isBlocked
                ? t.comms.unblockOperator
                : t.comms.blockOperator}
            </button>
          )}
        </div>

        {/* Message List */}
        <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-3">
          {loadingMsgs && chatMessages.length === 0 ? (
            <div className="text-center text-xs text-[#7F95B2] py-8">
              ...
            </div>
          ) : chatMessages.length === 0 ? (
            <div className="text-center text-xs text-[#7F95B2] py-10 max-w-sm mx-auto">
              {t.comms.noMessages}
            </div>
          ) : (
            chatMessages.map((msg) => {
              const isMine = msg.senderId === user?.id;
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    isMine ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`max-w-[86%] sm:max-w-[74%] rounded-2xl px-3.5 py-2.5 space-y-2 border ${
                      isMine
                        ? "bg-[#1A6ED8] border-[#53A4FF]/40 text-white rounded-br-md"
                        : "bg-[#0D1B30] border-[#94B8E8]/18 text-white rounded-bl-md"
                    }`}
                  >
                    {isGroup && !isMine && (
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <span className="font-mono-grid font-bold text-[#53A4FF]">
                          {msg.sender.callsign}
                        </span>
                        <span className="text-[#7F95B2] truncate">
                          {msg.sender.displayName}
                        </span>
                      </div>
                    )}

                    {/* Message Text */}
                    {msg.content && (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                        {msg.content}
                      </p>
                    )}

                    {/* Tactical Coordinate Pin Card */}
                    {msg.coordLat !== null && msg.coordLon !== null && (
                      <button
                        type="button"
                        onClick={() =>
                          jumpToMap({
                            lat: msg.coordLat!,
                            lon: msg.coordLon!,
                            zoom: 14.5,
                            label: msg.coordLabel || msg.coordMgrs || "Pin",
                            mgrs: msg.coordMgrs || undefined,
                          })
                        }
                        className="w-full p-2.5 rounded-xl bg-[#071120]/85 hover:bg-[#071120] border border-[#53A4FF]/40 text-left flex items-center justify-between gap-2 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="text-[10px] font-mono-grid uppercase tracking-wider text-[#53A4FF] flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {msg.coordLabel || t.comms.coordPin}
                          </div>
                          <div className="text-xs font-mono-grid font-semibold text-white mt-0.5 truncate">
                            {msg.coordMgrs}
                          </div>
                        </div>
                        <span className="text-[11px] font-semibold text-[#53A4FF] shrink-0">
                          {t.comms.viewPinOnMap} →
                        </span>
                      </button>
                    )}

                    {/* Shared Images & Documents */}
                    {msg.attachments.length > 0 && (
                      <div className="space-y-2">
                        {msg.attachments.map((att) =>
                          att.category === "image" ? (
                            <div
                              key={att.id}
                              className="rounded-xl overflow-hidden border border-white/15 bg-[#071120]"
                            >
                              <button
                                type="button"
                                onClick={() => setLightboxAtt(att)}
                                className="block w-full"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={att.url}
                                  alt={att.fileName}
                                  loading="lazy"
                                  className="max-h-60 w-full object-cover"
                                />
                              </button>
                              <div className="px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px] text-[#B8C7DC]">
                                <span className="truncate">{att.fileName}</span>
                                <a
                                  href={`${att.url}?download=1`}
                                  download={att.fileName}
                                  className="text-[#53A4FF] hover:text-white shrink-0 font-mono-grid"
                                >
                                  {formatBytes(att.fileSize)} ↓
                                </a>
                              </div>
                            </div>
                          ) : (
                            <a
                              key={att.id}
                              href={`${att.url}?download=1`}
                              download={att.fileName}
                              className="flex items-center justify-between gap-2.5 p-2.5 rounded-xl bg-[#071120]/85 hover:bg-[#071120] border border-[#94B8E8]/25 transition-colors"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-9 h-9 rounded-lg bg-[#2D8CFF]/20 border border-[#2D8CFF]/40 flex items-center justify-center text-[#53A4FF] shrink-0">
                                  <FileText className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs font-medium text-white truncate">
                                    {att.fileName}
                                  </div>
                                  <div className="text-[10px] font-mono-grid text-[#7F95B2]">
                                    {att.fileName
                                      .split(".")
                                      .pop()
                                      ?.toUpperCase() || "DOC"}{" "}
                                    · {formatBytes(att.fileSize)}
                                  </div>
                                </div>
                              </div>
                              <Download className="w-4 h-4 text-[#53A4FF] shrink-0" />
                            </a>
                          )
                        )}
                      </div>
                    )}

                    {/* Timestamp, Read Receipt & Delete */}
                    <div className="flex items-center justify-end gap-2 text-[10px] font-mono-grid text-white/70">
                      <span>{formatShortTime(msg.createdAt)}</span>
                      {isMine && !isGroup && (
                        <span
                          className="inline-flex items-center gap-0.5"
                          title={msg.readAt ? t.comms.read : t.comms.sent}
                        >
                          {msg.readAt ? (
                            <CheckCheck className="w-3.5 h-3.5 text-sky-200" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                        </span>
                      )}
                      {isMine && (
                        <button
                          type="button"
                          onClick={() => handleDeleteMessage(msg.id)}
                          aria-label={t.comms.deleteMsg}
                          className="opacity-65 hover:opacity-100 ml-1"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Composer Banner for Errors, Coordinate Pin & Staged Files */}
        {(chatError || pendingCoordShare || stagedAttachments.length > 0) && (
          <div className="px-3.5 py-2 bg-[#0D1B30] border-t border-[#94B8E8]/15 space-y-2 shrink-0">
            {chatError && (
              <div className="text-xs text-red-300 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {chatError}
                </span>
                <button type="button" onClick={() => setChatError(null)}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {pendingCoordShare && (
              <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-[#132642] border border-[#2D8CFF]/40 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin className="w-3.5 h-3.5 text-[#53A4FF] shrink-0" />
                  <span className="font-mono-grid text-white truncate">
                    {pendingCoordShare.label} ({pendingCoordShare.mgrs})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingCoordShare(null)}
                  className="text-[#7F95B2] hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {stagedAttachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {stagedAttachments.map((att) => (
                  <div
                    key={att.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#132642] border border-[#94B8E8]/25 text-xs text-white"
                  >
                    {att.category === "image" ? (
                      <ImageIcon className="w-3.5 h-3.5 text-[#53A4FF]" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-[#53A4FF]" />
                    )}
                    <span className="max-w-[150px] truncate">
                      {att.fileName}
                    </span>
                    <span className="text-[10px] font-mono-grid text-[#7F95B2]">
                      ({formatBytes(att.fileSize)})
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setStagedAttachments((prev) =>
                          prev.filter((x) => x.id !== att.id)
                        )
                      }
                      className="text-[#7F95B2] hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Message & Attachment Composer */}
        <form
          onSubmit={handleSendMessage}
          className="px-3 py-2.5 bg-[#0D1B30] border-t border-[#94B8E8]/16 flex items-center gap-1.5 shrink-0"
        >
          {/* Standard Image + Document File Picker */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif,.pdf,.txt,.md,.csv,.json,.geojson,.gpx,.kml,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip"
            onChange={handleFilesSelected}
            className="hidden"
          />
          {/* Android Direct Camera Capture Input */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFilesSelected}
            className="hidden"
          />

          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            title={t.comms.attachFile}
            aria-label={t.comms.attachFile}
            className="w-11 h-11 rounded-xl bg-[#132642] hover:bg-[#1B3458] border border-[#94B8E8]/20 flex items-center justify-center text-[#B8C7DC] hover:text-white shrink-0"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <button
            type="button"
            disabled={uploading}
            onClick={() => cameraInputRef.current?.click()}
            title={t.comms.capturePhoto}
            aria-label={t.comms.capturePhoto}
            className="hidden xs:flex sm:flex w-11 h-11 rounded-xl bg-[#132642] hover:bg-[#1B3458] border border-[#94B8E8]/20 items-center justify-center text-[#B8C7DC] hover:text-white shrink-0"
          >
            <Camera className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleAttachLiveGps}
            title={t.comms.attachGps}
            aria-label={t.comms.attachGps}
            className="w-11 h-11 rounded-xl bg-[#132642] hover:bg-[#1B3458] border border-[#94B8E8]/20 flex items-center justify-center text-[#53A4FF] shrink-0"
          >
            <Crosshair className="w-4 h-4" />
          </button>

          <input
            type="text"
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            placeholder={
              uploading ? t.comms.uploading : t.comms.messagePlaceholder
            }
            className="flex-1 min-w-0 min-h-[44px] px-3.5 rounded-xl bg-[#132642] border border-[#94B8E8]/20 text-sm text-white placeholder:text-[#7F95B2] focus:outline-none focus:border-[#2D8CFF]"
          />

          <button
            type="submit"
            disabled={
              sending ||
              uploading ||
              (!draftText.trim() &&
                !pendingCoordShare &&
                stagedAttachments.length === 0)
            }
            aria-label={t.comms.send}
            className="min-h-[44px] min-w-[46px] px-3.5 rounded-xl bg-[#2D8CFF] hover:bg-[#53A4FF] disabled:opacity-45 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shrink-0 transition-colors"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">{t.comms.send}</span>
          </button>
        </form>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col overflow-hidden pb-16 lg:pb-0">
      {/* Top Sub-Navigation Bar: Squads (5–6) | Group Chat | Private DMs */}
      <div className="px-3.5 py-2.5 bg-[#071120] border-b border-[#94B8E8]/14 shrink-0">
        <div className="max-w-6xl mx-auto grid grid-cols-3 gap-1 p-1 rounded-2xl bg-[#0D1B30] border border-[#94B8E8]/16">
          <button
            type="button"
            onClick={() => {
              setCommsView("groups");
              setMobileChatOpen(false);
            }}
            className={`min-h-[42px] rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
              commsView === "groups"
                ? "bg-[#2D8CFF] text-white"
                : "text-[#B8C7DC] hover:text-white"
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span className="truncate">{t.comms.tabGroups}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCommsView("group_chat");
              if (!activeGroupId && groups[0]) {
                setActiveGroupId(groups[0].id);
              }
            }}
            className={`min-h-[42px] rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
              commsView === "group_chat"
                ? "bg-[#2D8CFF] text-white"
                : "text-[#B8C7DC] hover:text-white"
            }`}
          >
            <Shield className="w-4 h-4 shrink-0" />
            <span className="truncate">{t.comms.tabGroupChat}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCommsView("private");
              if (!activePeerId && threads[0]) {
                setActivePeerId(threads[0].peer.id);
              }
            }}
            className={`min-h-[42px] rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
              commsView === "private"
                ? "bg-[#2D8CFF] text-white"
                : "text-[#B8C7DC] hover:text-white"
            }`}
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            <span className="truncate">{t.comms.tabPrivate}</span>
            {unreadCount > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono-grid font-bold ${
                  commsView === "private"
                    ? "bg-white text-[#071120]"
                    : "bg-[#2D8CFF] text-white"
                }`}
              >
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* VIEW 1: SQUADS (5–6 MEMBERS) ROSTER & BUILDER */}
      {commsView === "groups" && (
        <div className="flex-1 overflow-y-auto px-4 py-4 pb-8">
          <div className="max-w-5xl mx-auto space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-[#B8C7DC]">
                {t.comms.squadCapacityRule}
              </p>
              <button
                type="button"
                onClick={() => {
                  loadOperators();
                  setSquadFormError(null);
                  setShowCreateSquad(true);
                }}
                className="min-h-[44px] px-4 rounded-xl bg-[#2D8CFF] hover:bg-[#53A4FF] text-xs font-semibold text-white flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t.comms.newSquad}
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {groups.map((grp) => {
                const isFull = grp.memberCount >= grp.maxMembers;
                const isOptimal =
                  grp.memberCount >= grp.minMembers &&
                  grp.memberCount <= grp.maxMembers;
                const isLeader = grp.myRole === "leader";

                return (
                  <div
                    key={grp.id}
                    className="rounded-2xl bg-[#0D1B30] border border-[#94B8E8]/16 p-4 flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono-grid font-bold text-[#53A4FF]">
                              {grp.code}
                            </span>
                            <span
                              className={`text-[10px] font-mono-grid font-bold px-2 py-0.5 rounded-full border ${
                                isFull
                                  ? "bg-[#2D8CFF]/20 text-[#53A4FF] border-[#2D8CFF]/40"
                                  : isOptimal
                                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/35"
                                  : "bg-amber-500/15 text-amber-200 border-amber-400/35"
                              }`}
                            >
                              {grp.memberCount}/{grp.maxMembers} ·{" "}
                              {isFull
                                ? t.comms.fullSquad
                                : isOptimal
                                ? t.comms.optimalSquad
                                : t.comms.underStrength}
                            </span>
                          </div>
                          <h3 className="text-base font-semibold text-white mt-1">
                            {grp.name}
                          </h3>
                          <div className="text-xs font-mono-grid text-[#7F95B2]">
                            {grp.sector}
                          </div>
                          {grp.description && (
                            <p className="text-xs text-[#B8C7DC] mt-1.5 leading-relaxed">
                              {grp.description}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* 5–6 Operator Roster */}
                      <div className="mt-3 pt-3 border-t border-[#94B8E8]/12 space-y-1.5">
                        {grp.members.map((m) => {
                          const isSelf = m.userId === user?.id;
                          const roleKey =
                            `role_${m.role}` as keyof typeof t.comms;
                          return (
                            <div
                              key={m.id}
                              className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-[#071120] border border-[#94B8E8]/10"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="relative shrink-0">
                                  <div
                                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-mono-grid font-bold text-white"
                                    style={{
                                      backgroundColor: m.operator.avatarColor,
                                    }}
                                  >
                                    {m.operator.callsign.slice(-2)}
                                  </div>
                                  {m.operator.isOnline === true && (
                                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#071120]" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-medium text-white truncate">
                                      {m.operator.displayName}
                                    </span>
                                    <span className="text-[10px] font-mono-grid text-[#53A4FF]">
                                      {m.operator.callsign}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-[#7F95B2] truncate">
                                    {t.comms[roleKey] as string}
                                    {m.operator.sharedLocation
                                      ? ` · ${m.operator.sharedLocation.mgrs}`
                                      : ""}
                                  </div>
                                </div>
                              </div>

                              {!isSelf && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActivePeerId(m.userId);
                                      setCommsView("private");
                                      setMobileChatOpen(true);
                                    }}
                                    className="min-h-[32px] px-2.5 rounded-lg bg-[#132642] hover:bg-[#2D8CFF] text-[11px] font-medium text-white transition-colors"
                                  >
                                    {t.comms.messageDirect}
                                  </button>
                                  {isLeader && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleSquadMemberAction(grp.id, {
                                          action: "remove_member",
                                          userId: m.userId,
                                        })
                                      }
                                      title={t.comms.removeOperator}
                                      className="w-8 h-8 rounded-lg bg-[#132642] hover:bg-red-500/20 text-[#7F95B2] hover:text-red-300 flex items-center justify-center"
                                    >
                                      <UserMinus className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Squad Card Action Bar */}
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-[#94B8E8]/12">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveGroupId(grp.id);
                          setCommsView("group_chat");
                          setMobileChatOpen(true);
                        }}
                        className="flex-1 min-h-[42px] px-3 rounded-xl bg-[#2D8CFF] hover:bg-[#53A4FF] text-xs font-semibold text-white flex items-center justify-center gap-1.5"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        {t.comms.openGroupChat}
                      </button>

                      {!isFull && (
                        <button
                          type="button"
                          onClick={() => {
                            loadOperators();
                            setAddMemberGroup(grp);
                          }}
                          className="min-h-[42px] px-3 rounded-xl bg-[#132642] hover:bg-[#1B3458] border border-[#2D8CFF]/35 text-xs font-semibold text-[#53A4FF] flex items-center gap-1.5"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          {t.comms.addOperator}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          handleSquadMemberAction(grp.id, { action: "leave" })
                        }
                        title={t.comms.leaveSquad}
                        className="min-h-[42px] px-3 rounded-xl bg-[#132642] hover:bg-red-500/20 text-xs text-[#B8C7DC] hover:text-red-200 flex items-center gap-1"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                      </button>

                      {isLeader && (
                        <button
                          type="button"
                          onClick={() => handleDisbandSquad(grp.id)}
                          title={t.comms.disbandSquad}
                          className="min-h-[42px] px-3 rounded-xl bg-[#132642] hover:bg-red-500/20 text-xs text-[#7F95B2] hover:text-red-300 flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2 & 3: GROUP CHAT OR PRIVATE DIRECT MESSAGES (Split pane desktop / Stack mobile) */}
      {(commsView === "group_chat" || commsView === "private") && (
        <div className="flex-1 flex min-h-0 max-w-6xl w-full mx-auto">
          {/* Left Thread / Squad Sidebar */}
          <aside
            className={`${
              mobileChatOpen ? "hidden lg:flex" : "flex"
            } w-full lg:w-80 flex-col border-r border-[#94B8E8]/15 bg-[#0D1B30]/65 min-h-0`}
          >
            {commsView === "private" && (
              <div className="p-3 border-b border-[#94B8E8]/12">
                <button
                  type="button"
                  onClick={() => {
                    loadOperators();
                    setShowNewDmModal(true);
                  }}
                  className="w-full min-h-[44px] rounded-xl bg-[#2D8CFF] hover:bg-[#53A4FF] text-xs font-semibold text-white flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  {t.comms.newDm}
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
              {commsView === "group_chat"
                ? groups.map((grp) => {
                    const selected = grp.id === activeGroupId;
                    return (
                      <button
                        key={grp.id}
                        type="button"
                        onClick={() => {
                          setActiveGroupId(grp.id);
                          setMobileChatOpen(true);
                        }}
                        className={`w-full p-3 rounded-xl border text-left transition-colors ${
                          selected
                            ? "bg-[#132642] border-[#2D8CFF]"
                            : "bg-[#0D1B30] border-[#94B8E8]/12 hover:border-[#94B8E8]/30"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-mono-grid font-bold text-[#53A4FF]">
                            {grp.code}
                          </span>
                          <span className="text-[10px] font-mono-grid text-[#7F95B2]">
                            {grp.memberCount}/{grp.maxMembers} OPS
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-white truncate mt-0.5">
                          {grp.name}
                        </div>
                        {grp.lastMessage && (
                          <div className="text-xs text-[#7F95B2] truncate mt-1">
                            <span className="text-[#B8C7DC]">
                              {grp.lastMessage.senderCallsign}:
                            </span>{" "}
                            {grp.lastMessage.content ||
                              (grp.lastMessage.hasAttachment
                                ? "📎 Attachment"
                                : "📍 MGRS Pin")}
                          </div>
                        )}
                      </button>
                    );
                  })
                : threads.map((th) => {
                    const selected = th.peer.id === activePeerId;
                    return (
                      <button
                        key={th.peer.id}
                        type="button"
                        onClick={() => {
                          setActivePeerId(th.peer.id);
                          setMobileChatOpen(true);
                        }}
                        className={`w-full p-3 rounded-xl border text-left flex items-center gap-3 transition-colors ${
                          selected
                            ? "bg-[#132642] border-[#2D8CFF]"
                            : "bg-[#0D1B30] border-[#94B8E8]/12 hover:border-[#94B8E8]/30"
                        }`}
                      >
                        <div className="relative shrink-0">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-mono-grid font-bold text-white"
                            style={{ backgroundColor: th.peer.avatarColor }}
                          >
                            {th.peer.callsign.slice(-2)}
                          </div>
                          {th.peer.isOnline === true && (
                            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#0D1B30]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-white truncate">
                              {th.peer.displayName}
                            </span>
                            {th.unreadCount > 0 && (
                              <span className="px-1.5 py-0.5 rounded-full bg-[#2D8CFF] text-[10px] font-mono-grid font-bold text-white">
                                {th.unreadCount}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-[#7F95B2] truncate mt-0.5">
                            {th.lastMessage?.content ||
                              (th.lastMessage?.hasAttachment
                                ? "📎 Attachment"
                                : "📍 MGRS Pin")}
                          </div>
                        </div>
                      </button>
                    );
                  })}
            </div>
          </aside>

          {/* Right Conversation Pane */}
          <div
            className={`${
              mobileChatOpen ? "flex" : "hidden lg:flex"
            } flex-1 flex-col min-h-0`}
          >
            {renderConversationPane()}
          </div>
        </div>
      )}

      {/* Create 5–6 Operator Squad Modal */}
      {showCreateSquad && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <form
            onSubmit={handleCreateSquad}
            className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl bg-[#0D1B30] border border-[#94B8E8]/22 p-5 shadow-2xl max-h-[88dvh] overflow-y-auto space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">
                {t.comms.createSquadTitle}
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateSquad(false)}
                className="w-9 h-9 rounded-xl bg-[#132642] flex items-center justify-center text-[#B8C7DC]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {squadFormError && (
              <div className="p-3 rounded-xl bg-red-500/12 border border-red-400/35 text-xs text-red-200">
                {squadFormError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="sm:col-span-2">
                <label className="block text-xs text-[#B8C7DC] mb-1">
                  {t.comms.squadName}
                </label>
                <input
                  type="text"
                  required
                  value={squadName}
                  onChange={(e) => setSquadName(e.target.value)}
                  placeholder={t.comms.squadNamePlaceholder}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-[#132642] border border-[#94B8E8]/20 text-xs text-white focus:outline-none focus:border-[#2D8CFF]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#B8C7DC] mb-1">
                  {t.comms.squadCode}
                </label>
                <input
                  type="text"
                  required
                  value={squadCode}
                  onChange={(e) => setSquadCode(e.target.value.toUpperCase())}
                  placeholder={t.comms.squadCodePlaceholder}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-[#132642] border border-[#94B8E8]/20 text-xs font-mono-grid uppercase text-white focus:outline-none focus:border-[#2D8CFF]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#B8C7DC] mb-1">
                {t.comms.squadSector}
              </label>
              <input
                type="text"
                value={squadSector}
                onChange={(e) => setSquadSector(e.target.value)}
                placeholder={t.comms.squadSectorPlaceholder}
                className="w-full min-h-[42px] px-3 rounded-xl bg-[#132642] border border-[#94B8E8]/20 text-xs font-mono-grid text-white focus:outline-none focus:border-[#2D8CFF]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-[#B8C7DC]">{t.comms.selectMembers}</span>
                <span
                  className={`font-mono-grid font-bold ${
                    selectedMemberIds.length >= 4 &&
                    selectedMemberIds.length <= 5
                      ? "text-emerald-300"
                      : "text-amber-300"
                  }`}
                >
                  {selectedMemberIds.length + 1}/6
                </span>
              </div>

              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {operators.map((op) => {
                  const checked = selectedMemberIds.includes(op.id);
                  const disableAdd =
                    !checked &&
                    (selectedMemberIds.length >= 5 || !op.allowGroupInvites);
                  return (
                    <button
                      key={op.id}
                      type="button"
                      disabled={disableAdd}
                      onClick={() =>
                        setSelectedMemberIds((prev) =>
                          checked
                            ? prev.filter((id) => id !== op.id)
                            : [...prev, op.id]
                        )
                      }
                      className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-colors ${
                        checked
                          ? "bg-[#2D8CFF]/20 border-[#2D8CFF]"
                          : "bg-[#071120] border-[#94B8E8]/14 disabled:opacity-45"
                      }`}
                    >
                      <div>
                        <div className="text-xs font-semibold text-white">
                          {op.displayName}{" "}
                          <span className="font-mono-grid text-[#53A4FF]">
                            ({op.callsign})
                          </span>
                        </div>
                        <div className="text-[11px] text-[#7F95B2]">
                          {op.rankRole}
                          {!op.allowGroupInvites
                            ? ` · ${t.comms.invitesDisabled}`
                            : ""}
                        </div>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                          checked
                            ? "bg-[#2D8CFF] border-[#2D8CFF] text-white"
                            : "border-[#94B8E8]/35"
                        }`}
                      >
                        {checked && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateSquad(false)}
                className="flex-1 min-h-[46px] rounded-xl bg-[#132642] text-xs font-semibold text-[#B8C7DC]"
              >
                {t.app.cancel}
              </button>
              <button
                type="submit"
                disabled={
                  creatingSquad ||
                  selectedMemberIds.length < 4 ||
                  selectedMemberIds.length > 5
                }
                className="flex-1 min-h-[46px] rounded-xl bg-[#2D8CFF] hover:bg-[#53A4FF] disabled:opacity-45 text-xs font-semibold text-white"
              >
                {t.comms.createSquadBtn}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Member to Existing Squad Modal (up to 6 max) */}
      {addMemberGroup && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-[#0D1B30] border border-[#94B8E8]/22 p-5 shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">
                {t.comms.addOperator} — {addMemberGroup.code} (
                {addMemberGroup.memberCount}/{addMemberGroup.maxMembers})
              </h3>
              <button
                type="button"
                onClick={() => setAddMemberGroup(null)}
                className="w-9 h-9 rounded-xl bg-[#132642] flex items-center justify-center text-[#B8C7DC]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {operators
                .filter(
                  (op) =>
                    !addMemberGroup.members.some((m) => m.userId === op.id)
                )
                .map((op) => (
                  <button
                    key={op.id}
                    type="button"
                    disabled={!op.allowGroupInvites}
                    onClick={() =>
                      handleSquadMemberAction(addMemberGroup.id, {
                        action: "add_member",
                        userId: op.id,
                      })
                    }
                    className="w-full p-3 rounded-xl bg-[#071120] hover:bg-[#132642] disabled:opacity-45 border border-[#94B8E8]/15 text-left flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-semibold text-white">
                        {op.displayName}{" "}
                        <span className="font-mono-grid text-[#53A4FF]">
                          {op.callsign}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#7F95B2]">
                        {op.allowGroupInvites
                          ? op.rankRole
                          : t.comms.invitesDisabled}
                      </div>
                    </div>
                    <UserPlus className="w-4 h-4 text-[#53A4FF]" />
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* New Private DM Operator Selector Modal */}
      {showNewDmModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-[#0D1B30] border border-[#94B8E8]/22 p-5 shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">
                {t.comms.chooseOperator}
              </h3>
              <button
                type="button"
                onClick={() => setShowNewDmModal(false)}
                className="w-9 h-9 rounded-xl bg-[#132642] flex items-center justify-center text-[#B8C7DC]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {operators.map((op) => (
                <button
                  key={op.id}
                  type="button"
                  disabled={op.allowDirectMessages === "nobody"}
                  onClick={() => {
                    setActivePeerId(op.id);
                    setShowNewDmModal(false);
                    setMobileChatOpen(true);
                  }}
                  className="w-full p-3 rounded-xl bg-[#071120] hover:bg-[#132642] disabled:opacity-45 border border-[#94B8E8]/15 text-left flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-mono-grid font-bold text-white shrink-0"
                      style={{ backgroundColor: op.avatarColor }}
                    >
                      {op.callsign.slice(-2)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">
                        {op.displayName}
                      </div>
                      <div className="text-[11px] text-[#7F95B2] truncate">
                        {op.callsign} ·{" "}
                        {op.allowDirectMessages === "nobody"
                          ? t.comms.dmRestricted
                          : op.rankRole}
                      </div>
                    </div>
                  </div>
                  <MessageSquare className="w-4 h-4 text-[#53A4FF] shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Image Lightbox */}
      {lightboxAtt && (
        <div
          onClick={() => setLightboxAtt(null)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-3xl w-full space-y-3"
          >
            <div className="flex items-center justify-between text-white">
              <span className="text-xs font-mono-grid truncate">
                {lightboxAtt.fileName} ({formatBytes(lightboxAtt.fileSize)})
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={`${lightboxAtt.url}?download=1`}
                  download={lightboxAtt.fileName}
                  className="px-3 py-1.5 rounded-lg bg-[#2D8CFF] text-xs font-semibold text-white flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  {t.app.download}
                </a>
                <button
                  type="button"
                  onClick={() => setLightboxAtt(null)}
                  className="w-9 h-9 rounded-lg bg-[#132642] flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxAtt.url}
              alt={lightboxAtt.fileName}
              className="max-h-[78dvh] w-full object-contain rounded-2xl border border-[#94B8E8]/25 bg-[#071120]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
