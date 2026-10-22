/**
 * GET /api/v1/gifts/templates
 *
 * Returns static gift card templates (designs, messages, occasions).
 * Public endpoint — cacheable in shared caches and Redis for 1 hour.
 *
 * Issue #330 — API response caching with Cache-Control headers.
 * Issue #329 — Gift card physical print and digital download option.
 */
import { withErrorHandler } from "@/server/middleware";
import { cachedJsonResponse } from "@/lib/cache";
import type { ApiResponse } from "@/types";

/** Template design themes available to gift senders. */
export type GiftTemplateTheme =
  "birthday" | "anniversary" | "holiday" | "graduation" | "valentine" | "newyear" | "generic";

export interface GiftTemplate {
  id: string;
  theme: GiftTemplateTheme;
  label: string;
  description: string;
  /** Primary accent colour (hex). */
  accentColor: string;
  /** Whether the template is available for physical print. */
  printable: boolean;
  /** Whether the template is available for digital download. */
  downloadable: boolean;
}

/** Static list of gift card templates. Served as public, cacheable content. */
const TEMPLATES: GiftTemplate[] = [
  {
    id: "birthday",
    theme: "birthday",
    label: "Birthday Surprise",
    description: "A celebratory gift card design with balloons and confetti.",
    accentColor: "#FF6B6B",
    printable: true,
    downloadable: true,
  },
  {
    id: "anniversary",
    theme: "anniversary",
    label: "Anniversary Bouquet",
    description: "Romantic design with flowers and warm tones.",
    accentColor: "#E91E63",
    printable: true,
    downloadable: true,
  },
  {
    id: "holiday",
    theme: "holiday",
    label: "Festive Season",
    description: "Holiday-themed gift card with snowflakes and warm lights.",
    accentColor: "#2ECC71",
    printable: true,
    downloadable: true,
  },
  {
    id: "graduation",
    theme: "graduation",
    label: "Graduation Cap",
    description: "Congratulatory design featuring a graduation cap.",
    accentColor: "#3498DB",
    printable: true,
    downloadable: true,
  },
  {
    id: "valentine",
    theme: "valentine",
    label: "Valentine's Day",
    description: "Hearts and warm pinks for the season of love.",
    accentColor: "#FF4757",
    printable: true,
    downloadable: true,
  },
  {
    id: "newyear",
    theme: "newyear",
    label: "New Year Sparkle",
    description: "Fireworks and gold accents to ring in the new year.",
    accentColor: "#F1C40F",
    printable: true,
    downloadable: true,
  },
  {
    id: "generic",
    theme: "generic",
    label: "Classic Gift",
    description: "A timeless, minimalist gift card design for any occasion.",
    accentColor: "#6C5CE7",
    printable: true,
    downloadable: true,
  },
];

/** Redis cache TTL — templates change rarely, cache for 1 hour. */
const TEMPLATE_CACHE_TTL_SEC = 3600;
/** Cache-Control directive for shared caches. */
const TEMPLATE_CACHE_CONTROL = "public, max-age=3600";

export const GET = withErrorHandler(async () => {
  return cachedJsonResponse<GiftTemplate[]>(
    "gift:templates:all",
    TEMPLATE_CACHE_TTL_SEC,
    TEMPLATE_CACHE_CONTROL,
    async () => TEMPLATES
  );
});

/** Response shape for the templates endpoint. */
export type TemplatesResponse = ApiResponse<GiftTemplate[]>;
