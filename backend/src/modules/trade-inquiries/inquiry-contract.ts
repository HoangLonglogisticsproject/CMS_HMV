// The HMV Trade Desk inquiry contract: the goals, products, origins, units and requirement keys the website may send.
// Mirrors the website's controlled rules (HMV_landingpage src/features/trade-desk/rules.js); the CMS validates against
// this copy and is authoritative. A key or option missing here is refused, so a website change needs this file updated
// in the same release (docs/sales/TRADE_INQUIRIES.md, "Contract").

export const INQUIRY_LOCALES = ['en', 'vi'] as const;
export const INQUIRY_GOALS = ['sourcing', 'logistics', 'customs'] as const;
export type InquiryGoal = (typeof INQUIRY_GOALS)[number];

export const ORIGINS: Record<string, string> = {
  vietnam: 'Vietnam',
  cambodia: 'Cambodia',
};
export const VOLUME_UNITS: Record<string, string> = {
  containers: 'containers',
  containers_month: 'containers / month',
  mt: 'MT',
  mt_month: 'MT / month',
};
export const TRANSPORT: Record<string, string> = {
  sea_fcl: 'Sea freight (FCL)',
  sea_reefer: 'Refrigerated container',
  air: 'Air freight',
  undecided: 'Not decided yet',
};

export interface Requirement {
  key: string;
  label: string;
  /** Choice requirements: option id → label. Text requirements have none. */
  options?: Record<string, string>;
}

const text = (key: string, label: string): Requirement => ({ key, label });
const INCOTERM: Requirement = {
  key: 'incoterm',
  label: 'Incoterm',
  options: Object.fromEntries(
    ['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'DAP', 'DDP'].map((i) => [i, i]),
  ),
};
const DESTINATION_PORT = text('destinationPort', 'Exact destination port');
const DELIVERY_WINDOW = text('deliveryWindow', 'Delivery window');
const CERTIFICATION = text('certification', 'Certification requirement');
/** Products other than the two buyer pages: their specification points, then route and terms. */
const specs = (...labels: string[]) => [
  ...labels.map((label) =>
    text(`spec-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, label),
  ),
  DESTINATION_PORT,
  DELIVERY_WINDOW,
  CERTIFICATION,
  INCOTERM,
];

export interface ProductRule {
  name: string;
  origins: string[];
  applications?: Record<string, string>;
  requirements: Requirement[];
}

export const PRODUCTS: Record<string, ProductRule> = {
  'passion-fruit': {
    name: 'Passion fruit',
    origins: ['vietnam'],
    requirements: [
      text('variety', 'Variety'),
      text('sizeWeight', 'Size / weight'),
      text('brix', 'Brix requirement'),
      text('packaging', 'Packaging'),
      text('deliveryWindow', 'Season / delivery window'),
      DESTINATION_PORT,
      text('destinationRequirements', 'Destination requirements'),
    ],
  },
  'dried-cassava-chips': {
    name: 'Dried cassava chips',
    origins: ['vietnam', 'cambodia'],
    applications: {
      feed: 'Animal feed',
      bioethanol: 'Bioethanol',
      starch: 'Starch processing',
    },
    requirements: [
      text('starch', 'Required starch %'),
      text('moisture', 'Maximum moisture %'),
      text('loading', 'Loading / packaging requirement'),
      INCOTERM,
      DESTINATION_PORT,
      DELIVERY_WINDOW,
    ],
  },
  bananas: {
    name: 'Cavendish bananas',
    origins: ['vietnam'],
    requirements: specs(
      'Fruit size',
      'Maturity',
      'Carton weight',
      'Cold chain',
    ),
  },
  'dragon-fruit': {
    name: 'Dragon fruit',
    origins: ['vietnam'],
    requirements: specs(
      'Flesh colour',
      'Fruit grade',
      'Packaging',
      'Destination requirements',
    ),
  },
  spices: {
    name: 'Spices',
    origins: ['vietnam'],
    requirements: specs('Variety', 'Moisture', 'Microbiology', 'Processing'),
  },
  nuts: {
    name: 'Cashew nuts',
    origins: ['vietnam'],
    requirements: specs(
      'Kernel grade',
      'Moisture',
      'Defect tolerance',
      'Packaging',
    ),
  },
  'tapioca-starch': {
    name: 'Tapioca starch',
    origins: ['vietnam'],
    requirements: specs('Application', 'Moisture', 'Viscosity', 'Packaging'),
  },
};

export const GOAL_REQUIREMENTS: Record<
  Exclude<InquiryGoal, 'sourcing'>,
  Requirement[]
> = {
  logistics: [
    {
      key: 'cargoType',
      label: 'Cargo type',
      options: {
        general: 'General cargo',
        reefer: 'Temperature-controlled',
        dangerous: 'Dangerous goods',
        oversized: 'Oversized / project cargo',
      },
    },
    text('readyDate', 'Cargo ready date'),
    INCOTERM,
    text('packaging', 'Packing details'),
  ],
  customs: [
    {
      key: 'service',
      label: 'Service needed',
      options: {
        import: 'Import clearance',
        export: 'Export clearance',
        documents: 'Documents & certificates review',
        dg: 'Dangerous-goods classification',
      },
    },
    text('hsCode', 'HS code, if known'),
    text('timing', 'Required timing'),
  ],
};

/**
 * `table[key]` only for the table's own keys: website input is never used to reach inherited members
 * ("__proto__", "constructor", "toString"…), which would pass a plain `table[key]` truthiness check.
 */
export const lookup = <T>(
  table: Record<string, T> | undefined,
  key: string | null | undefined,
): T | undefined =>
  table && typeof key === 'string' && Object.hasOwn(table, key)
    ? table[key]
    : undefined;

export const requirementsFor = (
  goal: InquiryGoal,
  productId: string | null | undefined,
) =>
  goal === 'sourcing'
    ? (lookup(PRODUCTS, productId)?.requirements ?? [])
    : GOAL_REQUIREMENTS[goal];

/** Stored requirement: the controlled key, its label and the value (an option's label for choices). */
export interface StoredRequirement {
  key: string;
  label: string;
  value: string;
}
