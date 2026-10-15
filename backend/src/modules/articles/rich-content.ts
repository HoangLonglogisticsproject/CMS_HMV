/**
 * Rich content schema v1: the Tiptap/ProseMirror JSON produced by the CMS editor
 * (StarterKit with headings 2–3, Link, Image).
 *
 * The validator rebuilds every document from a whitelist instead of trusting it: unknown node types,
 * marks and attributes are rejected, link hrefs are restricted to safe schemes, and images must
 * reference a media-library asset by `mediaId` (the stored `src` is dropped and re-resolved on read).
 * JSON is not "safe because it is not HTML": a renderer that maps attrs to HTML attributes would
 * happily emit `href="javascript:..."` or arbitrary classes.
 */
import type { Issue } from '../../common/errors';

export const RICH_CONTENT_VERSION = 1;
export const MAX_CONTENT_BYTES = 256 * 1024;
const MAX_DEPTH = 32;
const MAX_NODES = 20_000;

type Json = Record<string, unknown>;
type AttrCheck = (value: unknown) => boolean;

interface Spec {
  children?: readonly string[]; // absent = leaf node
  minChildren?: number;
  attrs?: Record<string, AttrCheck>;
  required?: readonly string[];
  dropped?: readonly string[]; // accepted from the editor but not stored
}

const BLOCK = [
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'codeBlock',
  'horizontalRule',
  'image',
];
const INLINE = ['text', 'hardBreak'];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REL_TOKENS = new Set([
  'noopener',
  'noreferrer',
  'nofollow',
  'ugc',
  'sponsored',
]);
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

const nullable =
  (check: AttrCheck): AttrCheck =>
  (v) =>
    v === null || check(v);
const str =
  (max: number): AttrCheck =>
  (v) =>
    typeof v === 'string' && v.length <= max;
const posInt =
  (max: number): AttrCheck =>
  (v) =>
    Number.isInteger(v) && (v as number) > 0 && (v as number) <= max;

export function isSafeHref(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048)
    return false;
  // Whitespace/control characters are how "java\tscript:" style bypasses get through naive checks.
  // oxlint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (/[\u0000-\u0020\u007f]/.test(value)) return false;
  if (
    value.startsWith('#') ||
    (value.startsWith('/') && !value.startsWith('//'))
  )
    return true;
  try {
    return SAFE_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false; // relative paths without a leading "/" and protocol-relative "//host" are not allowed
  }
}

const NODES: Record<string, Spec> = {
  doc: { children: BLOCK, minChildren: 1 },
  paragraph: { children: INLINE },
  heading: {
    children: INLINE,
    attrs: { level: (v) => v === 2 || v === 3 },
    required: ['level'],
  },
  blockquote: { children: BLOCK, minChildren: 1 },
  bulletList: { children: ['listItem'], minChildren: 1 },
  orderedList: {
    children: ['listItem'],
    minChildren: 1,
    attrs: {
      start: nullable(posInt(100_000)),
      type: nullable((v) => ['1', 'a', 'A', 'i', 'I'].includes(v as string)),
    },
  },
  listItem: { children: BLOCK, minChildren: 1 },
  codeBlock: {
    children: ['text'],
    attrs: {
      language: nullable(
        (v) => typeof v === 'string' && /^[a-z0-9+#-]{1,30}$/i.test(v),
      ),
    },
  },
  horizontalRule: {},
  hardBreak: {},
  image: {
    attrs: {
      mediaId: (v) => typeof v === 'string' && UUID_RE.test(v),
      alt: nullable(str(500)),
      title: nullable(str(300)),
      width: nullable(posInt(10_000)),
      height: nullable(posInt(10_000)),
    },
    required: ['mediaId'],
    dropped: ['src'],
  },
};

const MARKS: Record<string, Spec> = {
  bold: {},
  italic: {},
  strike: {},
  underline: {},
  code: {},
  link: {
    attrs: {
      href: isSafeHref,
      target: nullable((v) => v === '_blank'),
      rel: nullable(
        (v) =>
          typeof v === 'string' &&
          v
            .split(/\s+/)
            .filter(Boolean)
            .every((t) => REL_TOKENS.has(t)),
      ),
      title: nullable(str(300)),
    },
    required: ['href'],
    dropped: ['class'], // presentation belongs to the renderer, not the content
  },
};

const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function checkAttrs(
  spec: Spec,
  raw: unknown,
  path: string,
  issues: Issue[],
): Json | undefined {
  if (raw === undefined) raw = {};
  if (!isObject(raw)) {
    issues.push({ path: `${path}.attrs`, message: 'attrs must be an object' });
    return undefined;
  }
  const out: Json = {};
  for (const [key, value] of Object.entries(raw)) {
    const check = spec.attrs?.[key];
    if (check) {
      if (check(value)) out[key] = value;
      else
        issues.push({
          path: `${path}.attrs.${key}`,
          message: `Invalid value for attribute "${key}"`,
        });
    } else if (!spec.dropped?.includes(key)) {
      issues.push({
        path: `${path}.attrs.${key}`,
        message: `Attribute "${key}" is not allowed`,
      });
    }
  }
  for (const key of spec.required ?? []) {
    if (raw[key] === undefined || raw[key] === null)
      issues.push({
        path: `${path}.attrs.${key}`,
        message: `Attribute "${key}" is required`,
      });
  }
  return Object.keys(out).length ? out : undefined;
}

export type RichContentResult =
  { ok: true; doc: Json; mediaIds: string[] } | { ok: false; issues: Issue[] };

export function validateRichContent(input: unknown): RichContentResult {
  const issues: Issue[] = [];
  if (Buffer.byteLength(JSON.stringify(input) ?? '') > MAX_CONTENT_BYTES) {
    return {
      ok: false,
      issues: [
        { path: '', message: `Content exceeds ${MAX_CONTENT_BYTES} bytes` },
      ],
    };
  }
  const mediaIds = new Set<string>();
  let nodeCount = 0;

  const walk = (
    node: unknown,
    path: string,
    depth: number,
    allowed: readonly string[],
  ): Json | undefined => {
    if (++nodeCount > MAX_NODES) {
      if (nodeCount === MAX_NODES + 1)
        issues.push({
          path,
          message: `Content has more than ${MAX_NODES} nodes`,
        });
      return undefined;
    }
    if (depth > MAX_DEPTH) {
      issues.push({
        path,
        message: `Content is nested deeper than ${MAX_DEPTH} levels`,
      });
      return undefined;
    }
    if (!isObject(node) || typeof node.type !== 'string') {
      issues.push({
        path,
        message: 'Node must be an object with a string "type"',
      });
      return undefined;
    }
    const { type } = node;
    if (!allowed.includes(type)) {
      issues.push({
        path,
        message:
          NODES[type] || type === 'text'
            ? `"${type}" is not allowed here`
            : `Node type "${type}" is not supported`,
      });
      return undefined;
    }

    if (type === 'text') {
      for (const key of Object.keys(node)) {
        if (!['type', 'text', 'marks'].includes(key))
          issues.push({
            path: `${path}.${key}`,
            message: `Field "${key}" is not allowed on text`,
          });
      }
      if (typeof node.text !== 'string' || node.text.length === 0) {
        issues.push({
          path: `${path}.text`,
          message: 'Text must be a non-empty string',
        });
        return undefined;
      }
      const out: Json = { type, text: node.text };
      if (node.marks !== undefined) {
        if (!Array.isArray(node.marks)) {
          issues.push({
            path: `${path}.marks`,
            message: 'marks must be an array',
          });
        } else if (node.marks.length) {
          const seen = new Set<string>();
          out.marks = node.marks.flatMap((mark, i) => {
            const markPath = `${path}.marks[${i}]`;
            const spec =
              isObject(mark) && typeof mark.type === 'string'
                ? MARKS[mark.type]
                : undefined;
            if (!spec || !isObject(mark)) {
              issues.push({
                path: markPath,
                message: `Mark "${isObject(mark) ? String(mark.type) : '?'}" is not supported`,
              });
              return [];
            }
            if (seen.has(mark.type as string))
              issues.push({
                path: markPath,
                message: `Duplicate mark "${String(mark.type)}"`,
              });
            seen.add(mark.type as string);
            for (const key of Object.keys(mark)) {
              if (key !== 'type' && key !== 'attrs')
                issues.push({
                  path: `${markPath}.${key}`,
                  message: `Field "${key}" is not allowed on a mark`,
                });
            }
            const attrs = checkAttrs(spec, mark.attrs, markPath, issues);
            return [attrs ? { type: mark.type, attrs } : { type: mark.type }];
          });
        }
      }
      return out;
    }

    const spec = NODES[type];
    for (const key of Object.keys(node)) {
      if (!['type', 'attrs', 'content'].includes(key))
        issues.push({
          path: `${path}.${key}`,
          message: `Field "${key}" is not allowed on ${type}`,
        });
    }
    const out: Json = { type };
    const attrs = checkAttrs(spec, node.attrs, path, issues);
    if (attrs) out.attrs = attrs;
    if (type === 'image' && typeof attrs?.mediaId === 'string') {
      attrs.mediaId = attrs.mediaId.toLowerCase(); // Postgres returns uuids lower-cased; keep lookups consistent
      mediaIds.add(attrs.mediaId as string);
    }

    const content = node.content;
    if (!spec.children) {
      if (
        content !== undefined &&
        !(Array.isArray(content) && content.length === 0)
      ) {
        issues.push({
          path: `${path}.content`,
          message: `${type} cannot have content`,
        });
      }
      return out;
    }
    if (content !== undefined && !Array.isArray(content)) {
      issues.push({
        path: `${path}.content`,
        message: 'content must be an array',
      });
      return out;
    }
    const children = (content ?? []).map((child, i) =>
      walk(child, `${path}.content[${i}]`, depth + 1, spec.children!),
    );
    if (children.length < (spec.minChildren ?? 0))
      issues.push({
        path: `${path}.content`,
        message: `${type} needs at least ${spec.minChildren} child node(s)`,
      });
    if (type === 'codeBlock' && children.some((c) => c?.marks))
      issues.push({
        path: `${path}.content`,
        message: 'Code blocks cannot contain marks',
      });
    if (
      type === 'listItem' &&
      children[0] &&
      children[0].type !== 'paragraph'
    ) {
      issues.push({
        path: `${path}.content[0]`,
        message: 'A list item must start with a paragraph',
      });
    }
    if (children.length) out.content = children;
    return out;
  };

  const doc = walk(input, '', 0, ['doc']);
  return issues.length || !doc
    ? { ok: false, issues }
    : { ok: true, doc, mediaIds: [...mediaIds] };
}

/** Visits every node of a stored (already validated) document. */
function visit(node: unknown, fn: (node: Json) => void) {
  if (!isObject(node)) return;
  fn(node);
  if (Array.isArray(node.content))
    for (const child of node.content) visit(child, fn);
}

export function collectMediaIds(doc: unknown): string[] {
  const ids = new Set<string>();
  visit(doc, (n) => {
    const id =
      n.type === 'image' && isObject(n.attrs) ? n.attrs.mediaId : undefined;
    if (typeof id === 'string') ids.add(id);
  });
  return [...ids];
}

export function countWords(doc: unknown): number {
  let words = 0;
  visit(doc, (n) => {
    if (typeof n.text === 'string')
      words += n.text.split(/\s+/).filter(Boolean).length;
  });
  return words;
}

/** Images in the document whose alt text is empty after falling back to the asset's default alt. */
export function imagesMissingAlt(
  doc: unknown,
  defaultAlt: (mediaId: string) => string | undefined,
): string[] {
  const missing: string[] = [];
  visit(doc, (n) => {
    if (n.type !== 'image' || !isObject(n.attrs)) return;
    const id = n.attrs.mediaId as string;
    if (
      !(typeof n.attrs.alt === 'string' && n.attrs.alt.trim()) &&
      !defaultAlt(id)?.trim()
    )
      missing.push(id);
  });
  return missing;
}

/** Returns a copy with image `src` resolved from the media library (and alt defaulted when requested). */
export function hydrateContent(
  doc: unknown,
  resolve: (mediaId: string) => { url: string; alt?: string } | undefined,
): unknown {
  if (!isObject(doc)) return doc;
  const out: Json = { ...doc };
  if (doc.type === 'image' && isObject(doc.attrs)) {
    const media = resolve(doc.attrs.mediaId as string);
    out.attrs = {
      ...doc.attrs,
      src: media?.url ?? null,
      alt: doc.attrs.alt ?? media?.alt ?? null,
    };
  }
  if (Array.isArray(doc.content))
    out.content = doc.content.map((c) => hydrateContent(c, resolve));
  return out;
}

/** JSON with recursively sorted keys, so hashes do not depend on key order (Postgres jsonb reorders keys). */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}
