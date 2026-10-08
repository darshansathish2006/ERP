import type { Company } from '../lib/types';

/**
 * Fallbacks for company fields added after the first release. A company saved in Settings before
 * these existed has them `undefined`; the printed documents then use the standard texts
 * (mirrors DEFAULT_COMPANY in server/engine/catalog.js). Empty values set on purpose are kept.
 */
const FALLBACK = {
  website: 'www.evawinoptimize.com',
  letter: [
    'We are delighted that you are considering our range of Windows and Doors for your premises.',
    'It has gained rapid acceptance across all cities of India for the overwhelming advantages of better protection from noise, heat, rain, dust and pollution.',
    'In drawing this proposal, it has been our endeavor to suggest designs which would enhance your comfort and aesthetics from inside and improve the facade of the building.',
    'It has a well-established service network to deliver seamless service at your doorstep. Our offer comprises of the following in enclosure for your kind perusal:',
    'a. Window design, specification and value',
    'b. Terms and Conditions',
    'We now look forward to be of service to you.',
  ],
  bankDetailsAfter: 1,
  warrantyTitle: "Prominance's warranty is limited strictly to the profile against colour degradation only",
  warrantyPoints: ['a) faulty or improper fabrication,', 'b) faulty or improper installation by the Fabricator, or', 'c) misuse or improper handling by the end customer.'],
  warrantyNote:
    "Warranty on hardware and glass used in the windows and door Systems shall be provided by the Fabricator, and not by Prominance, as Prominance's warranty is limited strictly to the profile.",
  acceptance: 'I hereby accept the estimate as per above mentioned price and specifications. I have read and understood the terms & conditions and agree to them.',
  brands: [
    { label: 'PROFILE', names: ['PROMINANCE'] },
    { label: 'REINFORCEMENT', names: ['JSW Steel'] },
    { label: 'HARDWARE', names: ['KIN LONG', 'SIEGENIA', 'DEKA', 'DNV', 'PTA'] },
    { label: 'SILICON', names: ['BOSS', 'McCoy SOUDAL'] },
    { label: 'GLASS', names: ['SAINT-GOBAIN', 'AIS', 'RAMSARA'] },
  ],
} satisfies Partial<Company>;

export type PrintCompany = Company & Required<Pick<Company, 'website' | 'letter' | 'bankDetailsAfter' | 'warrantyTitle' | 'warrantyPoints' | 'warrantyNote' | 'acceptance' | 'brands'>>;

const cache = new WeakMap<Company, PrintCompany>();

export function printCompany(company: Company): PrintCompany {
  const hit = cache.get(company);
  if (hit) return hit;
  const c = company ?? ({} as Company);
  const out: PrintCompany = {
    ...c,
    name: c.name || 'TITANS WINDOWS',
    partnerBrand: c.partnerBrand || 'PROMINANCE',
    partnerTagline: c.partnerTagline || 'uPVC WINDOW SYSTEMS',
    bank: c.bank ?? { accountName: '', accountNo: '', bankName: '', ifsc: '', branch: '' },
    paymentTerms: Array.isArray(c.paymentTerms) ? c.paymentTerms : [],
    terms: Array.isArray(c.terms) ? c.terms : [],
    prerequisites: Array.isArray(c.prerequisites) ? c.prerequisites : [],
    website: c.website || FALLBACK.website,
    letter: Array.isArray(c.letter) ? c.letter : FALLBACK.letter,
    bankDetailsAfter: typeof c.bankDetailsAfter === 'number' && Number.isFinite(c.bankDetailsAfter) ? c.bankDetailsAfter : FALLBACK.bankDetailsAfter,
    warrantyTitle: c.warrantyTitle ?? FALLBACK.warrantyTitle,
    warrantyPoints: Array.isArray(c.warrantyPoints) ? c.warrantyPoints : FALLBACK.warrantyPoints,
    warrantyNote: c.warrantyNote ?? FALLBACK.warrantyNote,
    acceptance: c.acceptance ?? FALLBACK.acceptance,
    brands: Array.isArray(c.brands) ? c.brands : FALLBACK.brands,
  };
  if (company) cache.set(company, out);
  return out;
}
