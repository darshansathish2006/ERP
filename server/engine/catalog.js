// Master data for the Titans Windows quotation system.
// Rates for the PROMINANCE INVENTA SLIDING SERIES are taken from the reference
// cost breakup so that a 1500 x 1500 SL-SL walnut window prices at
// Basic ₹18,406.99 / Grand ₹21,720.25 exactly.

export const COLORS = [
  { id: 'white', name: 'WHITE', inside: 'WHITE', outside: 'WHITE', hex_in: '#F4F4F2', hex_out: '#F4F4F2', suffix: '', laminated: 0, hw_color: 'WHITE' },
  { id: 'walnut', name: 'WALNUT', inside: 'WALNUT', outside: 'WALNUT', hex_in: '#5B3A21', hex_out: '#5B3A21', suffix: 'WN', laminated: 1 },
  { id: 'black-texture', name: 'BLACK TEXTURE', inside: 'BLACK TEXTURE', outside: 'BLACK TEXTURE', hex_in: '#3A3A3B', hex_out: '#3A3A3B', suffix: 'BT', laminated: 1 },
  { id: 'black-smooth', name: 'BLACK SMOOTH', inside: 'BLACK SMOOTH', outside: 'BLACK SMOOTH', hex_in: '#6E6E6F', hex_out: '#6E6E6F', suffix: 'BS', laminated: 1 },
  { id: 'dark-oak', name: 'DARK OAK', inside: 'DARK OAK', outside: 'DARK OAK', hex_in: '#4A2410', hex_out: '#4A2410', suffix: 'DO', laminated: 1 },
  { id: 'anthracite-grey', name: 'ANTHRACITE GREY', inside: 'ANTHRACITE GREY', outside: 'ANTHRACITE GREY', hex_in: '#2C3337', hex_out: '#2C3337', suffix: 'AG', laminated: 1 },
  { id: 'golden-oak', name: 'GOLDEN OAK', inside: 'GOLDEN OAK', outside: 'GOLDEN OAK', hex_in: '#9C7A4B', hex_out: '#9C7A4B', suffix: 'GO', laminated: 1 },
  { id: 'mahogany', name: 'MAHOGANY', inside: 'MAHOGANY', outside: 'MAHOGANY', hex_in: '#6A0E0E', hex_out: '#6A0E0E', suffix: 'MH', laminated: 1 },
  { id: 'shadow-black', name: 'SHADOW BLACK', inside: 'SHADOW BLACK', outside: 'SHADOW BLACK', hex_in: '#565758', hex_out: '#565758', suffix: 'SB', laminated: 1 },
  { id: 'chocolate-brown', name: 'CHOCOLATE BROWN', inside: 'CHOCOLATE BROWN', outside: 'CHOCOLATE BROWN', hex_in: '#D2691E', hex_out: '#D2691E', suffix: 'CB', laminated: 1 },
  { id: 'woodec-oak-malt', name: 'WOODEC OAK MALT', inside: 'WOODEC OAK MALT', outside: 'WOODEC OAK MALT', hex_in: '#C08A63', hex_out: '#C08A63', suffix: 'OM', laminated: 1 },
  { id: 'woodec-oak-concrete', name: 'WOODEC OAK CONCRETE', inside: 'WOODEC OAK CONCRETE', outside: 'WOODEC OAK CONCRETE', hex_in: '#A6A69E', hex_out: '#A6A69E', suffix: 'OC', laminated: 1 },
  { id: 'silver-brush', name: 'SILVER BRUSH TEXTURE', inside: 'SILVER BRUSH TEXTURE', outside: 'SILVER BRUSH TEXTURE', hex_in: '#D6D7D9', hex_out: '#D6D7D9', suffix: 'SV', laminated: 1 },
  { id: 'anthracite-smooth', name: 'ANTHRACITE GREY SMOOTH 2', inside: 'ANTHRACITE GREY SMOOTH 2', outside: 'ANTHRACITE GREY SMOOTH 2', hex_in: '#22262C', hex_out: '#22262C', suffix: 'AS', laminated: 1 },
  { id: 'anthracite-texture', name: 'ANTHRACITE GREY TEXTURE', inside: 'ANTHRACITE GREY TEXTURE', outside: 'ANTHRACITE GREY TEXTURE', hex_in: '#3D4046', hex_out: '#3D4046', suffix: 'AT', laminated: 1 },
  { id: 'white-walnut', name: 'WHITE / WALNUT', inside: 'WHITE', outside: 'WALNUT', hex_in: '#F4F4F2', hex_out: '#5B3A21', suffix: 'WW', laminated: 1 },
];

export const GLASSES = [
  { id: 'g4-colour', code: 'CG0004CL', name: '4MM COLOUR GLASS', thickness: 4, rate: 480, kind: 'glass' },
  { id: 'g4-pinhead', code: 'CG0004PH', name: '4MM PINHEAD GLASS', thickness: 4, rate: 431, kind: 'glass' },
  { id: 'g4-plain', code: 'CG0004PL', name: '4MM PLAIN GLASS', thickness: 4, rate: 350, kind: 'glass' },
  { id: 'g4-green', code: 'CG0004GT', name: '4MM GREEN TINTED', thickness: 4, rate: 520, kind: 'glass' },
  { id: 'g4-refl-green', code: 'CG0004RG', name: '4MM REFLECTIVE GREEN', thickness: 4, rate: 610, kind: 'glass' },
  { id: 'g5-plain', code: 'CG0005PL', name: '5MM PLAIN GLASS', thickness: 5, rate: 420, kind: 'glass' },
  { id: 'g5-frosted', code: 'CG0005FR', name: '5MM FROSTED GLASS', thickness: 5, rate: 520, kind: 'glass' },
  { id: 'g6-toughened', code: 'TG0006PL', name: '6MM TOUGHENED GLASS', thickness: 6, rate: 1100, kind: 'glass' },
  { id: 'g8-toughened', code: 'TG0008PL', name: '8MM TOUGHENED GLASS', thickness: 8, rate: 1450, kind: 'glass' },
  { id: 'dgu-20', code: 'DG0020PL', name: '20MM DGU (5-10-5)', thickness: 20, rate: 2350, kind: 'glass' },
  { id: 'dgu-24', code: 'DG0024PL', name: '24MM DGU (6-12-6)', thickness: 24, rate: 2650, kind: 'glass' },
  { id: 'louver-6', code: 'LG0006FR', name: '6MM LOUVER GLASS (FROSTED)', thickness: 6, rate: 650, kind: 'louver' },
  { id: 'mesh-ss', code: 'MS-SS304', name: 'SS 304 INSECT MESH', thickness: 0, rate: 380, kind: 'mesh' },
  { id: 'mesh-fibre', code: 'MS-FIBRE', name: 'FIBRE GLASS INSECT MESH', thickness: 0, rate: 180, kind: 'mesh' },
  { id: 'mesh-pleated', code: 'MS-PLEAT', name: 'PLEATED MESH', thickness: 0, rate: 950, kind: 'mesh' },
];

// category: profile (uPVC), aluminium, reinforcement, hardware
// grp: report grouping used in the Typology Cost Breakup report
export const ITEMS = [
  // ---- uPVC profiles: INVENTA sliding ----
  { code: 'PS62-UF-01', name: '62MM 2 TRACK SLIDING FRAME', category: 'profile', grp: 'Profile', unit: 'Meter', rate: 296.64, rate_lam: 607.68, color_variant: 1, bar_length: 5.8, weight: 1.62 },
  { code: 'PS62-UF-02', name: '62MM 3 TRACK SLIDING FRAME', category: 'profile', grp: 'Profile', unit: 'Meter', rate: 556.88, rate_lam: 742.5, color_variant: 1, bar_length: 5.8, weight: 2.05 },
  { code: 'PS62-US-03', name: '62MM SLIDING SASH 24MM DGU', category: 'profile', grp: 'Profile', unit: 'Meter', rate: 267.48, rate_lam: 633.93, color_variant: 1, bar_length: 5.8, weight: 1.8 },
  { code: 'PA62-UB-03', name: '62MM SLIDING SINGLE GLASS BEAD 24MM DGU', category: 'profile', grp: 'Profile', unit: 'Meter', rate: 80.33, rate_lam: 232.93, color_variant: 1, bar_length: 5.8, weight: 0.4 },
  { code: 'PS62-UO-05', name: 'SL INTERLOCK WINDOW PROFILE', category: 'profile', grp: 'Profile', unit: 'Meter', rate: 0, rate_lam: 0, color_variant: 1, bar_length: 6, weight: 0.45 },
  { code: 'PS62-UM-04', name: '62MM SLIDING MULLION', category: 'profile', grp: 'Profile', unit: 'Meter', rate: 390, rate_lam: 520, color_variant: 1, bar_length: 5.8, weight: 1.35 },
  { code: 'PS62-MS-06', name: '62MM SLIDING MESH SASH', category: 'profile', grp: 'Profile', unit: 'Meter', rate: 255, rate_lam: 340, color_variant: 1, bar_length: 5.8, weight: 0.9 },
  // ---- uPVC profiles: OPTIMA casement ----
  { code: 'PC60-OF-01', name: '60MM CASEMENT OUTER FRAME', category: 'profile', grp: 'Profile', unit: 'Meter', rate: 398, rate_lam: 530.5, color_variant: 1, bar_length: 5.8, weight: 1.45 },
  { code: 'PC60-SW-02', name: '60MM CASEMENT SASH OPEN OUT', category: 'profile', grp: 'Profile', unit: 'Meter', rate: 452, rate_lam: 602.4, color_variant: 1, bar_length: 5.8, weight: 1.58 },
  { code: 'PC60-MU-03', name: '60MM CASEMENT MULLION', category: 'profile', grp: 'Profile', unit: 'Meter', rate: 431, rate_lam: 574.6, color_variant: 1, bar_length: 5.8, weight: 1.5 },
  { code: 'PC60-GB-24', name: '60MM GLASS BEAD 24MM DGU', category: 'profile', grp: 'Profile', unit: 'Meter', rate: 148.5, rate_lam: 198, color_variant: 1, bar_length: 5.8, weight: 0.35 },
  { code: 'PC60-FM-05', name: '60MM FRENCH FLOATING MULLION', category: 'profile', grp: 'Profile', unit: 'Meter', rate: 380, rate_lam: 505.2, color_variant: 1, bar_length: 5.8, weight: 1.2 },
  { code: 'PC60-MS-07', name: '60MM CASEMENT MESH SASH', category: 'profile', grp: 'Profile', unit: 'Meter', rate: 265, rate_lam: 352.8, color_variant: 1, bar_length: 5.8, weight: 0.85 },
  // ---- aluminium ----
  { code: 'PAM116', name: 'ALUMINIUM GUIDE RAIL', category: 'aluminium', grp: 'Aluminium Profiles', unit: 'Meter', rate: 51.51, bar_length: 3, weight: 0.21 },
  { code: 'PAM-MR-120', name: 'ALUMINIUM MONORAIL TRACK', category: 'aluminium', grp: 'Aluminium Profiles', unit: 'Meter', rate: 210, bar_length: 3, weight: 0.65 },
  { code: 'PAM-LVH-100', name: 'ALUMINIUM LOUVER BLADE HOLDER', category: 'aluminium', grp: 'Aluminium Profiles', unit: 'Meter', rate: 145, bar_length: 3, weight: 0.3 },
  // ---- reinforcement ----
  { code: 'PR12-06B', name: 'RI-14.5MM X 30.5MM', category: 'reinforcement', grp: 'Reinforcement', unit: 'Meter', rate: 50.49, bar_length: 6, weight: 0.85 },
  { code: 'PR12-23', name: 'RI-33MM X 36MM X 27.5MM', category: 'reinforcement', grp: 'Reinforcement', unit: 'Meter', rate: 94.14, bar_length: 6, weight: 0.868 },
  { code: 'PR10-19', name: 'RI-25MM X 30MM', category: 'reinforcement', grp: 'Reinforcement', unit: 'Meter', rate: 72.3, bar_length: 6, weight: 0.72 },
  { code: 'PR10-15', name: 'RI-20MM X 25MM', category: 'reinforcement', grp: 'Reinforcement', unit: 'Meter', rate: 61.2, bar_length: 6, weight: 0.6 },
  { code: 'PR10-30', name: 'RI-30MM X 40MM MULLION', category: 'reinforcement', grp: 'Reinforcement', unit: 'Meter', rate: 102.5, bar_length: 6, weight: 1.05 },
  // ---- fabrication hardware ----
  { code: 'PR-STLL', name: 'SLIDING TOUCH LOCK LEFT', category: 'hardware', grp: 'Fabrication Hardware', unit: 'Pcs', rate: 47, variants: { BROWN: 'PR-STLLB' } },
  { code: 'PR-STLLB', name: 'SLIDING TOUCH LOCK LEFT', category: 'hardware', grp: 'Fabrication Hardware', unit: 'Pcs', rate: 0, hw_color: 'BROWN' },
  { code: 'PR-STLR', name: 'SLIDING TOUCH LOCK RIGHT', category: 'hardware', grp: 'Fabrication Hardware', unit: 'Pcs', rate: 47, variants: { BROWN: 'PR-STLRB' } },
  { code: 'PR-STLRB', name: 'SLIDING TOUCH LOCK RIGHT', category: 'hardware', grp: 'Fabrication Hardware', unit: 'Pcs', rate: 0, hw_color: 'BROWN' },
  { code: 'PR-SWG', name: 'SINGLE WHEEL WITH GROOVE', category: 'hardware', grp: 'Fabrication Hardware', unit: 'Pcs', rate: 13 },
  { code: 'PR-SSWP', name: 'SLIDING SASH WOOL PILE', category: 'hardware', grp: 'Fabrication Hardware', unit: 'Meter', rate: 2.5 },
  { code: 'PR-GP1MM', name: 'GLASS PACKER 1MM', category: 'hardware', grp: 'Fabrication Hardware', unit: 'Pcs', rate: 1.32 },
  { code: 'PR-GP2MM', name: 'GLASS PACKER 2MM', category: 'hardware', grp: 'Fabrication Hardware', unit: 'Pcs', rate: 1.44 },
  { code: 'PR-TB', name: 'TOUCH BEAD', category: 'hardware', grp: 'Fabrication Hardware', unit: 'Pcs', rate: 3.12 },
  { code: 'PR-FS12', name: 'FRICTION STAY 12 INCH (PAIR)', category: 'hardware', grp: 'Fabrication Hardware', unit: 'Set', rate: 185 },
  { code: 'PR-FS16', name: 'FRICTION STAY 16 INCH (PAIR)', category: 'hardware', grp: 'Fabrication Hardware', unit: 'Set', rate: 225 },
  { code: 'PR-CH', name: 'CASEMENT HANDLE', category: 'hardware', grp: 'Fabrication Hardware', unit: 'Pcs', rate: 165 },
  { code: 'PR-MPL', name: 'MULTI POINT LOCKING GEAR', category: 'hardware', grp: 'Fabrication Hardware', unit: 'Pcs', rate: 420 },
  { code: 'PR-KEEP', name: 'LOCKING KEEP', category: 'hardware', grp: 'Fabrication Hardware', unit: 'Pcs', rate: 12 },
  { code: 'PR-TTK', name: 'TILT AND TURN HARDWARE KIT', category: 'hardware', grp: 'Fabrication Hardware', unit: 'Set', rate: 2850 },
  { code: 'PR-TS', name: 'TOP HUNG STAY', category: 'hardware', grp: 'Fabrication Hardware', unit: 'Pcs', rate: 210 },
  { code: 'PR-FMB', name: 'FLOATING MULLION BOLT SET', category: 'hardware', grp: 'Fabrication Hardware', unit: 'Set', rate: 260 },
  { code: 'PR-MRR', name: 'MONORAIL ROLLER SET', category: 'hardware', grp: 'Fabrication Hardware', unit: 'Set', rate: 480 },
  { code: 'PR-BFK', name: 'BIFOLD HARDWARE KIT (PER PANEL)', category: 'hardware', grp: 'Fabrication Hardware', unit: 'Set', rate: 1650 },
  { code: 'PR-LVC', name: 'LOUVER BLADE CLIP SET', category: 'hardware', grp: 'Fabrication Hardware', unit: 'Pcs', rate: 35 },
  { code: 'PR-FCO', name: 'EXHAUST FAN CUT-OUT RING', category: 'hardware', grp: 'Fabrication Hardware', unit: 'Pcs', rate: 350 },
  { code: 'PR-MC', name: 'MULLION CONNECTOR', category: 'hardware', grp: 'Fabrication Hardware', unit: 'Pcs', rate: 38 },
  // ---- add-ons (louvers, pleated mesh, georgian bars, grills) ----
  { code: 'PR-LVPVC', name: 'PVC LOUVER BLADE 100MM', category: 'hardware', grp: 'Accessories', unit: 'Meter', rate: 85 },
  { code: 'PR-MLS', name: 'MOVABLE LOUVER OPERATOR SET', category: 'hardware', grp: 'Accessories', unit: 'Set', rate: 450 },
  { code: 'PR-PLM', name: 'PLEATED MESH SYSTEM', category: 'hardware', grp: 'Accessories', unit: 'SQMT', rate: 1450 },
  { code: 'PR-PDM', name: 'PULL-DOWN ROLLER MESH SYSTEM', category: 'hardware', grp: 'Accessories', unit: 'SQMT', rate: 1250 },
  { code: 'PR-GB18', name: 'GEORGIAN BAR 18MM', category: 'hardware', grp: 'Accessories', unit: 'Meter', rate: 95 },
  { code: 'PR-GBC', name: 'GEORGIAN BAR CROSS CONNECTOR', category: 'hardware', grp: 'Accessories', unit: 'Pcs', rate: 18 },
  { code: 'MS-GRILL', name: 'MS SAFETY GRILL (POWDER COATED)', category: 'hardware', grp: 'Accessories', unit: 'SQMT', rate: 3200 },
  // ---- accessories ----
  { code: 'PPA 106', name: 'ANTI RATTLE STOPPER', category: 'hardware', grp: 'Accessories', unit: 'Pcs', rate: 6.39, variants: { BROWN: 'PPA-106-CS' } },
  { code: 'PPA-106-CS', name: 'ANTI RATTLE STOPPER', category: 'hardware', grp: 'Accessories', unit: 'Pcs', rate: 0, hw_color: 'BROWN' },
  { code: 'PR-MSH', name: 'MESH SASH HANDLE', category: 'hardware', grp: 'Accessories', unit: 'Pcs', rate: 45 },
  // ---- screws ----
  { code: 'PR-4X16', name: '4 X 16 RI SCREW', category: 'hardware', grp: 'Screws', unit: 'Pcs', rate: 2 },
  { code: 'PR-JAS', name: 'ANTI RATTLE SCREW', category: 'hardware', grp: 'Screws', unit: 'Pcs', rate: 0.61 },
  { code: 'PR-BSSCREW', name: 'BUMP STOPPER SCREW', category: 'hardware', grp: 'Screws', unit: 'Pcs', rate: 0.6 },
  { code: 'PR-DAS', name: 'DUST ARESTER SCREW', category: 'hardware', grp: 'Screws', unit: 'Pcs', rate: 2 },
  { code: 'PR-RS', name: 'ROLLER SCREW', category: 'hardware', grp: 'Screws', unit: 'Pcs', rate: 2 },
  { code: 'PR-SISCREW', name: 'SLIDING INTERLOCK SCREW', category: 'hardware', grp: 'Screws', unit: 'Pcs', rate: 2 },
  { code: 'PR-SPLSCREW', name: 'SLIDING TOUCH LOCK SCREW', category: 'hardware', grp: 'Screws', unit: 'Pcs', rate: 2 },
  { code: 'PR-SPLSSCREW', name: 'SLIDING TOUCH LOCK STRIKER SCREW', category: 'hardware', grp: 'Screws', unit: 'Pcs', rate: 2 },
  { code: 'PR-TBS', name: 'TOUCH BEAD SCREW', category: 'hardware', grp: 'Screws', unit: 'Pcs', rate: 0.51 },
  { code: 'PR-FSS', name: 'FRICTION STAY SCREW', category: 'hardware', grp: 'Screws', unit: 'Pcs', rate: 0.85 },
  { code: 'PR-HS', name: 'HANDLE SCREW', category: 'hardware', grp: 'Screws', unit: 'Pcs', rate: 1.2 },
  // ---- installation hardware ----
  { code: 'PR-STLS', name: 'SLIDING TOUCH LOCK STRIKER', category: 'hardware', grp: 'Installation Hardware', unit: 'Pcs', rate: 0 },
  { code: 'PR-BS', name: 'BUMP STOPPER', category: 'hardware', grp: 'Installation Hardware', unit: 'Pcs', rate: 7.08, variants: { BROWN: 'PR-BSB' } },
  { code: 'PR-BSB', name: 'BUMP STOPPER', category: 'hardware', grp: 'Installation Hardware', unit: 'Pcs', rate: 2, hw_color: 'BROWN' },
  { code: 'PPA-112', name: 'INVENTA DUST ARRESTER', category: 'hardware', grp: 'Installation Hardware', unit: 'Pcs', rate: 0, variants: { BROWN: 'PPA-1128' } },
  { code: 'PPA-1128', name: 'INVENTA DUST ARRESTER', category: 'hardware', grp: 'Installation Hardware', unit: 'Pcs', rate: 0, hw_color: 'BROWN' },
  { code: 'PR-FC', name: 'FASTNER CAPS', category: 'hardware', grp: 'Installation Hardware', unit: 'Pcs', rate: 1.5, variants: { BROWN: 'PR-FCB' } },
  { code: 'PR-FCB', name: 'FASTNER CAPS', category: 'hardware', grp: 'Installation Hardware', unit: 'Pcs', rate: 0, hw_color: 'BROWN' },
  { code: 'PR-N8X100', name: 'FASTNER SCREWS 100MM', category: 'hardware', grp: 'Installation Hardware', unit: 'Pcs', rate: 4.08 },
  { code: 'PR-N8X80', name: 'FASTNER SCREWS 80MM', category: 'hardware', grp: 'Installation Hardware', unit: 'Pcs', rate: 3.48 },
  { code: 'PR-DCF', name: 'DRAINAGE COVER FRAME', category: 'hardware', grp: 'Installation Hardware', unit: 'Pcs', rate: 1.1, variants: { BROWN: 'PR-DCFB' } },
  { code: 'PR-DCFB', name: 'DRAINAGE COVER FRAME', category: 'hardware', grp: 'Installation Hardware', unit: 'Pcs', rate: 0, hw_color: 'BROWN' },
  { code: 'PR-DCS', name: 'DRAINAGE COVER SASH', category: 'hardware', grp: 'Installation Hardware', unit: 'Pcs', rate: 1.1, variants: { BROWN: 'PR-DCSB' } },
  { code: 'PR-DCSB', name: 'DRAINAGE COVER SASH', category: 'hardware', grp: 'Installation Hardware', unit: 'Pcs', rate: 0, hw_color: 'BROWN' },
  { code: 'PR-PP1MM', name: 'PROFILE PACKER 1MM', category: 'hardware', grp: 'Installation Hardware', unit: 'Pcs', rate: 1.44 },
  { code: 'PR-PP2MM', name: 'PROFILE PACKER 2MM', category: 'hardware', grp: 'Installation Hardware', unit: 'Pcs', rate: 1.56 },
  { code: 'PR-PP5MM', name: 'PROFILE PACKER 5MM', category: 'hardware', grp: 'Installation Hardware', unit: 'Pcs', rate: 1.8 },
  { code: 'PR-ACRYLIC', name: 'SILICON ACRYLIC', category: 'hardware', grp: 'Installation Hardware', unit: 'CAN', rate: 95 },
  { code: 'PR-NEUTRAL', name: 'SILICON NEUTRAL', category: 'hardware', grp: 'Installation Hardware', unit: 'CAN', rate: 135 },
  // ---- gasket ----
  { code: '5210', name: 'K TYPE GASKET T-3', category: 'hardware', grp: 'Gasket', unit: 'Meter', rate: 11.4, hw_color: 'BLACK' },
  { code: 'PR-EPDM', name: 'EPDM SASH GASKET', category: 'hardware', grp: 'Gasket', unit: 'Meter', rate: 9.5, hw_color: 'BLACK' },
];

export const SYSTEMS = [
  {
    id: 'inventa-sliding',
    brand: 'PROMINANCE',
    name: 'PROMINANCE INVENTA SLIDING SERIES',
    type: 'sliding',
    roles: {
      frame: 'PS62-UF-01',
      frame3: 'PS62-UF-02',
      sash: 'PS62-US-03',
      bead: 'PA62-UB-03',
      interlock: 'PS62-UO-05',
      mullion: 'PS62-UM-04',
      meshSash: 'PS62-MS-06',
      guideRail: 'PAM116',
      monorail: 'PAM-MR-120',
      louverHolder: 'PAM-LVH-100',
      riFrame: 'PR12-23',
      riSash: 'PR12-06B',
      riMullion: 'PR12-23',
    },
    limits: { minWidth: 400, maxWidth: 4500, minHeight: 400, maxHeight: 2700, maxSashWidth: 1600, maxSashHeight: 2400 },
  },
  {
    id: 'optima-casement',
    brand: 'PROMINANCE',
    name: 'PROMINANCE OPTIMA CASEMENT SERIES',
    type: 'casement',
    roles: {
      frame: 'PC60-OF-01',
      frame3: 'PC60-OF-01',
      sash: 'PC60-SW-02',
      bead: 'PC60-GB-24',
      interlock: 'PS62-UO-05',
      mullion: 'PC60-MU-03',
      floatingMullion: 'PC60-FM-05',
      meshSash: 'PC60-MS-07',
      guideRail: 'PAM116',
      monorail: 'PAM-MR-120',
      louverHolder: 'PAM-LVH-100',
      riFrame: 'PR10-19',
      riSash: 'PR10-15',
      riMullion: 'PR10-30',
    },
    limits: { minWidth: 300, maxWidth: 4000, minHeight: 300, maxHeight: 2700, maxSashWidth: 900, maxSashHeight: 1800 },
  },
];

const H = (sl, name, calcType, formula, rate, visibility = 'hidden') => ({ sl, name, calcType, formula, rate, visibility });

export function retailCostHeads(overrides = {}) {
  const o = { profit: 15, fab: 50, inst: 25, gst: 18, discount: 0, ...overrides };
  return [
    H(1, 'uPVC Profile Cost', 'CustomFormula', '#UPVCPROFILECOST', 1),
    H(2, 'uPVC Profile Wastage', 'Percentage', '[uPVC Profile Cost]', 5),
    H(3, 'Aluminium Profile Cost', 'CustomFormula', '#ALUMINIUMPROFILECOST', 1),
    H(4, 'Aluminium Profile Wastage', 'Percentage', '[Aluminium Profile Cost]', 1),
    H(5, 'RI Cost', 'CustomFormula', '#RICOST', 1),
    H(6, 'RI Wastage', 'Percentage', '[RI Cost]', 0),
    H(7, 'Hardware Cost', 'CustomFormula', '#HWCOST + #MESHCOST', 1),
    H(8, 'Glass Cost', 'CustomFormula', '#GLASSCOST', 1),
    H(9, 'Glass Wastage', 'Percentage', '[Glass Cost]', 0),
    H(10, 'Total Raw Material Cost', 'CustomFormula',
      '[uPVC Profile Cost] + [uPVC Profile Wastage] + [Aluminium Profile Cost] + [Aluminium Profile Wastage] + [RI Cost] + [RI Wastage] + [Hardware Cost] + [Glass Cost] + [Glass Wastage]', 1),
    H(11, 'Fabrication Labour', 'AreaSqftFg', '#AREASQFT', o.fab),
    H(12, 'Installation Labour', 'AreaSqftFg', '#AREASQFT', o.inst),
    H(13, 'Sub Total including Labour', 'CustomFormula', '[Total Raw Material Cost] + [Fabrication Labour] + [Installation Labour]', 1),
    H(14, 'Profit', 'Percentage', '[Sub Total including Labour]', o.profit),
    H(15, 'DESIGN OVERHEAD', 'UserDefinedFGOverhead', '#DESIGNADDON', 1),
    H(16, 'FREEZE RATE', 'ManualPriceAutoAdjustment', '#MANUALADJUSTMENT', 1),
    H(17, 'Basic Value', 'CustomFormula', '[Sub Total including Labour] + [Profit] + [DESIGN OVERHEAD] + [FREEZE RATE]', 1, 'summary'),
    H(18, 'Discount', 'Percentage', '[Basic Value]', o.discount, 'summary'),
    H(19, 'Sub Total', 'CustomFormula', '[Basic Value] - [Discount]', 1, 'summary'),
    H(20, 'Transportation Cost', 'LumpSumDivideByArea', '#LUMPSUM', 0, 'summary'),
    H(21, 'Loading And Unloading', 'LumpSumDivideByArea', '#LUMPSUM', 0, 'summary'),
    H(22, 'Labour Charge', 'LumpSumDivideByArea', '#LUMPSUM', 0, 'summary'),
    H(23, 'Extra Charges', 'LumpSumDivideByArea', '#LUMPSUM', 0, 'summary'),
    H(24, 'Total Project Cost', 'CustomFormula', '[Sub Total] + [Transportation Cost] + [Loading And Unloading] + [Labour Charge] + [Extra Charges]', 1, 'summary'),
    H(25, 'GST', 'Percentage', '[Total Project Cost]', o.gst, 'summary'),
    H(26, 'Grand Total', 'CustomFormula', '[Total Project Cost] + [GST]', 1, 'summary'),
  ];
}

export const PRICE_STRUCTURES = [
  { name: 'Retail Projects', cost_heads: retailCostHeads() },
  { name: 'Dealer Projects', cost_heads: retailCostHeads({ profit: 8, inst: 0 }) },
  { name: 'Commercial Projects', cost_heads: retailCostHeads({ profit: 10, discount: 3 }) },
];

export const OPPORTUNITY_STAGES = ['Enquiry', 'Site Visit', 'Measurement', 'Quoted', 'Negotiation', 'Won', 'Lost'];
export const OPPORTUNITY_SOURCES = ['Reference', 'Facebook', 'Website Feedback', 'Resales', 'Dealer', 'Instagram', 'Google', 'Walk-in', 'Architect', 'Exhibition'];
export const OPPORTUNITY_CATEGORIES = ['Residential', 'Villa', 'Apartment', 'Commercial', 'Institutional', 'Renovation'];
export const LOST_REASONS = ['Price too high', 'Chose competitor', 'Project postponed', 'No response from customer', 'Went with aluminium', 'Budget constraints', 'Other'];
export const DOCUMENT_CATEGORIES = ['General', 'Site Photos', 'Drawings', 'Purchase Order', 'Measurement Sheet', 'Invoice'];

export const DESIGN_NAMES = [
  'SLIDING WINDOW', 'SL-SL-M', 'SL-SL', 'TOP FIX -SL-SL', 'SL-SL-SL-SL', 'SL-SL-SL', 'OP-OP', 'OP', 'FIX', 'FIX LUV',
  'LUV R FAN', 'LUV R FN', 'LUV L FN', 'ONLY MESH', 'VENT', 'FRENCH WINDOW', 'TILT & TURN', 'TOP HUNG', 'MONORAIL', 'BIFOLD',
];

export const DEFAULT_COMPANY = {
  name: 'TITANS WINDOWS',
  tagline: 'AUTHORISED PARTNER',
  partnerBrand: 'PROMINANCE',
  partnerTagline: 'uPVC WINDOW SYSTEMS',
  address: '100/2 MANGADU MAINROAD, MALAYAMBAKKAM, POONAMALLEE, CHENNAI 600 056',
  phone: '+91 8778623728',
  email: 'titanswindows1@gmail.com',
  gstin: '33CBZPN0233Q1Z0',
  website: 'www.evawinoptimize.com',
  quotePrefix: 'TIT-QT-',
  projectPrefix: 'TIT-CH-',
  // Images (data URLs) printed on the quotation header; uploaded from Settings.
  logo: '',
  partnerLogo: '',
  headerImage: '',
  bank: {
    accountName: 'TITANS WINDOWS',
    accountNo: '55522266674',
    bankName: 'IDFC FIRST',
    ifsc: 'IDFB0081831',
    branch: 'IYYAPPANTHANGAL',
  },
  quoteValidityDays: 30,
  letter: [
    'We are delighted that you are considering our range of Windows and Doors for your premises.',
    'It has gained rapid acceptance across all cities of India for the overwhelming advantages of better protection from noise, heat, rain, dust and pollution.',
    'In drawing this proposal, it has been our endeavor to suggest designs which would enhance your comfort and aesthetics from inside and improve the facade of the building.',
    'It has a well-established service network to deliver seamless service at your doorstep. Our offer comprises of the following in enclosure for your kind perusal:',
    'a. Window design, specification and value',
    'b. Terms and Conditions',
    'We now look forward to be of service to you.',
  ],
  // Term 1 is "Payments terms: -" followed by these sub-points.
  paymentTerms: [
    '100% Advance along with order, if it is less than Rs. 100000.',
    '60% advance along with order, 40% before delivery, if it is more than Rs. 100000.',
  ],
  // Numbered from 2. Bank details are printed after the term at index bankDetailsAfter.
  terms: [
    'Validation of quote 30 days, total execution of project should be completed latest by 3-months.',
    'P.O & Payments should made in the name of **TITANS WINDOWS.**',
    'The prices are based on the sizes provided by the customer. The prices are valid for variation in sizes up to +/- 30mm per window provided the design and style of product remains unchanged. The customer will be charged on pro-rate basis for difference between the actual sizes and given sizes, if any, beyond the above variation.',
    'After handovering the windows, cleaning not our scope.',
    'Windows security tape should be remove while installing windows freely, After installation security tape will be removed by us that should be chargeable per window Rs. 100.',
    'If any other commitments given by our sales team, before placing order please call us . Cell : +91 8778623728',
    'Material unloading & storage should be your scope.',
    'All disputes shall be subject  jurisdiction only.',
    'Amount to be transferred only to the above mentioned account and incase of cash transaction to be paid only at office premises. Company is not responsible for cash transaction outside the office premises.',
  ],
  bankDetailsAfter: 1,
  warrantyTitle: "Prominance's warranty is limited strictly to the profile against colour degradation only",
  warranty:
    'Warranty Clarification: Prominance provides warranty only on the uPVC/aluminium profile supplied by it. Prominance shall not be responsible for any issues, defects, or complaints in the windows and door Systems arising due to:',
  warrantyPoints: ['a) faulty or improper fabrication,', 'b) faulty or improper installation by the Fabricator, or', 'c) misuse or improper handling by the end customer.'],
  warrantyNote:
    "Warranty on hardware and glass used in the windows and door Systems shall be provided by the Fabricator, and not by Prominance, as Prominance's warranty is limited strictly to the profile.",
  prerequisites: [
    'Walls should be plastered from inside and outside, with inside POP complete.',
    'All jams, sills and soffits should be plastered.',
    'Flooring (where doors have to be installed) should be complete.',
    'Aperture should be smooth.',
    'Base and top of window should be water leveled and sides should be in vertical plump.',
    'Sill width should be more than the window width.',
    'Opening should be accessible from inside for installation.',
    'Grills: Adequate care should be taken if grills have to be installed.',
    'a. For **Horizontal slider Window**: Grill should be provided on the outer face of slider before the installation of the window.',
    'b. For **Casement windows**: Screw type grill is recommended after installation of casement window.',
    'Installation should happen before the last coat of paint. At least one coat of paint should be done before installation begins.',
    'Scaffoldings/ bracing should not interrupt the window openings where openings where windows are supposed to be installed.',
  ],
  acceptance: 'I hereby accept the estimate as per above mentioned price and specifications. I have read and understood the terms & conditions and agree to them.',
  brands: [
    { label: 'PROFILE', names: ['PROMINANCE'] },
    { label: 'REINFORCEMENT', names: ['JSW Steel'] },
    { label: 'HARDWARE', names: ['KIN LONG', 'SIEGENIA', 'DEKA', 'DNV', 'PTA'] },
    { label: 'SILICON', names: ['BOSS', 'McCoy SOUDAL'] },
    { label: 'GLASS', names: ['SAINT-GOBAIN', 'AIS', 'RAMSARA'] },
  ],
  notes: '',
  defaultFloorAperture: 900,
};

// Editable lookup lists (Settings → Opportunity / Payment / Glazing …).
export const DEFAULT_LOOKUPS = {
  opportunity_source: ['Reference', 'Facebook', 'Website Feedback', 'Resales', 'Dealer', 'Instagram', 'Google', 'Walk-in', 'Architect', 'Exhibition'],
  opportunity_stage: ['Enquiry', 'Site Visit', 'Measurement', 'Quoted', 'Negotiation'],
  lost_reason: ['Price too high', 'Chose competitor', 'Project postponed', 'No response from customer', 'Went with aluminium', 'Budget constraints', 'Other'],
  lost_competitor: ['Local aluminium fabricator', 'Other uPVC brand', 'Wooden windows'],
  personnel_type: ['Architect', 'Site Engineer', 'Contractor', 'Interior Designer', 'Owner', 'Consultant'],
  contact_designation: ['Owner', 'Director', 'Purchase Manager', 'Project Manager', 'Site Engineer'],
  opportunity_category: ['Residential', 'Villa', 'Apartment', 'Commercial', 'Institutional', 'Renovation'],
  account_type: ['Individual', 'Builder', 'Contractor', 'Dealer', 'Architect firm', 'Corporate'],
  tag: ['Hot lead', 'Repeat customer', 'Bulk order', 'Urgent'],
  payment_medium: ['Bank transfer (NEFT/RTGS)', 'UPI', 'Cheque', 'Cash'],
  payment_term: ['100% advance', '60% advance, 40% before delivery', '50% advance, 50% on installation'],
  business_unit: ['Chennai'],
  glazing_supplier: ['Saint-Gobain', 'AIS Glass', 'Ramsara'],
  transport_vehicle: ['Tata Ace', 'Eicher 14 ft', 'Eicher 17 ft'],
  document_category: ['General', 'Site Photos', 'Drawings', 'Purchase Order', 'Measurement Sheet', 'Invoice'],
  touchpoint_type: ['Call', 'Site visit', 'Meeting', 'WhatsApp', 'Email', 'Showroom visit'],
};

export const PERMISSIONS = [
  { key: 'settings.manage', label: 'Manage settings, users and price structures' },
  { key: 'rates.manage', label: 'Edit raw material and glass price levels' },
  { key: 'opportunity.delete', label: 'Delete opportunities' },
  { key: 'quote.manualRate', label: 'Apply manual rates and edit quote cost heads' },
  { key: 'reports.costing', label: 'View costing reports (cost summary, typology cost breakup)' },
];

export const DEFAULT_ROLES = {
  admin: Object.fromEntries(PERMISSIONS.map((p) => [p.key, true])),
  sales: { 'settings.manage': false, 'rates.manage': false, 'opportunity.delete': false, 'quote.manualRate': true, 'reports.costing': true },
};
