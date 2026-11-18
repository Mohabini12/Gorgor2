import {
  pgTable,
  text,
  boolean,
  integer,
  doublePrecision,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull().unique(),
    email: text("email").notNull().unique(),
    displayName: text("display_name").notNull(),
    callsign: text("callsign").notNull(),
    rankRole: text("rank_role").notNull().default("Field Operator"),
    bio: text("bio").notNull().default(""),
    avatarColor: text("avatar_color").notNull().default("#2D8CFF"),
    passwordHash: text("password_hash").notNull(),
    preferredLanguage: text("preferred_language").notNull().default("en"),
    preferredCoordFormat: text("preferred_coord_format")
      .notNull()
      .default("MGRS"),
    // Privacy settings (enforced server-side)
    locationSharing: text("location_sharing").notNull().default("coarse_mgrs"), // off | coarse_mgrs | exact
    showOnlineStatus: boolean("show_online_status").notNull().default(true),
    readReceipts: boolean("read_receipts").notNull().default(true),
    allowDirectMessages: text("allow_direct_messages")
      .notNull()
      .default("everyone"), // everyone | groups_only | nobody
    profileVisibility: text("profile_visibility")
      .notNull()
      .default("everyone"), // everyone | groups_only
    allowGroupInvites: boolean("allow_group_invites").notNull().default(true),
    // Real operator-shared GPS fix (null until explicitly acquired & shared)
    lastLat: doublePrecision("last_lat"),
    lastLon: doublePrecision("last_lon"),
    lastMgrs: text("last_mgrs"),
    lastAccuracy: doublePrecision("last_accuracy"),
    lastLocationAt: timestamp("last_location_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("users_callsign_idx").on(table.callsign)]
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    userAgent: text("user_agent").notNull().default(""),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)]
);

export const groups = pgTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  description: text("description").notNull().default(""),
  sector: text("sector").notNull().default("Sector 38N"),
  minMembers: integer("min_members").notNull().default(5),
  maxMembers: integer("max_members").notNull().default(6),
  createdById: text("created_by_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const groupMembers = pgTable(
  "group_members",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("operator"), // leader | navigator | comms | medic | recon | operator
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("group_members_unique_idx").on(table.groupId, table.userId),
    index("group_members_user_idx").on(table.userId),
  ]
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    senderId: text("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipientId: text("recipient_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    groupId: text("group_id").references(() => groups.id, {
      onDelete: "cascade",
    }),
    content: text("content").notNull().default(""),
    coordLat: doublePrecision("coord_lat"),
    coordLon: doublePrecision("coord_lon"),
    coordMgrs: text("coord_mgrs"),
    coordLabel: text("coord_label"),
    readAt: timestamp("read_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("messages_group_created_idx").on(table.groupId, table.createdAt),
    index("messages_dm_sender_idx").on(table.senderId, table.recipientId),
    index("messages_dm_recipient_idx").on(table.recipientId, table.senderId),
  ]
);

export const attachments = pgTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id").references(() => messages.id, {
      onDelete: "cascade",
    }),
    uploaderId: text("uploader_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    storedName: text("stored_name").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: integer("file_size").notNull(),
    category: text("category").notNull(), // image | document
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("attachments_message_idx").on(table.messageId)]
);

export const waypoints = pgTable(
  "waypoints",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    groupId: text("group_id").references(() => groups.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    category: text("category").notNull().default("rally"), // rally | observation | checkpoint | hazard | medevac | objective
    notes: text("notes").notNull().default(""),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    mgrs: text("mgrs").notNull(),
    elevation: doublePrecision("elevation"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("waypoints_user_idx").on(table.userId),
    index("waypoints_group_idx").on(table.groupId),
  ]
);

/**
 * Backend-managed app branding: name, bilingual subtitles and the tactical
 * emblem configuration used to generate the vector icon assets.
 */
export const branding = pgTable("branding", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const blockedUsers = pgTable(
  "blocked_users",
  {
    id: text("id").primaryKey(),
    blockerId: text("blocker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedId: text("blocked_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("blocked_users_unique_idx").on(
      table.blockerId,
      table.blockedId
    ),
  ]
);
