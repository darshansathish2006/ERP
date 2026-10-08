import {
  AppWindow,
  Boxes,
  Calculator,
  CreditCard,
  FileUp,
  Layers,
  MapPin,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Target,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type SectionKey =
  | 'favourites'
  | 'roles'
  | 'users'
  | 'locations'
  | 'rm-pricing'
  | 'glazing'
  | 'price-calc'
  | 'payment'
  | 'opportunity'
  | 'transport'
  | 'import'
  | 'rm-settings'
  | 'other';

export interface SectionDef {
  key: SectionKey;
  label: string;
  description: string;
  icon: LucideIcon;
}

export interface CardDef {
  /** Stored in favourites and used as `?page=<key>`. */
  key: string;
  section: SectionKey;
  title: string;
  description: string;
  /** Sub-page heading when it differs from the card title (e.g. "Profile price"). */
  pageTitle?: string;
  /** Pages reachable by URL only (no card on the settings home). */
  hidden?: boolean;
}

export const SECTIONS: SectionDef[] = [
  { key: 'favourites', label: 'Favourite Settings', description: 'Quick access to the settings pages you use most.', icon: Star },
  { key: 'roles', label: 'Roles & Permissions', description: 'Control what each role can see and change.', icon: ShieldCheck },
  { key: 'users', label: 'Users And Teams', description: 'Manage the people who use Titans ERP and the teams they belong to.', icon: Users },
  { key: 'locations', label: 'Locations & Territories', description: 'Manage the cities and states used across opportunities.', icon: MapPin },
  {
    key: 'rm-pricing',
    label: 'Raw Material Pricing',
    description: 'Create price lists against the raw materials and the overall price structure to be used in a quote.',
    icon: Boxes,
  },
  { key: 'glazing', label: 'Glazing Pricing', description: 'Manage glazing and glazing pricing.', icon: AppWindow },
  { key: 'price-calc', label: 'Price & Calculation', description: 'Configure prices and calculations rules', icon: Calculator },
  { key: 'payment', label: 'Payment', description: 'Manage payments.', icon: CreditCard },
  { key: 'opportunity', label: 'Opportunity', description: 'Define the various data points to be captured against the opportunity.', icon: Target },
  { key: 'transport', label: 'Transportation', description: 'Vehicles and transport charges used for the Transportation Cost head', icon: Truck },
  { key: 'import', label: 'Import Data', description: 'Import data from Excel', icon: FileUp },
  { key: 'rm-settings', label: 'Raw Material Settings', description: 'Profiles, hardware, glass, colours, systems and library designs', icon: Layers },
  { key: 'other', label: 'Other', description: 'Company profile, quotation content and notifications.', icon: SlidersHorizontal },
];

export const CARDS: CardDef[] = [
  // Roles & Permissions
  { key: 'roles', section: 'roles', title: 'Roles', description: 'Create roles and choose what each role can do' },
  // Users And Teams
  { key: 'users', section: 'users', title: 'Users', description: 'Add users, assign roles and teams' },
  { key: 'teams', section: 'users', title: 'Teams', description: 'See every team and the users that belong to it' },
  // Locations & Territories
  { key: 'cities', section: 'locations', title: 'Cities', description: 'Cities and states used for site addresses' },
  // Raw Material Pricing
  { key: 'profile-price', section: 'rm-pricing', title: 'Profile', pageTitle: 'Profile price', description: 'Create, update the price levels of Profile raw materials' },
  {
    key: 'reinforcement-price',
    section: 'rm-pricing',
    title: 'Reinforcement',
    pageTitle: 'Reinforcement price',
    description: 'Create, update the price levels of Reinforcement raw materials',
  },
  { key: 'hardware-price', section: 'rm-pricing', title: 'Hardware', pageTitle: 'Hardware price', description: 'Create, update the price levels of Hardware raw materials' },
  { key: 'raw-material-price-list', section: 'rm-pricing', title: 'Raw material price list', description: 'Import raw material prices via excel' },
  // Glazing Pricing
  { key: 'glazing-price', section: 'glazing', title: 'Glazing', pageTitle: 'Glazing price', description: 'Create, update the price levels of glazing raw materials' },
  { key: 'glazing-price-list', section: 'glazing', title: 'Glazing price list', description: 'Import glazing prices via excel' },
  { key: 'glazing-supplier', section: 'glazing', title: 'Glazing supplier', description: 'Create and manage glazing suppliers' },
  // Price & Calculation
  { key: 'price-structure', section: 'price-calc', title: 'Price structure', description: 'Create, update the overall costing structure for the entire project' },
  // Payment
  { key: 'payment-medium', section: 'payment', title: 'Payment medium', description: 'Create and manage the payment mediums' },
  { key: 'payment-terms', section: 'payment', title: 'Payment terms', description: 'Manage payment terms' },
  { key: 'bank-accounts', section: 'payment', title: 'Organization bank accounts', description: 'Manage all your bank accounts' },
  { key: 'business-unit', section: 'payment', title: 'Business unit', description: 'Create and manage business unit' },
  { key: 'user-business-unit', section: 'payment', title: 'User business unit', description: 'Create and manage user business unit' },
  // Opportunity
  { key: 'opportunity-sources', section: 'opportunity', title: 'Opportunity sources', description: 'Add and maintain lead sources like social media, print media, digital marketing' },
  { key: 'opportunity-stages', section: 'opportunity', title: 'Opportunity stages', description: 'Add and maintain the stages in a sales pipeline' },
  { key: 'lost-reasons', section: 'opportunity', title: 'Lost reasons', description: 'Add data points to understand the reason behind losing opportunities.' },
  { key: 'lost-competitor', section: 'opportunity', title: 'Lost competitor', description: 'Create list of competitors to whom the opportunities are being lost.' },
  { key: 'personnel-type', section: 'opportunity', title: 'Opportunity personnel type', description: 'The type of contacts to be maintained against an opportunity.' },
  { key: 'contact-designation', section: 'opportunity', title: 'Contact designation', description: 'The industry relevant designations given to contacts against accounts.' },
  { key: 'opportunity-category', section: 'opportunity', title: 'Opportunity category', description: 'Create and manage the type of opportunity categories.' },
  { key: 'account-type', section: 'opportunity', title: 'Customer account type', description: 'Create and manage the type of customer accounts.' },
  { key: 'tags', section: 'opportunity', title: 'Tags', description: 'Add tags to store extra information in opportunities, contacts and accounts.' },
  { key: 'touchpoint-types', section: 'opportunity', title: 'Touchpoint types', description: 'Types of customer interactions you log' },
  // Transportation
  { key: 'vehicles', section: 'transport', title: 'Vehicles', description: 'Vehicles and the transport charge per trip' },
  // Import Data
  { key: 'import-opportunities', section: 'import', title: 'Opportunities', description: 'Bulk import opportunities and customers' },
  { key: 'import-raw-material-prices', section: 'import', title: 'Raw material prices', description: 'Import raw material prices via excel' },
  // Raw Material Settings
  { key: 'rm-items', section: 'rm-settings', title: 'Items', description: 'Profiles, aluminium, reinforcement and hardware items' },
  { key: 'rm-glass', section: 'rm-settings', title: 'Glass & mesh', description: 'Glass, louver glass and insect mesh with their rates' },
  { key: 'rm-colours', section: 'rm-settings', title: 'Colours', description: 'Profile colours, laminations and code suffixes' },
  { key: 'rm-systems', section: 'rm-settings', title: 'Profile systems', description: 'Sliding and casement systems and the profiles they use' },
  { key: 'rm-library', section: 'rm-settings', title: 'Library designs', description: 'Saved designs that can be reused in any quote' },
  { key: 'raw-material-settings', section: 'rm-settings', title: 'Raw Material Settings', description: 'Profiles, hardware, glass, colours, systems and library designs', hidden: true },
  // Other
  { key: 'company-profile', section: 'other', title: 'Company profile', description: 'Company details, logos and the quotation header image' },
  { key: 'quotation-terms', section: 'other', title: 'Quotation terms', description: 'Covering letter, payment terms, terms & conditions, warranty and prerequisites' },
  { key: 'notifications', section: 'other', title: 'Notifications', description: 'Maintenance banner shown to every signed-in user' },
];

export const CARD_BY_KEY: Record<string, CardDef> = Object.fromEntries(CARDS.map((c) => [c.key, c]));

export function isSectionKey(v: string | null): v is SectionKey {
  return !!v && SECTIONS.some((s) => s.key === v);
}

export type LookupType =
  | 'opportunity_source'
  | 'opportunity_stage'
  | 'lost_reason'
  | 'lost_competitor'
  | 'personnel_type'
  | 'contact_designation'
  | 'opportunity_category'
  | 'account_type'
  | 'tag'
  | 'payment_medium'
  | 'payment_term'
  | 'business_unit'
  | 'glazing_supplier'
  | 'transport_vehicle'
  | 'document_category'
  | 'touchpoint_type';

export interface LookupConfig {
  type: LookupType;
  /** Singular noun used in buttons and messages, e.g. "source". */
  noun: string;
  /** Adds a "Rate (₹ per trip)" column stored in `meta.rate`. */
  withRate?: boolean;
  /** Built-in values shown as locked rows at the end of the list. */
  locked?: string[];
}

export const LOOKUP_PAGES: Record<string, LookupConfig> = {
  'glazing-supplier': { type: 'glazing_supplier', noun: 'supplier' },
  'payment-medium': { type: 'payment_medium', noun: 'payment medium' },
  'payment-terms': { type: 'payment_term', noun: 'payment term' },
  'business-unit': { type: 'business_unit', noun: 'business unit' },
  'opportunity-sources': { type: 'opportunity_source', noun: 'source' },
  'opportunity-stages': { type: 'opportunity_stage', noun: 'stage', locked: ['Won', 'Lost'] },
  'lost-reasons': { type: 'lost_reason', noun: 'reason' },
  'lost-competitor': { type: 'lost_competitor', noun: 'competitor' },
  'personnel-type': { type: 'personnel_type', noun: 'personnel type' },
  'contact-designation': { type: 'contact_designation', noun: 'designation' },
  'opportunity-category': { type: 'opportunity_category', noun: 'category' },
  'account-type': { type: 'account_type', noun: 'account type' },
  tags: { type: 'tag', noun: 'tag' },
  'touchpoint-types': { type: 'touchpoint_type', noun: 'touchpoint type' },
  vehicles: { type: 'transport_vehicle', noun: 'vehicle', withRate: true },
};

export interface LookupEntry {
  value: string;
  meta: Record<string, unknown>;
  sort: number;
}
