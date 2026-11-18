import { count } from "drizzle-orm";
import {
  db,
  users,
  groups,
  groupMembers,
  waypoints,
  messages,
  branding,
} from "@/db";
import { hashPassword } from "@/lib/auth";
import { formatMGRS } from "@/lib/coordinates";
import { DEFAULT_EMBLEM } from "@/lib/emblem";

let seedPromise: Promise<void> | null = null;

export const DEFAULT_OPERATOR_ID = "usr_warsame";

export async function ensureSeeded(): Promise<void> {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    await runSeed();
    await seedBranding();
  })().finally(() => {
    seedPromise = null;
  });
  return seedPromise;
}

/**
 * Branding rows are upserted separately so existing installations pick up the
 * emblem configuration without a rebuild.
 */
async function seedBranding(): Promise<void> {
  const defaults: Record<string, string> = {
    app_name: "GORGOR",
    subtitle_en: "Tactical Mapping & Field Comms",
    subtitle_so: "Khariidad Ciidan & Isgaarsiin",
    emblem_ring_text: DEFAULT_EMBLEM.ringText,
    emblem_variant: "seal",
    emblem_gold_light: DEFAULT_EMBLEM.goldLight,
    emblem_gold: DEFAULT_EMBLEM.gold,
    emblem_gold_deep: DEFAULT_EMBLEM.goldDeep,
    emblem_red_light: DEFAULT_EMBLEM.redLight,
    emblem_red: DEFAULT_EMBLEM.red,
    emblem_red_deep: DEFAULT_EMBLEM.redDeep,
    emblem_ink: DEFAULT_EMBLEM.ink,
    emblem_ring_ink: DEFAULT_EMBLEM.ringInk,
    emblem_plate: DEFAULT_EMBLEM.plate,
  };

  await db
    .insert(branding)
    .values(
      Object.entries(defaults).map(([key, value]) => ({ key, value }))
    )
    .onConflictDoNothing();
}

async function runSeed(): Promise<void> {
  const [{ total }] = await db.select({ total: count() }).from(users);
  if (total > 0) return;

  const defaultPassHash = hashPassword("Gorgor@2026");
  const now = new Date();
  const minsAgo = (m: number) => new Date(now.getTime() - m * 60 * 1000);

  const seedUsers: (typeof users.$inferInsert)[] = [
    {
      id: "usr_warsame",
      username: "warsame",
      email: "warsame@gorgor.so",
      displayName: "Col. Hassan Warsame",
      callsign: "GORGOR-01",
      rankRole: "Squad Commander",
      bio: "Sector 38N Field Operations & Navigation Command",
      avatarColor: "#2D8CFF",
      passwordHash: defaultPassHash,
      preferredLanguage: "en",
      preferredCoordFormat: "MGRS",
      locationSharing: "coarse_mgrs",
      showOnlineStatus: true,
      readReceipts: true,
      allowDirectMessages: "everyone",
      profileVisibility: "everyone",
      allowGroupInvites: true,
      lastSeenAt: now,
    },
    {
      id: "usr_amina",
      username: "amina",
      email: "amina@gorgor.so",
      displayName: "Lt. Amina Farah",
      callsign: "GORGOR-02",
      rankRole: "Lead Navigator & GIS",
      bio: "Topographic Cartography, MBTiles & MGRS Recon",
      avatarColor: "#0EA5E9",
      passwordHash: defaultPassHash,
      preferredLanguage: "so",
      preferredCoordFormat: "MGRS",
      locationSharing: "coarse_mgrs",
      showOnlineStatus: true,
      readReceipts: true,
      allowDirectMessages: "everyone",
      profileVisibility: "everyone",
      allowGroupInvites: true,
      lastSeenAt: minsAgo(2),
    },
    {
      id: "usr_mahad",
      username: "mahad",
      email: "mahad@gorgor.so",
      displayName: "Sgt. Mahad Nur",
      callsign: "GORGOR-03",
      rankRole: "Signals & Comms",
      bio: "HF/VHF Relay & Tactical Data Link Specialist",
      avatarColor: "#3B82F6",
      passwordHash: defaultPassHash,
      preferredLanguage: "en",
      preferredCoordFormat: "MGRS",
      locationSharing: "exact",
      showOnlineStatus: true,
      readReceipts: true,
      allowDirectMessages: "everyone",
      profileVisibility: "everyone",
      allowGroupInvites: true,
      lastSeenAt: minsAgo(3),
    },
    {
      id: "usr_zahra",
      username: "zahra",
      email: "zahra@gorgor.so",
      displayName: "Cpl. Zahra Abdi",
      callsign: "GORGOR-04",
      rankRole: "Field Medic",
      bio: "Forward Medevac & Casualty Extraction Unit",
      avatarColor: "#0284C7",
      passwordHash: defaultPassHash,
      preferredLanguage: "so",
      preferredCoordFormat: "DMS",
      locationSharing: "coarse_mgrs",
      showOnlineStatus: true,
      readReceipts: true,
      allowDirectMessages: "groups_only",
      profileVisibility: "everyone",
      allowGroupInvites: true,
      lastSeenAt: minsAgo(14),
    },
    {
      id: "usr_khalid",
      username: "khalid",
      email: "khalid@gorgor.so",
      displayName: "Sgt. Khalid Omar",
      callsign: "GORGOR-05",
      rankRole: "Forward Recon",
      bio: "Long-Range Route Clearance & Observation",
      avatarColor: "#1D4ED8",
      passwordHash: defaultPassHash,
      preferredLanguage: "en",
      preferredCoordFormat: "MGRS",
      locationSharing: "off",
      showOnlineStatus: false,
      readReceipts: false,
      allowDirectMessages: "everyone",
      profileVisibility: "everyone",
      allowGroupInvites: true,
      lastSeenAt: minsAgo(8),
    },
    {
      id: "usr_dalmar",
      username: "dalmar",
      email: "dalmar@gorgor.so",
      displayName: "Lt. Dalmar Shire",
      callsign: "GORGOR-06",
      rankRole: "Logistics & Engineer",
      bio: "Supply Corridor Mapping & Airfield Ops",
      avatarColor: "#2563EB",
      passwordHash: defaultPassHash,
      preferredLanguage: "en",
      preferredCoordFormat: "MGRS",
      locationSharing: "coarse_mgrs",
      showOnlineStatus: true,
      readReceipts: true,
      allowDirectMessages: "everyone",
      profileVisibility: "everyone",
      allowGroupInvites: true,
      lastSeenAt: minsAgo(1),
    },
    {
      id: "usr_hodan",
      username: "hodan",
      email: "hodan@gorgor.so",
      displayName: "Capt. Hodan Ali",
      callsign: "EAGLE-07",
      rankRole: "Coastal Survey Lead",
      bio: "Maritime DMS Charting & Port Perimeter Security",
      avatarColor: "#0369A1",
      passwordHash: defaultPassHash,
      preferredLanguage: "so",
      preferredCoordFormat: "DMS",
      locationSharing: "coarse_mgrs",
      showOnlineStatus: true,
      readReceipts: true,
      allowDirectMessages: "everyone",
      profileVisibility: "everyone",
      allowGroupInvites: true,
      lastSeenAt: minsAgo(4),
    },
    {
      id: "usr_yusuf",
      username: "yusuf",
      email: "yusuf@gorgor.so",
      displayName: "Sgt. Yusuf Jama",
      callsign: "EAGLE-08",
      rankRole: "Terrain Analyst",
      bio: "Elevation Profiles & Offline MBTiles Distribution",
      avatarColor: "#1E40AF",
      passwordHash: defaultPassHash,
      preferredLanguage: "en",
      preferredCoordFormat: "MGRS",
      locationSharing: "coarse_mgrs",
      showOnlineStatus: true,
      readReceipts: true,
      allowDirectMessages: "everyone",
      profileVisibility: "everyone",
      allowGroupInvites: true,
      lastSeenAt: minsAgo(25),
    },
  ];

  await db.insert(users).values(seedUsers).onConflictDoNothing();

  // Group 1: GORGOR-1 ALPHA (6/6 full tactical squad)
  // Group 2: GORGOR-2 BRAVO (5/6 tactical squad — ready for operations or adding 1 operator)
  await db
    .insert(groups)
    .values([
      {
        id: "grp_alpha",
        name: "GORGOR-1 Alpha Squad",
        code: "GGR-1A",
        description:
          "Primary 6-operator reconnaissance and route verification unit covering Banadir and Lower Shabelle.",
        sector: "38N NH — Banadir Corridor",
        minMembers: 5,
        maxMembers: 6,
        createdById: "usr_warsame",
      },
      {
        id: "grp_bravo",
        name: "GORGOR-2 Coastal Recon",
        code: "GGR-2B",
        description:
          "5-operator coastal charting, airfield perimeter, and medevac coordination squad.",
        sector: "38N NH — Aden Adde / Coast",
        minMembers: 5,
        maxMembers: 6,
        createdById: "usr_hodan",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(groupMembers)
    .values([
      // Alpha: 6 members
      { id: "gm_a1", groupId: "grp_alpha", userId: "usr_warsame", role: "leader" },
      { id: "gm_a2", groupId: "grp_alpha", userId: "usr_amina", role: "navigator" },
      { id: "gm_a3", groupId: "grp_alpha", userId: "usr_mahad", role: "comms" },
      { id: "gm_a4", groupId: "grp_alpha", userId: "usr_zahra", role: "medic" },
      { id: "gm_a5", groupId: "grp_alpha", userId: "usr_khalid", role: "recon" },
      { id: "gm_a6", groupId: "grp_alpha", userId: "usr_dalmar", role: "operator" },
      // Bravo: 5 members (can add 1 more up to max 6)
      { id: "gm_b1", groupId: "grp_bravo", userId: "usr_hodan", role: "leader" },
      { id: "gm_b2", groupId: "grp_bravo", userId: "usr_warsame", role: "comms" },
      { id: "gm_b3", groupId: "grp_bravo", userId: "usr_amina", role: "navigator" },
      { id: "gm_b4", groupId: "grp_bravo", userId: "usr_yusuf", role: "recon" },
      { id: "gm_b5", groupId: "grp_bravo", userId: "usr_zahra", role: "medic" },
    ])
    .onConflictDoNothing();

  // Tactical field waypoints with exact computed MGRS
  const wp1 = { lat: 2.0144, lon: 45.3047 }; // Aden Adde Airfield Command
  const wp2 = { lat: 2.0371, lon: 45.3436 }; // KM4 Checkpoint
  const wp3 = { lat: 2.1112, lon: 45.1228 }; // Afgooye Bridge Crossing
  const wp4 = { lat: 2.0258, lon: 45.3352 }; // Port Perimeter OP
  const wp5 = { lat: 2.0524, lon: 45.3245 }; // Forward Medevac LZ

  await db
    .insert(waypoints)
    .values([
      {
        id: "wp_hq",
        userId: "usr_warsame",
        groupId: "grp_alpha",
        name: "HQ Base — Aden Adde Sector",
        category: "rally",
        notes: "Primary command rally point and logistics staging apron.",
        lat: wp1.lat,
        lon: wp1.lon,
        mgrs: formatMGRS(wp1.lat, wp1.lon, 5),
        elevation: 9,
      },
      {
        id: "wp_cp1",
        userId: "usr_amina",
        groupId: "grp_alpha",
        name: "CP-04 Junction Control",
        category: "checkpoint",
        notes: "Main arterial verification checkpoint; report transit on Alpha channel.",
        lat: wp2.lat,
        lon: wp2.lon,
        mgrs: formatMGRS(wp2.lat, wp2.lon, 5),
        elevation: 38,
      },
      {
        id: "wp_afg",
        userId: "usr_khalid",
        groupId: "grp_alpha",
        name: "OP Shabelle River Bridge",
        category: "observation",
        notes: "Western corridor bridge observation post; verify clearance before dusk.",
        lat: wp3.lat,
        lon: wp3.lon,
        mgrs: formatMGRS(wp3.lat, wp3.lon, 5),
        elevation: 84,
      },
      {
        id: "wp_port",
        userId: "usr_hodan",
        groupId: "grp_bravo",
        name: "Coastal Harbour Overwatch",
        category: "objective",
        notes: "Maritime approach grid reference for Bravo coastal survey.",
        lat: wp4.lat,
        lon: wp4.lon,
        mgrs: formatMGRS(wp4.lat, wp4.lon, 5),
        elevation: 14,
      },
      {
        id: "wp_med",
        userId: "usr_zahra",
        groupId: "grp_alpha",
        name: "HLZ Eagle-Med North",
        category: "medevac",
        notes: "Cleared 60m triage and rotary landing zone, unobstructed approach 070°.",
        lat: wp5.lat,
        lon: wp5.lon,
        mgrs: formatMGRS(wp5.lat, wp5.lon, 5),
        elevation: 46,
      },
    ])
    .onConflictDoNothing();

  // Persisted real initial squad & direct messages in PostgreSQL
  await db
    .insert(messages)
    .values([
      {
        id: "msg_a1",
        senderId: "usr_amina",
        groupId: "grp_alpha",
        content:
          "Alpha squad, updated route grid for OP Shabelle River Bridge verified. Cache Sector 38N tiles before departure.",
        coordLat: wp3.lat,
        coordLon: wp3.lon,
        coordMgrs: formatMGRS(wp3.lat, wp3.lon, 5),
        coordLabel: "OP Shabelle River Bridge",
        createdAt: minsAgo(52),
      },
      {
        id: "msg_a2",
        senderId: "usr_mahad",
        groupId: "grp_alpha",
        content:
          "Copy GORGOR-02. Comms check green across all 6 stations. Standing by for grid coordinates and route docs.",
        createdAt: minsAgo(38),
      },
      {
        id: "msg_b1",
        senderId: "usr_hodan",
        groupId: "grp_bravo",
        content:
          "Kooxda Bravo, bar-kulanka xeebta waa la xaqiijiyey. Fadlan hubiya khariidadaha khad-la'aanta (MBTiles).",
        coordLat: wp4.lat,
        coordLon: wp4.lon,
        coordMgrs: formatMGRS(wp4.lat, wp4.lon, 5),
        coordLabel: "Coastal Harbour Overwatch",
        createdAt: minsAgo(29),
      },
      {
        id: "msg_dm1",
        senderId: "usr_amina",
        recipientId: "usr_warsame",
        content:
          "Commander, Aden Adde staging coordinates confirmed on MGRS. Ready to attach field survey PDF or imagery when needed.",
        coordLat: wp1.lat,
        coordLon: wp1.lon,
        coordMgrs: formatMGRS(wp1.lat, wp1.lon, 5),
        coordLabel: "HQ Base — Aden Adde Sector",
        createdAt: minsAgo(18),
      },
      {
        id: "msg_dm2",
        senderId: "usr_dalmar",
        recipientId: "usr_warsame",
        content:
          "Supply convoy manifest prepared for CP-04 Junction. Confirm route window when ready.",
        readAt: minsAgo(10),
        createdAt: minsAgo(75),
      },
    ])
    .onConflictDoNothing();
}
