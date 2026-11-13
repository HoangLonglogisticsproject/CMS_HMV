"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Mail, MessageCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/modules/auth/queries/use-session";
import { errorMessage } from "@/lib/api/errors";
import {
  type InquiryDetail,
  type InquiryStatus,
  useAddInquiryNote,
  useInquiryAssignees,
  useResendInquiryNotification,
  useTradeInquiry,
  useUpdateInquiry,
} from "../queries/use-trade-inquiries";
import {
  INQUIRY_STATUSES,
  NOTIFICATION_LABEL,
  ROUTE_LABEL,
  ROUTE_VARIANT,
  STATUS_LABEL,
  STATUS_VARIANT,
  buyerMailto,
  formatVietnamDateTime,
  hasAdditionalBuyerInformation,
  inquiryRoute,
  inquirySource,
  inquiryVolume,
  noteAfterSave,
  whatsAppLink,
} from "../utils/inquiry-format";

const SELECT =
  "h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#087EC2] disabled:opacity-60";

export function InquiryDetailView({ inquiryId }: Readonly<{ inquiryId: string }>) {
  const can = useCan();
  if (!can("inquiry:read")) {
    return (
      <div
        className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600"
        data-testid="inquiries-forbidden"
      >
        Bạn không có quyền xem yêu cầu giao thương.
      </div>
    );
  }
  return <InquiryDetailLoader inquiryId={inquiryId} />;
}

function InquiryDetailLoader({ inquiryId }: Readonly<{ inquiryId: string }>) {
  const { data, isLoading, error } = useTradeInquiry(inquiryId);
  if (isLoading) return <p className="text-xs text-slate-500">Đang tải yêu cầu…</p>;
  if (error || !data)
    return (
      <div className="space-y-3">
        <BackLink />
        <p className="text-xs text-rose-600">{errorMessage(error)}</p>
      </div>
    );
  return <InquiryDetailBody inquiry={data} />;
}

function BackLink() {
  return (
    <Link href="/sales/inquiries" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-[#087EC2]">
      <ArrowLeft className="h-3.5 w-3.5" /> Leads &amp; CRM
    </Link>
  );
}

function Section({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <Card className="p-4 border-slate-200 shadow-2xs bg-white space-y-3">
      <h2 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{title}</h2>
      {children}
    </Card>
  );
}

function Field({ label, value }: Readonly<{ label: string; value: React.ReactNode }>) {
  return (
    <div className="grid grid-cols-[124px_1fr] gap-2 text-xs">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 text-slate-900 [overflow-wrap:anywhere]">{value ?? <span className="text-slate-400">—</span>}</dd>
    </div>
  );
}

/** The lead at a glance: who, what, where, how much, and who works it. */
function LeadSummary({ inquiry }: Readonly<{ inquiry: InquiryDetail }>) {
  const route = inquiryRoute(inquiry);
  return (
    <Card className="p-4 border-slate-200 shadow-2xs bg-white space-y-3" data-testid="inquiry-summary">
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Công ty" value={inquiry.company} />
        <Field label="Người mua" value={inquiry.contactName} />
        <Field label="Sản phẩm" value={inquiry.productName} />
        <Field label="Điểm đến" value={inquiry.destination} />
        <Field label="Khối lượng" value={inquiryVolume(inquiry)} />
        <Field label="Nhận lúc" value={formatVietnamDateTime(inquiry.createdAt)} />
      </dl>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          Tuyến xử lý
          <Badge variant={ROUTE_VARIANT[route]} data-testid="inquiry-route">{ROUTE_LABEL[route]}</Badge>
        </span>
        <span className="flex items-center gap-1.5">
          Trạng thái
          <Badge variant={STATUS_VARIANT[inquiry.status]} data-testid="inquiry-status">{STATUS_LABEL[inquiry.status]}</Badge>
        </span>
        <span>
          Phụ trách:{" "}
          <strong className="font-semibold text-slate-800" data-testid="inquiry-assignee">
            {inquiry.assignedTo?.displayName ?? "Chưa giao"}
          </strong>
        </span>
      </div>
    </Card>
  );
}

/**
 * What earlier, longer Trade Desk inquiries asked (application, transport, product and supply requirements): kept as
 * the buyer gave it, folded away. Today's desk asks none of it, so a new lead has no such section.
 */
function AdditionalBuyerInformation({ inquiry }: Readonly<{ inquiry: InquiryDetail }>) {
  if (!hasAdditionalBuyerInformation(inquiry)) return null;
  return (
    <Card className="border-slate-200 shadow-2xs bg-white">
      <details data-testid="inquiry-additional">
        <summary className="cursor-pointer select-none p-4 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          Additional buyer information
        </summary>
        <dl className="space-y-1.5 px-4 pb-4">
          <Field label="Xuất xứ" value={inquiry.origin} />
          {inquiry.application && <Field label="Ứng dụng" value={inquiry.application} />}
          {inquiry.transport && <Field label="Vận chuyển" value={inquiry.transport} />}
          {inquiry.requirements.map((r) => (
            <Field key={r.key} label={r.label} value={r.value} />
          ))}
        </dl>
      </details>
    </Card>
  );
}

function InquiryDetailBody({ inquiry }: Readonly<{ inquiry: InquiryDetail }>) {
  const can = useCan();
  const canWrite = can("inquiry:write");
  const update = useUpdateInquiry(inquiry.id);
  const addNote = useAddInquiryNote(inquiry.id);
  const resend = useResendInquiryNotification(inquiry.id);
  const { data: assignees } = useInquiryAssignees(canWrite);
  const [note, setNote] = useState("");

  const whatsApp = whatsAppLink(inquiry.phone);

  const save = (body: Parameters<typeof update.mutate>[0], done: string) =>
    update.mutate(body, {
      onSuccess: () => toast.success(done),
      onError: (err) => toast.error("Không lưu được thay đổi", { description: errorMessage(err) }),
    });

  const copyPhone = async () => {
    try {
      await navigator.clipboard.writeText(inquiry.phone ?? "");
      toast.success("Đã sao chép số điện thoại");
    } catch {
      toast.error("Trình duyệt không cho phép sao chép");
    }
  };

  return (
    <div className="space-y-5">
      <div className="pb-3 border-b border-slate-200 space-y-2">
        <BackLink />
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-base font-bold text-[#123D68] font-mono" data-testid="inquiry-reference">
            {inquiry.reference}
          </h1>
          <Badge variant="outline">{inquiry.locale.toUpperCase()}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" className="h-8 text-xs bg-[#087EC2] hover:bg-[#066ba8] text-white gap-1.5">
            <a href={buyerMailto(inquiry.email, inquiry.reference, inquiry.productName)}>
              <Mail className="h-3.5 w-3.5" /> Gửi email cho người mua
            </a>
          </Button>
          {inquiry.phone && (
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={copyPhone}>
              <Copy className="h-3.5 w-3.5" /> Sao chép số điện thoại
            </Button>
          )}
          {whatsApp && (
            <Button asChild size="sm" variant="outline" className="h-8 text-xs gap-1.5">
              <a href={whatsApp} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-3.5 w-3.5" /> Mở WhatsApp
              </a>
            </Button>
          )}
        </div>
      </div>

      <LeadSummary inquiry={inquiry} />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {inquiry.buyerNotes && (
            <Section title="Lời nhắn của người mua">
              <p className="text-xs text-slate-800 whitespace-pre-wrap" data-testid="inquiry-buyer-notes">
                {inquiry.buyerNotes}
              </p>
            </Section>
          )}

          <Section title="Người mua / liên hệ">
            <dl className="space-y-1.5">
              <Field label="Công ty" value={inquiry.company} />
              <Field label="Người liên hệ" value={inquiry.contactName} />
              <Field label="Email" value={<a className="text-[#087EC2] hover:underline" href={`mailto:${inquiry.email}`}>{inquiry.email}</a>} />
              <Field label="Điện thoại" value={inquiry.phone} />
              <Field label="Đồng ý liên hệ" value={formatVietnamDateTime(inquiry.contactConsentAt)} />
            </dl>
          </Section>

          <AdditionalBuyerInformation inquiry={inquiry} />

          <Section title="Ghi chú nội bộ">
            {inquiry.notes.length === 0 && <p className="text-xs text-slate-400">Chưa có ghi chú.</p>}
            <ul className="space-y-2">
              {inquiry.notes.map((n) => (
                <li key={n.id} className="rounded-md border border-slate-100 p-2.5 text-xs" data-testid="inquiry-note">
                  <div className="text-[11px] text-slate-500">
                    {n.createdBy.displayName} · {formatVietnamDateTime(n.createdAt)}
                  </div>
                  <div className="mt-1 whitespace-pre-wrap text-slate-800">{n.body}</div>
                </li>
              ))}
            </ul>
            {canWrite && (
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const draft = note;
                  addNote.mutate(draft.trim(), {
                    onSuccess: () => {
                      setNote((current) => noteAfterSave(current, draft));
                      toast.success("Đã thêm ghi chú");
                    },
                    onError: (err) => toast.error("Không thêm được ghi chú", { description: errorMessage(err) }),
                  });
                }}
              >
                <Textarea
                  aria-label="Ghi chú mới"
                  placeholder="Ví dụ: đã gọi, người mua cần mẫu trước tuần sau…"
                  value={note}
                  maxLength={4000}
                  disabled={addNote.isPending}
                  onChange={(e) => setNote(e.target.value)}
                />
                <Button type="submit" size="sm" className="h-8 text-xs" disabled={!note.trim() || addNote.isPending}>
                  Thêm ghi chú
                </Button>
              </form>
            )}
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="Xử lý bán hàng">
            <label className="block space-y-1 text-xs text-slate-500">
              <span>Trạng thái</span>
              <select
                aria-label="Trạng thái"
                className={SELECT}
                value={inquiry.status}
                disabled={!canWrite || update.isPending}
                onChange={(e) =>
                  save({ status: e.target.value as InquiryStatus }, `Đã chuyển sang “${STATUS_LABEL[e.target.value as InquiryStatus]}”`)
                }
              >
                {INQUIRY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 text-xs text-slate-500">
              <span>Người phụ trách</span>
              <select
                aria-label="Người phụ trách"
                className={SELECT}
                value={inquiry.assignedTo?.id ?? ""}
                disabled={!canWrite || update.isPending}
                onChange={(e) => save({ assignedToId: e.target.value || null }, "Đã cập nhật người phụ trách")}
              >
                <option value="">Chưa giao</option>
                {/* The current assignee stays listed even if they have since lost the role. */}
                {inquiry.assignedTo && !assignees?.items.some((u) => u.id === inquiry.assignedTo?.id) && (
                  <option value={inquiry.assignedTo.id}>{inquiry.assignedTo.displayName}</option>
                )}
                {assignees?.items.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName}
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-1.5 border-t border-slate-100 pt-3">
              <p className="text-xs text-slate-800" data-testid="inquiry-notification">
                {NOTIFICATION_LABEL[inquiry.notificationStatus]}
              </p>
              <p className="text-[11px] text-slate-500">
                {inquiry.notificationAttempts} lần gửi · lần cuối {formatVietnamDateTime(inquiry.notificationLastAttemptAt)}
              </p>
              {canWrite && inquiry.notificationRetryable && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1.5"
                  disabled={resend.isPending}
                  onClick={() =>
                    resend.mutate(undefined, {
                      onSuccess: (d) =>
                        d.notificationStatus === "SENT"
                          ? toast.success("Đã gửi lại email thông báo")
                          : toast.error(NOTIFICATION_LABEL[d.notificationStatus]),
                      onError: (err) => toast.error("Không gửi lại được", { description: errorMessage(err) }),
                    })
                  }
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Gửi lại email thông báo
                </Button>
              )}
            </div>
            <dl className="space-y-1.5 border-t border-slate-100 pt-3">
              <Field label="Hoạt động gần nhất" value={formatVietnamDateTime(inquiry.lastActivityAt)} />
              <Field label="Cập nhật" value={formatVietnamDateTime(inquiry.updatedAt)} />
            </dl>
          </Section>

          <Section title="Nguồn truy cập">
            <dl className="space-y-1.5">
              <Field label="Nguồn" value={inquirySource(inquiry)} />
              <Field label="Trang gửi" value={inquiry.landingPage && <span className="font-mono">{inquiry.landingPage}</span>} />
              <Field label="Trang giới thiệu" value={inquiry.referrerOrigin} />
              <Field label="utm_medium" value={inquiry.utmMedium} />
              <Field label="utm_campaign" value={inquiry.utmCampaign} />
            </dl>
          </Section>
        </div>
      </div>
    </div>
  );
}
