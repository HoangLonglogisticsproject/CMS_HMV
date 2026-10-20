import type { AboutContent } from "../queries/use-pages";

// Field layout of each page type, mirroring the backend content class (page-content.dto.ts).
// The editor renders forms from this; adding a page type = one more entry, not a new editor.

export interface TextField {
  key: string;
  label: string;
  max: number;
  /** Multi-line textarea. */
  long?: boolean;
  /** A list of short labels edited as one per line (string[] in the content). */
  lines?: number;
}

export interface ListField {
  key: string;
  label: string;
  itemLabel: string;
  max: number;
  item: TextField[];
}

export interface FormSection {
  key: string;
  title: string;
  hint?: string;
  fields: TextField[];
  lists?: ListField[];
}

const titled: TextField[] = [
  { key: "title", label: "Tiêu đề", max: 160 },
  { key: "text", label: "Mô tả", max: 800, long: true },
];

export const PAGE_FORMS: Record<string, FormSection[]> = {
  about: [
    {
      key: "hero",
      title: "Phần mở đầu",
      hint: "Tiêu đề trang (H1) và đoạn giới thiệu; cũng là tiêu đề/mô tả SEO mặc định.",
      fields: [
        { key: "title", label: "Tiêu đề trang", max: 160 },
        { key: "lead", label: "Đoạn giới thiệu", max: 800, long: true },
      ],
    },
    {
      key: "purpose",
      title: "Định hướng phát triển",
      fields: [
        { key: "eyebrow", label: "Nhãn nhỏ", max: 80 },
        { key: "title", label: "Tiêu đề", max: 160 },
        { key: "intro", label: "Giới thiệu", max: 800, long: true },
      ],
    },
    {
      key: "vision",
      title: "Tầm nhìn",
      fields: [
        { key: "label", label: "Nhãn thẻ", max: 60 },
        { key: "quote", label: "Tuyên bố tầm nhìn", max: 2000, long: true },
        { key: "goalTitle", label: "Tiêu đề mục tiêu", max: 160 },
        { key: "goalText", label: "Mô tả mục tiêu", max: 2000, long: true },
      ],
      lists: [
        {
          key: "markets",
          label: "Thị trường mục tiêu",
          itemLabel: "Thị trường",
          max: 20,
          item: [
            { key: "name", label: "Tên", max: 80 },
            { key: "flag", label: "Cờ (emoji)", max: 16 },
          ],
        },
      ],
    },
    {
      key: "mission",
      title: "Sứ mệnh",
      fields: [
        { key: "label", label: "Nhãn thẻ", max: 60 },
        { key: "title", label: "Tiêu đề", max: 160 },
        { key: "text", label: "Nội dung", max: 2000, long: true },
      ],
      lists: [{ key: "highlights", label: "Điểm nổi bật", itemLabel: "Điểm", max: 6, item: titled }],
    },
    {
      key: "values",
      title: "Giá trị cốt lõi",
      fields: [{ key: "title", label: "Tiêu đề", max: 160 }],
      lists: [{ key: "items", label: "Giá trị", itemLabel: "Giá trị", max: 8, item: titled }],
    },
    {
      key: "team",
      title: "Đội ngũ sáng lập",
      hint: "Thứ tự thành viên quyết định biểu tượng hiển thị trên website.",
      fields: [
        { key: "eyebrow", label: "Nhãn nhỏ", max: 80 },
        { key: "title", label: "Tiêu đề", max: 160 },
        { key: "intro", label: "Giới thiệu", max: 800, long: true },
        { key: "closingTitle", label: "Tiêu đề khối kết", max: 160 },
        { key: "closingText", label: "Nội dung khối kết", max: 800, long: true },
        { key: "ctaLabel", label: "Nút liên hệ", max: 60 },
      ],
      lists: [
        {
          key: "members",
          label: "Thành viên",
          itemLabel: "Thành viên",
          max: 8,
          item: [
            { key: "name", label: "Họ tên", max: 120 },
            { key: "role", label: "Chức danh", max: 160 },
            { key: "badge", label: "Huy hiệu", max: 80 },
            { key: "bio", label: "Giới thiệu", max: 800, long: true },
            { key: "specialties", label: "Chuyên môn (mỗi dòng một mục)", max: 80, lines: 10 },
          ],
        },
      ],
    },
  ],
};

type Json = Record<string, unknown>;

/** An item with every field empty. */
export const emptyItem = (fields: TextField[]): Json => Object.fromEntries(fields.map((f) => [f.key, f.lines ? [] : ""]));

/** Content with every field empty and every list empty, for a locale that has no translation yet. */
export function emptyContent(key: string): AboutContent {
  return Object.fromEntries(
    (PAGE_FORMS[key] ?? []).map((s) => [s.key, { ...emptyItem(s.fields), ...Object.fromEntries((s.lists ?? []).map((l) => [l.key, []])) }]),
  ) as unknown as AboutContent;
}
