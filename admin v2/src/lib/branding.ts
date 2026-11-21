import { sql } from "drizzle-orm";
import { db, branding } from "@/db";
import { ensureSeeded } from "@/db/seed";
import {
  DEFAULT_EMBLEM,
  type BrandingState,
  type EmblemVariant,
} from "@/lib/emblem";

export type BrandingPayload = BrandingState;

const KEYS = {
  appName: "app_name",
  subtitleEn: "subtitle_en",
  subtitleSo: "subtitle_so",
  variant: "emblem_variant",
  ringText: "emblem_ring_text",
  goldLight: "emblem_gold_light",
  gold: "emblem_gold",
  goldDeep: "emblem_gold_deep",
  redLight: "emblem_red_light",
  red: "emblem_red",
  redDeep: "emblem_red_deep",
  ink: "emblem_ink",
  ringInk: "emblem_ring_ink",
  plate: "emblem_plate",
} as const;

export function defaultBranding(): BrandingPayload {
  return {
    appName: "GORGOR",
    subtitleEn: "Tactical Mapping & Field Comms",
    subtitleSo: "Khariidad Ciidan & Isgaarsiin",
    variant: "seal",
    emblem: { ...DEFAULT_EMBLEM },
    updatedAt: null,
  };
}

/**
 * Reads branding + emblem configuration from PostgreSQL.
 * Falls back to the built-in defaults so the icon never fails to render.
 */
export async function loadBranding(): Promise<BrandingPayload> {
  try {
    await ensureSeeded();
    const rows = await db.select().from(branding);
    if (rows.length === 0) return defaultBranding();

    const map = new Map(rows.map((r) => [r.key, r]));
    const get = (key: string, fallback: string) =>
      map.get(key)?.value?.trim() || fallback;

    const base = defaultBranding();
    let updatedAt: string | null = null;
    for (const row of rows) {
      const ts = row.updatedAt?.toISOString?.();
      if (ts && (!updatedAt || ts > updatedAt)) updatedAt = ts;
    }

    return {
      appName: get(KEYS.appName, base.appName),
      subtitleEn: get(KEYS.subtitleEn, base.subtitleEn),
      subtitleSo: get(KEYS.subtitleSo, base.subtitleSo),
      variant:
        get(KEYS.variant, base.variant) === "mono" ? "mono" : "seal",
      emblem: {
        ringText: get(KEYS.ringText, base.emblem.ringText),
        goldLight: get(KEYS.goldLight, base.emblem.goldLight),
        gold: get(KEYS.gold, base.emblem.gold),
        goldDeep: get(KEYS.goldDeep, base.emblem.goldDeep),
        redLight: get(KEYS.redLight, base.emblem.redLight),
        red: get(KEYS.red, base.emblem.red),
        redDeep: get(KEYS.redDeep, base.emblem.redDeep),
        ink: get(KEYS.ink, base.emblem.ink),
        ringInk: get(KEYS.ringInk, base.emblem.ringInk),
        plate: get(KEYS.plate, base.emblem.plate),
      },
      updatedAt,
    };
  } catch (err) {
    console.error("loadBranding fallback:", err);
    return defaultBranding();
  }
}

/** Persists the editable subset of the branding configuration. */
export async function saveBranding(
  patch: Partial<{
    appName: string;
    subtitleEn: string;
    subtitleSo: string;
    variant: EmblemVariant;
    ringText: string;
    gold: string;
    goldDeep: string;
    red: string;
    redDeep: string;
    ink: string;
    ringInk: string;
    plate: string;
  }>
): Promise<BrandingPayload> {
  const rows: { key: string; value: string }[] = [];
  const push = (key: string, value: string | undefined) => {
    if (typeof value === "string" && value.trim()) {
      rows.push({ key, value: value.trim() });
    }
  };

  push(KEYS.appName, patch.appName);
  push(KEYS.subtitleEn, patch.subtitleEn);
  push(KEYS.subtitleSo, patch.subtitleSo);
  push(KEYS.variant, patch.variant);
  push(KEYS.ringText, patch.ringText);
  push(KEYS.gold, patch.gold);
  push(KEYS.goldDeep, patch.goldDeep);
  push(KEYS.red, patch.red);
  push(KEYS.redDeep, patch.redDeep);
  push(KEYS.ink, patch.ink);
  push(KEYS.ringInk, patch.ringInk);
  push(KEYS.plate, patch.plate);

  if (rows.length > 0) {
    await db
      .insert(branding)
      .values(rows.map((r) => ({ ...r, updatedAt: new Date() })))
      .onConflictDoUpdate({
        target: branding.key,
        set: {
          value: sql`excluded.value`,
          updatedAt: new Date(),
        },
      });
  }

  return loadBranding();
}
