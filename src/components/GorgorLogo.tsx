"use client";

import { useId, useMemo, type CSSProperties } from "react";
import {
  buildEmblemSvg,
  type EmblemConfig,
  type EmblemVariant,
} from "@/lib/emblem";

/**
 * GORGOR tactical seal.
 *
 * The markup is produced by `@/lib/emblem` — the exact same vector module the
 * backend uses at `/api/branding/icon.svg` — so the in-app logo and the
 * distributed app icon are always the same artwork.
 */
export function GorgorLogo({
  size = 34,
  className = "",
  variant = "seal",
  config,
  plate = false,
  style,
  title = "GORGOR emblem",
}: {
  size?: number;
  className?: string;
  variant?: EmblemVariant;
  config?: Partial<EmblemConfig>;
  /** Draw the full-bleed plate (used for app-icon style previews). */
  plate?: boolean;
  style?: CSSProperties;
  title?: string;
}) {
  const raw = useId();
  const idPrefix = `gl${raw.replace(/[^a-zA-Z0-9]/g, "")}`;

  const markup = useMemo(
    () =>
      buildEmblemSvg(config ?? {}, {
        variant,
        plate,
        idPrefix,
        size,
      }),
    [config, variant, plate, idPrefix, size]
  );

  return (
    <span
      className={className}
      title={title}
      style={{
        display: "inline-flex",
        width: size,
        height: size,
        lineHeight: 0,
        flexShrink: 0,
        ...style,
      }}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
