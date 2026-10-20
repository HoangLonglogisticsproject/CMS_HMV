"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowUp, CheckCircle2, History, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isApiError } from "@/lib/api/client";
import { errorDetails, errorMessage } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/utils/format";
import { useCan } from "@/modules/auth/queries/use-session";
import {
  type AboutContent,
  type PageDetail,
  type PageState,
  type PageStep,
  type PageTranslation,
  usePageDetail,
  usePageStep,
  useSavePageDraft,
} from "../queries/use-pages";
import { emptyContent, emptyItem, type FormSection, type ListField, PAGE_FORMS, type TextField } from "../utils/page-form";

const LOCALES = [
  { code: "vi", label: "Tiếng Việt (VI)" },
  { code: "en", label: "English (EN)" },
] as const;
type Locale = (typeof LOCALES)[number]["code"];
type Json = Record<string, unknown>;
interface Draft {
  content: Json;
  seoTitle: string;
  seoDescription: string;
}

const STATE: Record<PageState, { label: string; variant: "outline" | "success" | "warning" }> = {
  DRAFT: { label: "Bản nháp", variant: "outline" },
  IN_REVIEW: { label: "Chờ duyệt", variant: "warning" },
  APPROVED: { label: "Đã duyệt", variant: "success" },
  CHANGES_REQUESTED: { label: "Cần chỉnh sửa", variant: "warning" },
};

const failed = (title: string) => (err: unknown) =>
  toast.error(title, { description: [errorMessage(err), ...errorDetails(err)].join(" · ") });

/** Lists of labels are edited one per line; blank lines are dropped when saving. */
function withoutBlankLines(value: unknown): unknown {
  if (Array.isArray(value))
    return value.every((v) => typeof v === "string") ? value.filter((v) => v.trim()) : value.map(withoutBlankLines);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withoutBlankLines(v)]));
  return value;
}

export function PageEditorView({ pageId }: { pageId: string }) {
  const { data: page, isLoading, error, refetch } = usePageDetail(pageId);
  if (isLoading) return <p className="p-6 text-sm text-slate-500">Đang tải trang…</p>;
  if (error || !page)
    return (
      <Card className="p-6 space-y-3 border-slate-200 bg-white">
        <p className="text-sm text-slate-700">{errorMessage(error)}</p>
        <Button size="sm" variant="outline" onClick={() => void refetch()}>
          Thử lại
        </Button>
      </Card>
    );
  // A new revision (saved here or by someone else and reloaded) remounts the form with the server's content.
  return <PageEditor key={page.revision} page={page} onReload={() => void refetch()} />;
}

function PageEditor({ page, onReload }: { page: PageDetail; onReload: () => void }) {
  const can = useCan();
  const save = useSavePageDraft();
  const sections = PAGE_FORMS[page.key] ?? [];
  const [locale, setLocale] = useState<Locale>("vi");
  const [initial] = useState(
    () =>
      Object.fromEntries(
        LOCALES.map(({ code }) => {
          const t = page.translations.find((x) => x.locale === code);
          return [code, { content: (t?.content ?? emptyContent(page.key)) as unknown as Json, seoTitle: t?.seoTitle ?? "", seoDescription: t?.seoDescription ?? "" }];
        }),
      ) as Record<Locale, Draft>,
  );
  const [drafts, setDrafts] = useState(initial);
  const changed = LOCALES.map((l) => l.code).filter((l) => JSON.stringify(drafts[l]) !== JSON.stringify(initial[l]));
  const dirty = changed.length > 0;
  const editable = can("page:write");
  const draft = drafts[locale];
  const update = (patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [locale]: { ...d[locale], ...patch } }));

  const onSave = () =>
    save.mutate(
      {
        key: page.key,
        expectedRevision: page.revision,
        translations: changed.map((l) => ({
          locale: l,
          content: withoutBlankLines(drafts[l].content) as AboutContent,
          seoTitle: drafts[l].seoTitle.trim() || null,
          seoDescription: drafts[l].seoDescription.trim() || null,
        })),
      },
      {
        onSuccess: (d) => toast.success(`Đã lưu bản nháp (bản #${d.revision})`),
        onError: (err) =>
          isApiError(err, "REVISION_CONFLICT")
            ? toast.error("Trang đã được người khác lưu trước bạn.", {
                description: "Tải lại để xem bản mới nhất. Thay đổi chưa lưu của bạn sẽ bị bỏ.",
                action: { label: "Tải lại", onClick: onReload },
              })
            : failed("Lưu bản nháp không thành công")(err),
      },
    );

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-2xs backdrop-blur">
        <Link href="/content/pages" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Quay lại danh sách trang">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="mr-auto">
          <h1 className="text-sm font-bold text-[#113E67]">{page.title ?? page.key}</h1>
          <p className="text-[11px] text-slate-500">
            Trang <code>{page.key}</code> · bản nháp #{page.revision}
            {page.updatedAt ? ` · ${formatDateTime(page.updatedAt)}` : ""}
          </p>
        </div>
        <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
          {LOCALES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLocale(l.code)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${locale === l.code ? "bg-[#0066CC] text-white" : "text-slate-600 hover:text-slate-900"}`}
            >
              {l.label}
            </button>
          ))}
        </div>
        {dirty ? (
          <span className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
            Chưa lưu thay đổi
          </span>
        ) : (
          <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800">
            <CheckCircle2 className="h-3 w-3" />
            Đã lưu vào hệ thống
          </span>
        )}
        <Button
          type="button"
          size="sm"
          disabled={!editable || !dirty || save.isPending}
          onClick={onSave}
          className="h-8 gap-1.5 bg-[#087EC2] text-xs font-semibold text-white hover:bg-[#066ba8]"
        >
          <Save className="h-3.5 w-3.5" />
          {save.isPending ? "Đang lưu…" : "Lưu Bản Nháp"}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {sections.map((s) => (
            <SectionCard
              key={`${locale}-${s.key}`}
              section={s}
              path={s.key}
              value={(draft.content[s.key] ?? {}) as Json}
              disabled={!editable}
              onChange={(v) => update({ content: { ...draft.content, [s.key]: v } })}
            />
          ))}
          <Card className="space-y-3 border-slate-200 bg-white p-4 shadow-2xs">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wide text-[#123D68]">SEO</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">Để trống để dùng tiêu đề trang và đoạn giới thiệu.</p>
            </div>
            <FieldInput
              id={`${locale}-seoTitle`}
              field={{ key: "seoTitle", label: "Tiêu đề SEO", max: 200 }}
              value={draft.seoTitle}
              disabled={!editable}
              onChange={(v) => update({ seoTitle: v as string })}
            />
            <FieldInput
              id={`${locale}-seoDescription`}
              field={{ key: "seoDescription", label: "Mô tả SEO", max: 500, long: true }}
              value={draft.seoDescription}
              disabled={!editable}
              onChange={(v) => update({ seoDescription: v as string })}
            />
          </Card>
        </div>
        <div className="space-y-4">
          <WorkflowPanel page={page} dirty={dirty} />
          <HistoryPanel page={page} />
        </div>
      </div>
    </div>
  );
}

function SectionCard({ section, path, value, disabled, onChange }: { section: FormSection; path: string; value: Json; disabled: boolean; onChange: (v: Json) => void }) {
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v });
  return (
    <Card className="space-y-3 border-slate-200 bg-white p-4 shadow-2xs" data-testid={`section-${section.key}`}>
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wide text-[#123D68]">{section.title}</h2>
        {section.hint && <p className="mt-0.5 text-[11px] text-slate-500">{section.hint}</p>}
      </div>
      {section.fields.map((f) => (
        <FieldInput key={f.key} id={`${path}.${f.key}`} field={f} value={value[f.key]} disabled={disabled} onChange={(v) => set(f.key, v)} />
      ))}
      {section.lists?.map((l) => (
        <ListEditor key={l.key} path={`${path}.${l.key}`} list={l} items={(value[l.key] as Json[]) ?? []} disabled={disabled} onChange={(v) => set(l.key, v)} />
      ))}
    </Card>
  );
}

function FieldInput({ id, field, value, disabled, onChange }: { id: string; field: TextField; value: unknown; disabled: boolean; onChange: (v: unknown) => void }) {
  const label = (
    <label htmlFor={id} className="text-[11px] font-semibold text-slate-600">
      {field.label}
    </label>
  );
  if (field.lines)
    return (
      <div className="space-y-1">
        {label}
        <Textarea id={id} rows={3} disabled={disabled} className="text-xs" value={((value as string[]) ?? []).join("\n")} onChange={(e) => onChange(e.target.value.split("\n").slice(0, field.lines))} />
      </div>
    );
  const Control = field.long ? Textarea : Input;
  return (
    <div className="space-y-1">
      {label}
      <Control id={id} disabled={disabled} maxLength={field.max} className="text-xs" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ListEditor({ path, list, items, disabled, onChange }: { path: string; list: ListField; items: Json[]; disabled: boolean; onChange: (v: Json[]) => void }) {
  const setItem = (i: number, k: string, v: unknown) => onChange(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const moveUp = (i: number) => onChange(items.map((x, j) => (j === i - 1 ? items[i] : j === i ? items[i - 1] : x)));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-600">
          {list.label} ({items.length}/{list.max})
        </span>
        <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={disabled || items.length >= list.max} onClick={() => onChange([...items, emptyItem(list.item)])}>
          <Plus className="h-3 w-3" />
          Thêm {list.itemLabel.toLowerCase()}
        </Button>
      </div>
      {items.map((item, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500">
              {list.itemLabel} {i + 1}
            </span>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2" disabled={disabled || i === 0} onClick={() => moveUp(i)} title={`Đưa ${list.itemLabel.toLowerCase()} ${i + 1} lên trên`}>
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-rose-600" disabled={disabled} onClick={() => onChange(items.filter((_, j) => j !== i))} title={`Xoá ${list.itemLabel.toLowerCase()} ${i + 1}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {list.item.map((f) => (
            <FieldInput key={f.key} id={`${path}[${i}].${f.key}`} field={f} value={item[f.key]} disabled={disabled} onChange={(v) => setItem(i, f.key, v)} />
          ))}
        </div>
      ))}
    </div>
  );
}

function WorkflowPanel({ page, dirty }: { page: PageDetail; dirty: boolean }) {
  const can = useCan();
  const step = usePageStep();
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const run = (locale: string, s: PageStep, done: string, extra: { note?: string } = {}) =>
    step.mutate(
      { key: page.key, locale, step: s, expectedRevision: page.revision, ...extra },
      {
        onSuccess: () => {
          setNoteFor(null);
          setNote("");
          toast.success(done);
        },
        onError: failed("Thao tác không thành công"),
      },
    );
  const busy = dirty || step.isPending;

  return (
    <Card className="space-y-3 border-slate-200 bg-white p-4 shadow-2xs" data-testid="page-workflow">
      <h2 className="text-xs font-bold uppercase tracking-wide text-[#123D68]">Duyệt &amp; xuất bản</h2>
      {dirty && <p className="text-[11px] text-amber-700">Lưu bản nháp trước khi gửi duyệt hoặc xuất bản.</p>}
      {LOCALES.map(({ code }) => {
        const t = page.translations.find((x) => x.locale === code) as PageTranslation | undefined;
        const L = code.toUpperCase();
        if (!t)
          return (
            <div key={code} data-testid={`page-workflow-${code}`} className="rounded-lg border border-dashed border-slate-200 p-3 text-[11px] text-slate-500">
              {L}: chưa có bản dịch
            </div>
          );
        const live = t.isLive ? (t.hasUnpublishedChanges ? "Công khai (bản cũ)" : "Đang công khai") : "Chưa công khai";
        const reviewable = t.state === "IN_REVIEW" || (t.state === "APPROVED" && t.hasUnpublishedChanges);
        return (
          <div key={code} data-testid={`page-workflow-${code}`} className="space-y-2 rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold text-slate-700">{L}</span>
              <Badge variant={STATE[t.state].variant}>{STATE[t.state].label}</Badge>
              <Badge variant={t.isLive && !t.hasUnpublishedChanges ? "success" : "outline"}>{live}</Badge>
            </div>
            {t.publishedRevision !== null && (
              <p className="text-[11px] text-slate-500">
                Đang phục vụ bản #{t.publishedRevision}
                {t.publishedAt ? ` · ${formatDateTime(t.publishedAt)}` : ""}
              </p>
            )}
            {t.reviewNote && <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">Yêu cầu chỉnh sửa: {t.reviewNote}</p>}
            {t.missingFields.length > 0 && (t.state === "DRAFT" || t.state === "CHANGES_REQUESTED") && (
              <p className="text-[11px] text-slate-500" title={t.missingFields.join("\n")}>
                Còn {t.missingFields.length} trường cần điền trước khi gửi duyệt.
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {can("page:write") && (t.state === "DRAFT" || t.state === "CHANGES_REQUESTED") && (
                <Button size="sm" className="h-7 text-xs" disabled={busy || t.missingFields.length > 0} onClick={() => run(code, "submit", `Đã gửi duyệt bản ${L}`)}>
                  Gửi duyệt {L}
                </Button>
              )}
              {can("page:review") && t.state === "IN_REVIEW" && (
                <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={() => run(code, "approve", `Đã duyệt bản ${L}`)}>
                  Duyệt {L}
                </Button>
              )}
              {can("page:review") && reviewable && (
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => setNoteFor(noteFor === code ? null : code)}>
                  Yêu cầu sửa {L}
                </Button>
              )}
              {can("page:publish") && t.state === "APPROVED" && t.hasUnpublishedChanges && (
                <Button
                  size="sm"
                  className="h-7 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`Xuất bản bản ${L}? Nội dung này sẽ hiển thị công khai trên website.`)) run(code, "publish", `Đã xuất bản bản ${L}`);
                  }}
                >
                  Xuất bản {L}
                </Button>
              )}
            </div>
            {noteFor === code && (
              <div className="space-y-1.5">
                <label htmlFor={`note-${code}`} className="text-[11px] font-semibold text-slate-600">
                  Cần chỉnh sửa gì?
                </label>
                <Textarea id={`note-${code}`} rows={2} maxLength={1000} className="text-xs" value={note} onChange={(e) => setNote(e.target.value)} />
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy || !note.trim()} onClick={() => run(code, "request-changes", `Đã yêu cầu chỉnh sửa bản ${L}`, { note })}>
                  Gửi yêu cầu {L}
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}

function HistoryPanel({ page }: { page: PageDetail }) {
  return (
    <Card className="space-y-2 border-slate-200 bg-white p-4 shadow-2xs" data-testid="page-history">
      <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#123D68]">
        <History className="h-3.5 w-3.5" />
        Lịch sử bản nháp
      </h2>
      {page.history.length === 0 && <p className="text-[11px] text-slate-500">Chưa có bản nháp nào.</p>}
      <ul className="space-y-1">
        {page.history.map((h) => (
          <li key={h.number} className="text-[11px] text-slate-600">
            <span className="font-semibold">#{h.number}</span> · {formatDateTime(h.createdAt)} · {h.createdBy.displayName} · {h.locales.join(", ").toUpperCase()}
          </li>
        ))}
      </ul>
    </Card>
  );
}
