export type PermissionKey = 'settings.manage' | 'rates.manage' | 'opportunity.delete' | 'quote.manualRate' | 'reports.costing';

export interface User {
  id: number;
  name: string;
  email: string;
  /** Role name: 'admin', 'sales' or a custom role created in Settings → Roles & Permissions. */
  role: string;
  team: string | null;
  phone: string | null;
  /** Present on the signed-in user only. */
  permissions?: Partial<Record<PermissionKey, boolean>>;
}

export interface SystemDef {
  id: string;
  brand: string;
  name: string;
  type: 'sliding' | 'casement';
  roles: Record<string, string>;
  limits: { minWidth: number; maxWidth: number; minHeight: number; maxHeight: number; maxSashWidth: number; maxSashHeight: number };
}

export interface ColorDef {
  id: string;
  name: string;
  inside: string;
  outside: string;
  hex_in: string;
  hex_out: string;
  suffix: string;
  laminated: number;
  sort: number;
  /** Hardware colour used with this profile colour: WHITE, BROWN or BLACK. */
  hw_color: string;
}

export interface GlassDef {
  id: string;
  code: string;
  name: string;
  thickness: number;
  rate: number;
  kind: 'glass' | 'louver' | 'mesh';
  sort: number;
  supplier?: string | null;
}

export interface ItemDef {
  code: string;
  name: string;
  category: 'profile' | 'aluminium' | 'reinforcement' | 'hardware';
  grp: string;
  unit: string;
  rate: number;
  rate_lam: number | null;
  color_variant: number;
  bar_length: number | null;
  weight: number;
  sort: number;
  extra?: string;
  brand?: string | null;
  rm_category?: string | null;
  active?: number;
}

export interface City {
  id: number;
  name: string;
  state: string;
  country: string;
}

export interface Company {
  name: string;
  tagline: string;
  partnerBrand: string;
  partnerTagline: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  quotePrefix: string;
  projectPrefix: string;
  website?: string;
  /** data: URLs (PNG/JPG/WEBP/SVG) printed on the quotation header. Empty string = not set. */
  logo?: string;
  partnerLogo?: string;
  headerImage?: string;
  bank: { accountName: string; accountNo: string; bankName: string; ifsc: string; branch: string };
  quoteValidityDays: number;
  /** Covering letter paragraphs on page 1. Lines starting with "a. " / "b. " are indented sub-points. */
  letter?: string[];
  /** Sub-points (a, b, …) of term 1 "Payments terms: -". */
  paymentTerms: string[];
  /** Terms numbered from 2. `**text**` is bold. */
  terms: string[];
  /** Bank details block is printed after terms[bankDetailsAfter]. */
  bankDetailsAfter?: number;
  warrantyTitle?: string;
  warranty: string;
  warrantyPoints?: string[];
  warrantyNote?: string;
  /** Numbered; lines starting with "a. " / "b. " are un-numbered sub-points of the previous item. `**text**` is bold. */
  prerequisites: string[];
  acceptance?: string;
  brands?: { label: string; names: string[] }[];
  notes: string;
  defaultFloorAperture: number;
}

export interface PriceLevel {
  id: number;
  category: 'profile' | 'reinforcement' | 'hardware' | 'glass';
  name: string;
  isDefault: boolean;
}

export interface Masters {
  systems: SystemDef[];
  colors: ColorDef[];
  glasses: GlassDef[];
  items: ItemDef[];
  cities: City[];
  users: User[];
  priceStructures: { id: number; name: string }[];
  stages: string[];
  sources: string[];
  categories: string[];
  lostReasons: string[];
  documentCategories: string[];
  designNames: string[];
  calcTypes: string[];
  formulaVariables: Record<string, string>;
  company: Company;
  banner: { enabled: boolean; message: string };
  lostCompetitors: string[];
  personnelTypes: string[];
  accountTypes: string[];
  tags: string[];
  touchpointTypes: string[];
  glazingSuppliers: string[];
  roles: string[];
  priceLevels: PriceLevel[];
  defaultPriceStructureId: number | null;
}

export interface Personnel {
  name: string;
  role?: string | null;
  phone?: string | null;
}

export interface Opportunity {
  id: number;
  code: string;
  projectName: string;
  salutation: string;
  firstName: string;
  lastName: string;
  contactName: string;
  phoneCode: string;
  phone: string;
  email: string;
  note: string;
  address1: string;
  address2: string;
  pincode: string;
  city: string;
  state: string;
  country: string;
  siteLocation: string;
  lat: number | null;
  lng: number | null;
  billTo: string;
  marketingPartner: string;
  managedBy: string;
  stage: string;
  source: string;
  estValue: number | null;
  category: string;
  closureDate: string;
  supplyStart: string;
  supplyEnd: string;
  personnel: Personnel[];
  status: 'active' | 'won' | 'lost';
  lostReason: string;
  statusChangedAt: string | null;
  createdAt: string;
  updatedAt: string;
  quoteId: number | null;
  quoteNo: string | null;
  quoteValue: number | null;
  quoteArea: number | null;
  designCount: number | null;
  quoteCount: number | null;
  touchpoints: number;
  lastContactedAt: string | null;
  account: string;
  tags: string[];
  competitor: string;
}

export interface Touchpoint {
  id: number;
  kind: string;
  note: string;
  contactedAt: string;
  user: string;
}

export interface SavedView<C = Record<string, unknown>> {
  id: number;
  name: string;
  page: string;
  config: C;
}

// ---------- design geometry ----------
export type PanelType =
  | 'fixed'
  | 'casement'
  | 'tiltturn'
  | 'tophung'
  | 'bottomhung'
  | 'twin'
  | 'sliding'
  | 'monorail'
  | 'bifold'
  | 'louver'
  | 'fan'
  | 'mesh';

export interface LeafNode {
  id: string;
  kind: 'leaf';
  panel: PanelType;
  sashes?: number;
  tracks?: number;
  mesh?: boolean;
  hinge?: 'left' | 'right';
  glassId?: string;
  /** Louver panels only. */
  louverType?: 'fixed-glass' | 'fixed-pvc' | 'movable-glass';
  /** Pleated / pull-down insect mesh add-on. */
  pleated?: 'left' | 'right' | 'double' | 'pulldown';
  /** Georgian bar grid inside the glass. */
  georgian?: { rows: number; cols: number };
  /** MS safety grill add-on. */
  grill?: boolean;
}

export interface SplitNode {
  id: string;
  kind: 'split';
  dir: 'v' | 'h';
  sizes: number[];
  children: DesignNode[];
  equalization?: string;
}

export type DesignNode = LeafNode | SplitNode;

export interface DesignData {
  width: number;
  height: number;
  floorAperture: number;
  meshId?: string;
  root: DesignNode;
}

export interface Addon {
  name: string;
  amount: number;
  basis: 'unit' | 'sqft';
}

export interface SashInfo {
  label: string;
  leafNo: number;
  w: number;
  h: number;
  weight: number;
}

export interface Design {
  id: number;
  quoteId: number;
  ref: string;
  qty: number;
  name: string;
  location: string;
  floor: string;
  note: string;
  systemId: string;
  systemName: string;
  systemType: string;
  brand: string;
  colorId: string;
  colorName: string;
  colorInside: string;
  colorOutside: string;
  colorHex: string;
  colorHexIn: string;
  hwColor?: string;
  glassId: string;
  glassName: string;
  glassLabels: string[];
  data: DesignData;
  calcType: 'auto' | 'manual';
  manualSqftRate: number | null;
  addons: Addon[];
  sort: number;
  areaSqft: number;
  areaSqm: number;
  unitPrice: number;
  totalPrice: number;
  unitBasic: number;
  autoBasic: number;
  sqftRate: number;
  autoSqftRate: number;
  sashes: SashInfo[];
  warnings: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CostHead {
  sl: number;
  name: string;
  calcType: string;
  formula: string;
  rate: number;
  visibility: 'hidden' | 'summary';
  remark?: string;
  userRights?: string;
}

export interface SummaryHead extends CostHead {
  value: number;
}

export interface QuoteSummary {
  heads: SummaryHead[];
  basic: number;
  grand: number;
  qty: number;
  count: number;
  areaSqft: number;
  areaSqm: number;
  sqftRate: number;
  sqftRateWithTax: number;
  sqmRateWithTax: number;
  errors: string[];
}

export interface QuoteHeader {
  id: number;
  quoteNo: string;
  alias: string;
  projectCode: string;
  projectName: string;
  opportunityId: number;
  priceStructureId: number;
  priceStructureName: string;
  defaults: { systemId?: string; colorId?: string; glassId?: string; floorAperture?: number };
  remarks: string;
  createdAt: string;
  updatedAt: string;
  revisionNo: number;
  revisionTitle: string;
  isDefault: boolean;
  parentQuoteNo: string | null;
  priceLevels: Partial<Record<PriceLevel['category'], number>>;
  revisions: { id: number; quoteNo: string; alias: string; revisionNo: number; title: string; isDefault: boolean; grandTotal: number; createdAt: string }[];
  opportunity: Opportunity;
}

export interface QuoteListRow {
  id: number;
  opportunityId: number;
  quoteNo: string;
  alias: string;
  revisionNo: number;
  revisionTitle: string;
  parentQuoteNo: string | null;
  isDefault: boolean;
  projectName: string;
  projectCode: string;
  contact: string;
  city: string;
  status: 'active' | 'won' | 'lost';
  stage: string;
  managedBy: string;
  category: string;
  designCount: number;
  totalQty: number;
  totalArea: number;
  grandTotal: number;
  priceStructureName: string;
  revisionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FullQuote {
  quote: QuoteHeader;
  designs: Design[];
  summary: QuoteSummary;
}

export interface BomLine {
  code: string;
  baseCode: string;
  name: string;
  grp: string;
  category: string;
  unit: string;
  qty: number;
  rate: number;
  amount: number;
  /** WHITE / BROWN / BLACK for hardware, "Inside-X, Outside-Y" for profiles. */
  color?: string;
}

export interface CutLine {
  code: string;
  baseCode: string;
  name: string;
  role: string;
  category: string;
  length: number;
  qty: number;
  angle: string;
  member: string;
}

export interface PaneLine {
  label: string;
  leafNo: number;
  glassId: string;
  code: string;
  name: string;
  w: number;
  h: number;
  area: number;
  thickness: number;
}

export interface HeadValue extends CostHead {
  value: number;
  error?: string | null;
}

export interface ReportDesign extends Design {
  bom: {
    width: number;
    height: number;
    areaSqm: number;
    areaSqft: number;
    frameCode: string;
    lines: BomLine[];
    cuts: CutLine[];
    panes: PaneLine[];
    meshPanes: { label: string; w: number; h: number; area: number; name: string; code: string }[];
    sashes: SashInfo[];
    warnings: string[];
    leaves: { no: number; panel: string; x: number; y: number; w: number; h: number; sashes: number; mesh: boolean }[];
    vars: Record<string, number>;
  };
  price: { heads: HeadValue[]; basic: number; grand: number; sqftRate: number; autoBasic: number; manualBasic: number | null };
}

export interface ProfileBar {
  code: string;
  baseCode: string;
  name: string;
  category: string;
  color: string;
  barLength: number;
  pcs: number;
  billingQty: number;
  usedQty: number;
  wastage: number;
  wastagePct: number;
  bars: { cuts: number[]; used: number; offcut: number }[];
}

export interface ReportData {
  company: Company;
  quote: QuoteHeader;
  designs: ReportDesign[];
  summary: QuoteSummary;
  lines: BomLine[];
  bars: ProfileBar[];
  zeroRate: { profile: { code: string; name: string }[]; hardware: { code: string; name: string }[]; glass: { code: string; name: string }[] };
  manualDesigns: { ref: string; name: string; basic: number }[];
  generatedAt: string;
}

export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}
