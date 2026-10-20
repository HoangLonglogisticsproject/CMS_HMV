// Content shape per page key. A page type is a fixed set of fields that mirrors one website page: editors fill
// fields and bounded lists, they do not compose layouts. Presentation (icons, grids, links) stays on the website.
//
// Conventions every page type follows:
// - It has `hero { title, lead }`: the page title and the default SEO title/description.
// - Drafts may leave text empty or lists short. Submitting for review requires every text field to be filled
//   and every list to have at least one item (`missingFields`).
import { Type, plainToInstance } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsObject,
  IsString,
  MaxLength,
  validate,
  ValidateNested,
} from 'class-validator';
import type { Issue } from '../../common/errors';

const SHORT = 160;
const PARAGRAPH = 2000;

export class PageHero {
  @IsString() @MaxLength(SHORT) title: string;
  @IsString() @MaxLength(800) lead: string;
}

export class TitledText {
  @IsString() @MaxLength(SHORT) title: string;
  @IsString() @MaxLength(800) text: string;
}

export class AboutPurpose {
  @IsString() @MaxLength(80) eyebrow: string;
  @IsString() @MaxLength(SHORT) title: string;
  @IsString() @MaxLength(800) intro: string;
}

export class AboutMarket {
  @IsString() @MaxLength(80) name: string;
  /** Emoji flag shown next to the market name. */
  @IsString() @MaxLength(16) flag: string;
}

export class AboutVision {
  @IsString() @MaxLength(60) label: string;
  @IsString() @MaxLength(PARAGRAPH) quote: string;
  @IsString() @MaxLength(SHORT) goalTitle: string;
  @IsString() @MaxLength(PARAGRAPH) goalText: string;
  /** Target markets, in display order. */
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AboutMarket)
  markets: AboutMarket[];
}

export class AboutMission {
  @IsString() @MaxLength(60) label: string;
  @IsString() @MaxLength(SHORT) title: string;
  @IsString() @MaxLength(PARAGRAPH) text: string;
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => TitledText)
  highlights: TitledText[];
}

export class AboutValues {
  @IsString() @MaxLength(SHORT) title: string;
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => TitledText)
  items: TitledText[];
}

export class AboutTeamMember {
  @IsString() @MaxLength(120) name: string;
  @IsString() @MaxLength(SHORT) role: string;
  /** Short credential shown as a badge, e.g. "30 Years Experience". */
  @IsString() @MaxLength(80) badge: string;
  @IsString() @MaxLength(800) bio: string;
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  specialties: string[];
}

export class AboutTeam {
  @IsString() @MaxLength(80) eyebrow: string;
  @IsString() @MaxLength(SHORT) title: string;
  @IsString() @MaxLength(800) intro: string;
  /** In display order; the website assigns icons by position. */
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => AboutTeamMember)
  members: AboutTeamMember[];
  @IsString() @MaxLength(SHORT) closingTitle: string;
  @IsString() @MaxLength(800) closingText: string;
  /** Label of the button linking to the contact page. */
  @IsString() @MaxLength(60) ctaLabel: string;
}

/** Content of the `about` page, one per locale. */
export class AboutPageContent {
  @IsObject() @ValidateNested() @Type(() => PageHero) hero: PageHero;
  @IsObject() @ValidateNested() @Type(() => AboutPurpose) purpose: AboutPurpose;
  @IsObject() @ValidateNested() @Type(() => AboutVision) vision: AboutVision;
  @IsObject() @ValidateNested() @Type(() => AboutMission) mission: AboutMission;
  @IsObject() @ValidateNested() @Type(() => AboutValues) values: AboutValues;
  @IsObject() @ValidateNested() @Type(() => AboutTeam) team: AboutTeam;
}

/** Page key → content class. Adding a page = a class here + a migration that inserts the `pages` row. */
export const PAGE_TYPES: Record<string, new () => object> = {
  about: AboutPageContent,
};
export const CONTENT_VERSION = 1;

/** Structural validation for a draft: known fields only, right types, length and list limits. */
export async function validatePageContent(
  key: string,
  content: unknown,
  prefix: string,
): Promise<Issue[]> {
  const type = PAGE_TYPES[key];
  if (!type)
    return [{ path: prefix, message: `No content type for page "${key}"` }];
  const errors = await validate(plainToInstance(type, content), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const issues: Issue[] = [];
  const walk = (list: typeof errors, path: string) => {
    for (const e of list) {
      const p = `${path}.${e.property}`;
      for (const message of Object.values(e.constraints ?? {}))
        issues.push({ path: p, message });
      walk(e.children ?? [], p);
    }
  };
  walk(errors, prefix);
  return issues;
}

/** What must still be filled before a translation can be submitted for review. */
export function missingFields(value: unknown, path = 'content'): Issue[] {
  if (typeof value === 'string')
    return value.trim() ? [] : [{ path, message: 'Required' }];
  if (Array.isArray(value)) {
    if (!value.length) return [{ path, message: 'Add at least one item' }];
    return value.flatMap((v, i) => missingFields(v, `${path}[${i}]`));
  }
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([k, v]) =>
      missingFields(v, `${path}.${k}`),
    );
  return [];
}
