import type { BadgeProps } from "@/components/ui/badge";
import type { Schemas } from "@/lib/api/client";

type Status = Schemas["TradeInquiryStatus"];
type NotificationStatus = Schemas["InquiryNotificationStatus"];

/** Pipeline order: the status select lists them in this order. */
export const INQUIRY_STATUSES: readonly Status[] = ["NEW", "CONTACTED", "QUALIFIED", "QUOTED", "WON", "LOST"];

export const STATUS_LABEL: Record<Status, string> = {
  NEW: "Mới",
  CONTACTED: "Đã liên hệ",
  QUALIFIED: "Đủ điều kiện",
  QUOTED: "Đã báo giá",
  WON: "Chốt thành công",
  LOST: "Không thành",
};

export const STATUS_VARIANT: Record<Status, NonNullable<BadgeProps["variant"]>> = {
  NEW: "info",
  CONTACTED: "secondary",
  QUALIFIED: "warning",
  QUOTED: "default",
  WON: "success",
  LOST: "outline",
};

export const GOAL_LABEL: Record<string, string> = {
  sourcing: "Thu mua nông sản",
  logistics: "Vận chuyển / logistics",
  customs: "Thủ tục hải quan",
};

/** Website product ids (the ingestion contract); the stored productName stays in English as the buyer saw it. */
export const PRODUCT_LABEL: Record<string, string> = {
  "passion-fruit": "Chanh dây",
  "dried-cassava-chips": "Sắn lát khô",
  bananas: "Chuối Cavendish",
  "dragon-fruit": "Thanh long",
  spices: "Gia vị",
  nuts: "Hạt điều",
  "tapioca-starch": "Tinh bột sắn",
};

export const NOTIFICATION_LABEL: Record<NotificationStatus, string> = {
  PENDING: "Đang gửi email",
  SENT: "Đã gửi email thông báo",
  FAILED: "Gửi email thông báo thất bại",
  SKIPPED: "Email thông báo đang tắt",
};

interface Brief {
  productName: string | null;
  goods: string | null;
  goal: string;
  volumeAmount: string | null;
  volumeUnit: string | null;
  utmSource: string | null;
  referrerOrigin: string | null;
}

/** What the buyer asked about: the product, else the goods they described, else the goal. */
export const inquirySubject = (i: Brief) => i.productName ?? i.goods ?? GOAL_LABEL[i.goal] ?? i.goal;

export const inquiryVolume = (i: Brief) =>
  i.volumeAmount ? [i.volumeAmount, i.volumeUnit].filter(Boolean).join(" ") : null;

/** Campaign first, then the referring site, else a direct visit. */
export function inquirySource(i: Brief): string {
  if (i.utmSource) return `utm: ${i.utmSource}`;
  if (i.referrerOrigin) {
    try {
      return new URL(i.referrerOrigin).hostname;
    } catch {
      return i.referrerOrigin;
    }
  }
  return "Truy cập trực tiếp";
}

/**
 * wa.me link for a phone the buyer gave in international form (+84…, 0084…). A national number ("0909…") has no
 * country code to dial, so it gets no link rather than a wrong one. Opens a chat for a person to write; nothing is sent.
 */
export function whatsAppLink(phone: string | null | undefined): string | null {
  const raw = phone?.trim() ?? "";
  if (!raw.startsWith("+") && !raw.startsWith("00")) return null;
  const digits = raw.replace(/\D/g, "").replace(/^00/, "");
  return digits.length >= 8 && digits.length <= 15 ? `https://wa.me/${digits}` : null;
}

/** mailto: with a subject naming the reference; the body is left to the salesperson. */
export const buyerMailto = (email: string, reference: string, subject: string) =>
  `mailto:${email}?subject=${encodeURIComponent(`HMV Global — ${reference} — ${subject}`)}`;
