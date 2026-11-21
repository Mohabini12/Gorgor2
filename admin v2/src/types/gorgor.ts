export type Language = "en" | "so";
export type CoordFormat = "MGRS" | "DMS" | "DD";
export type AppTab = "home" | "map" | "offline" | "comms" | "account";
export type CommsView = "groups" | "group_chat" | "private";

export type LocationSharingMode = "off" | "coarse_mgrs" | "exact";
export type DmPermission = "everyone" | "groups_only" | "nobody";
export type ProfileVisibility = "everyone" | "groups_only";

export type GroupRole =
  | "leader"
  | "navigator"
  | "comms"
  | "medic"
  | "recon"
  | "operator";

export type WaypointCategory =
  | "rally"
  | "observation"
  | "checkpoint"
  | "hazard"
  | "medevac"
  | "objective";

export interface CurrentUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  callsign: string;
  rankRole: string;
  bio: string;
  avatarColor: string;
  preferredLanguage: Language;
  preferredCoordFormat: CoordFormat;
  locationSharing: LocationSharingMode;
  showOnlineStatus: boolean;
  readReceipts: boolean;
  allowDirectMessages: DmPermission;
  profileVisibility: ProfileVisibility;
  allowGroupInvites: boolean;
  lastLat: number | null;
  lastLon: number | null;
  lastMgrs: string | null;
  lastAccuracy: number | null;
  lastLocationAt: string | null;
  createdAt: string;
}

export interface PublicOperator {
  id: string;
  username: string;
  displayName: string;
  callsign: string;
  rankRole: string;
  bio: string;
  avatarColor: string;
  isOnline: boolean | null; // null if hidden by privacy setting
  lastSeenAt: string | null; // null if hidden by privacy setting
  allowDirectMessages: DmPermission;
  allowGroupInvites: boolean;
  sharedLocation: {
    mode: "coarse_mgrs" | "exact";
    mgrs: string;
    lat: number | null;
    lon: number | null;
    accuracy: number | null;
    updatedAt: string;
  } | null;
  isBlocked?: boolean;
}

export interface GroupMemberInfo {
  id: string;
  userId: string;
  role: GroupRole;
  joinedAt: string;
  operator: PublicOperator;
}

export interface TacticalGroup {
  id: string;
  name: string;
  code: string;
  description: string;
  sector: string;
  minMembers: number;
  maxMembers: number;
  memberCount: number;
  createdById: string;
  myRole: GroupRole;
  createdAt: string;
  members: GroupMemberInfo[];
  lastMessage: {
    id: string;
    content: string;
    senderCallsign: string;
    hasAttachment: boolean;
    hasCoord: boolean;
    createdAt: string;
  } | null;
}

export interface MessageAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  category: "image" | "document";
  url: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  sender: {
    id: string;
    displayName: string;
    callsign: string;
    avatarColor: string;
  };
  recipientId: string | null;
  groupId: string | null;
  content: string;
  coordLat: number | null;
  coordLon: number | null;
  coordMgrs: string | null;
  coordLabel: string | null;
  readAt: string | null;
  createdAt: string;
  attachments: MessageAttachment[];
}

export interface DirectThread {
  peer: PublicOperator;
  lastMessage: {
    id: string;
    senderId: string;
    content: string;
    hasAttachment: boolean;
    hasCoord: boolean;
    readAt: string | null;
    createdAt: string;
  } | null;
  unreadCount: number;
}

export interface TacticalWaypoint {
  id: string;
  userId: string;
  creatorCallsign: string;
  groupId: string | null;
  groupCode: string | null;
  name: string;
  category: WaypointCategory;
  notes: string;
  lat: number;
  lon: number;
  mgrs: string;
  elevation: number | null;
  createdAt: string;
}

export type GpsStatus =
  | "idle"
  | "requesting"
  | "active"
  | "denied"
  | "unavailable"
  | "timeout"
  | "position_unavailable"
  | "insecure_context";

export interface GpsPositionData {
  lat: number;
  lon: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
  mgrs: string;
  dms: string;
  dd: string;
}

export type BasemapStyleId =
  | "tactical"
  | "satellite"
  | "hybrid"
  | "standard"
  | "topo"
  | "offline_only";

export type OfflineTileSource = "satellite" | "standard" | "topo";

export interface OfflineRegionRecord {
  id: string;
  name: string;
  sourceStyle: OfflineTileSource;
  bounds: [number, number, number, number]; // [west, south, east, north]
  minZoom: number;
  maxZoom: number;
  totalTiles: number;
  downloadedTiles: number;
  failedTiles: number;
  byteSize: number;
  status: "downloading" | "complete" | "partial" | "cancelled";
  createdAt: string;
  updatedAt: string;
}

export interface MbtilesArchiveMeta {
  id: string;
  fileName: string;
  name: string;
  description: string;
  format: string;
  bounds: [number, number, number, number] | null;
  center: [number, number, number] | null; // [lon, lat, zoom]
  minZoom: number;
  maxZoom: number;
  tileCount: number;
  byteSize: number;
  importedAt: string;
}

export interface MapFocusTarget {
  lat: number;
  lon: number;
  zoom?: number;
  label?: string;
  mgrs?: string;
  bounds?: [number, number, number, number];
  preferredBasemap?: BasemapStyleId;
  activateOfflineRegionId?: string;
  activateMbtilesId?: string;
  openSearch?: boolean;
  timestamp: number;
}

export interface PendingCoordShare {
  lat: number;
  lon: number;
  mgrs: string;
  label: string;
}
