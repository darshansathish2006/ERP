import type { PermissionKey, User } from '../lib/types';
import type { ChapterId, RunStep, TourChapter, TourStep, TourStepContext } from './types';
import { click, clickWhenReady, ensureClosed, ensureOpen, find, openMenu, tourSel, waitFor } from './dom';

/* ------------------------------------------------------------------ helpers */

const quoteTab = (tab: string) => (ctx: TourStepContext) => (ctx.sample ? `/quote/${ctx.sample.quoteId}?tab=${tab}` : null);
const configurator = (ctx: TourStepContext) => (ctx.sample?.designId ? `/quote/${ctx.sample.quoteId}?tab=design&cfg=${ctx.sample.designId}` : null);

/** Opens a closed accordion section of the configurator's left panel; `closeSection` closes it again. */
const openSection = (slug: string) => async (ctx: TourStepContext) => {
  const el = await waitFor(tourSel(`cfg-sec-${slug}`), 6000);
  if (el && !el.classList.contains('open')) {
    el.querySelector<HTMLElement>('.cfg-acc-head')?.click();
    ctx.memo.opened = true;
  }
};
const closeSection = (slug: string) => (ctx: TourStepContext) => {
  if (!ctx.memo.opened) return;
  const el = find(tourSel(`cfg-sec-${slug}`));
  if (el?.classList.contains('open')) el.querySelector<HTMLElement>('.cfg-acc-head')?.click();
};

/** Shows a page of the Pricing tab's left menu. */
const pricingPage = (view: string) => () => clickWhenReady(tourSel(`pricing-nav-${view}`), 8000);

/* ------------------------------------------------------------------ chapters */

export const CHAPTERS: TourChapter[] = [
  {
    id: 'welcome',
    title: 'Welcome & navigation',
    summary: 'The main menu, the top bar and how to move around.',
    steps: [
      {
        id: 'hello',
        route: '/dashboard',
        title: 'Welcome to Titans ERP 👋',
        body: 'This tour shows you every page, one step at a time. Use Next and Back (or the ← → keys on your keyboard). You can stop at any time and start again from the Guide tab.',
        placement: 'center',
      },
      {
        id: 'menu',
        route: '/dashboard',
        target: 'nav-sidebar',
        placement: 'right',
        title: 'The main menu',
        body: 'This blue bar takes you to every page: Dashboard, Contacts, Opportunities, Quotes, the Guide and, at the bottom, Settings. Point at an icon to see its name.',
      },
      {
        id: 'guide',
        target: 'nav-guide',
        placement: 'right',
        title: 'The Guide tab',
        body: 'The full written guide and these tours live here. Open it whenever you are not sure how something works.',
      },
      {
        id: 'help',
        target: 'topbar-help',
        placement: 'bottom',
        title: 'Help',
        body: 'The ? button opens the Guide from any page.',
      },
      {
        id: 'page-tour',
        target: 'topbar-tour',
        placement: 'bottom',
        title: 'Tour of this page',
        body: 'The ▶ button starts a short tour of the page you are on.',
      },
      {
        id: 'apps',
        target: 'topbar-apps',
        placement: 'bottom',
        title: 'Apps',
        body: 'Shortcuts to every page, including the Rate Master and Settings.',
      },
      {
        id: 'account',
        target: 'topbar-account',
        placement: 'bottom',
        title: 'Your account',
        body: 'Open My profile to change your name, phone number or password. Log out from here too.',
      },
    ],
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    summary: 'Your sales numbers and charts at a glance.',
    steps: [
      {
        id: 'kpis',
        route: '/dashboard',
        target: 'dash-kpis',
        title: 'Your numbers at a glance',
        body: 'How many opportunities were created, newly quoted, won and lost in the chosen period, with their value in rupees.',
      },
      {
        id: 'filter',
        route: '/dashboard',
        target: 'dash-filter',
        title: 'Choose the period',
        body: 'Filter by date range (last 7 days, this month, a custom range…) and by sales executive. The ↻ button next to it reloads the figures.',
      },
      {
        id: 'analytics',
        route: '/dashboard',
        target: 'dash-analytics',
        title: 'Sales analytics and location',
        body: 'The bar chart compares created, won, lost and quoted value by week, month or year. The table beside it shows sales by city or state.',
      },
      {
        id: 'insights',
        route: '/dashboard',
        target: 'dash-insights',
        title: 'Why deals are won and lost',
        body: 'Lost reasons, where your enquiries come from (source) and the conversion from created to quoted to won.',
      },
      {
        id: 'stages',
        route: '/dashboard',
        target: 'dash-stages',
        title: 'Pipeline and teams',
        body: 'Active opportunities in each stage – click a stage to open just those opportunities. Teams of the month shows the best team and its top deal.',
      },
      {
        id: 'teams',
        route: '/dashboard',
        target: 'dash-teams',
        title: 'Team performance and smart quotes',
        body: "Each executive's created, won and lost deals, and how often customers opened the smart-quote links you shared.",
      },
    ],
  },
  {
    id: 'opportunities',
    title: 'Opportunities',
    summary: 'The list of customer enquiries: tabs, search, filters, views, row actions and touchpoints.',
    sample: true,
    steps: [
      {
        id: 'create',
        route: '/opportunity',
        target: 'opp-create',
        title: 'Create opportunity',
        body: 'Every new customer enquiry starts with this button. The next chapter walks you through the form.',
      },
      {
        id: 'tabs',
        route: '/opportunity',
        target: 'opp-tabs',
        title: 'Active, Won, Lost and All',
        body: 'Switch between open deals and closed ones. The number on each tab shows how many there are.',
      },
      {
        id: 'row',
        route: '/opportunity',
        target: 'opp-row',
        title: 'One row per project',
        body: 'Each row is one customer project. Click a row to open its quote. The sample project made for this tour is at the top.',
      },
      {
        id: 'row-actions',
        route: '/opportunity',
        selector: '.menu',
        before: () => openMenu(`${tourSel('opp-row-actions')} button`, 8000),
        title: 'Row actions (⋮)',
        body: 'Open the quote, log a touchpoint, edit the details, mark as won or lost (with a reason), reopen, or delete. Deleting needs permission.',
      },
      {
        id: 'touchpoint',
        route: '/opportunity',
        target: 'opp-touchpoint',
        title: 'Touchpoints',
        body: 'This number counts the calls, site visits and meetings logged for the customer. Click it to see them or add a new one.',
      },
      {
        id: 'touchpoint-log',
        route: '/opportunity',
        target: 'touchpoint-form',
        selector: '.drawer',
        keep: ['drawer'],
        before: () => ensureOpen(tourSel('opp-touchpoint'), '.drawer', 8000),
        title: 'Log a touchpoint',
        body: 'Pick the type (call, site visit, WhatsApp…), when it happened and a short note, then press Log touchpoint. Earlier touchpoints are listed below.',
      },
      {
        id: 'touchpoint-edit',
        route: '/opportunity',
        target: 'touchpoint-edit',
        selector: '.drawer .touch-item',
        keep: ['drawer'],
        before: () => ensureOpen(tourSel('opp-touchpoint'), '.drawer', 8000),
        title: 'Change or remove a touchpoint',
        body: 'Made a mistake? Use the edit or delete buttons next to a touchpoint.',
      },
      {
        id: 'views',
        route: '/opportunity',
        target: 'views-menu',
        title: 'Views',
        body: 'Switch between Default View, My opportunities, Quoted and Not yet quoted. "Create custom view" saves your current tab, filters, sort and columns to use again later.',
      },
      {
        id: 'search',
        route: '/opportunity',
        target: 'opp-search',
        title: 'Search',
        body: 'Type a customer name, phone number, project code or city.',
      },
      {
        id: 'range',
        route: '/opportunity',
        target: 'opp-range',
        title: 'Date range and "only mine"',
        body: 'The list shows the last 90 days. Can\'t find an older enquiry? Choose All time. The round button with your initials shows only the opportunities you manage.',
      },
      {
        id: 'filter',
        route: '/opportunity',
        target: 'opp-filter',
        title: 'Filter and sort',
        body: 'Filter by city, stage, source, managed by or category, and sort by date, name or value with Sort by.',
      },
      {
        id: 'columns',
        route: '/opportunity',
        target: 'opp-columns',
        title: 'Columns and layout',
        body: 'Choose which columns to show. The list / grid switch in the toolbar changes how the rows look.',
      },
    ],
  },
  {
    id: 'create-opportunity',
    title: 'Creating an opportunity',
    summary: 'The two-step form: required fields, city, site location and saving.',
    steps: [
      {
        id: 'steps',
        route: '/opportunity/create',
        target: 'oppform-steps',
        title: 'Two short steps',
        body: 'Basic info has 5 required fields and Official info has 3. Required fields have a red *. Nothing is saved during this tour.',
      },
      {
        id: 'basic',
        route: '/opportunity/create',
        target: 'oppform-basic',
        title: 'Basic details',
        body: "Type the project name, the customer's first name and phone number. Last name, email and note are optional.",
      },
      {
        id: 'address',
        route: '/opportunity/create',
        target: 'oppform-address',
        title: 'Site address',
        body: 'Choose the City and the State fills itself in. City not in the list? Type its name and pick "Create City".',
      },
      {
        id: 'map',
        route: '/opportunity/create',
        target: 'oppform-map',
        title: 'Site location',
        body: 'Search for the site or click on the map to drop a pin. The map needs an internet connection.',
      },
      {
        id: 'next',
        route: '/opportunity/create',
        target: 'oppform-next',
        title: 'Next, then save',
        body: 'Next checks the fields and opens Official info: Managed by, Opportunity stage and Opportunity source. "Save and create quote" then saves it and opens the new quote.',
      },
    ],
  },
  {
    id: 'quote',
    title: 'Quote page',
    summary: 'The quote header: revisions, cart value, Quick quote and the four tabs.',
    sample: true,
    steps: [
      {
        id: 'title',
        route: quoteTab('design'),
        target: 'quote-title',
        title: 'The quote page',
        body: 'This is the sample project made for the tour. The name, project code and quote number are shown here – click them to edit the opportunity.',
      },
      {
        id: 'revisions',
        route: quoteTab('design'),
        target: 'quote-revisions',
        title: 'Revisions',
        body: 'A revision is a copy of the quote you can change, for example in another colour. Switch revisions here, create a new one, or choose which one is the default quote.',
      },
      {
        id: 'cart',
        route: quoteTab('design'),
        target: 'quote-cart',
        title: 'Quote value',
        body: 'The grand total and the number of windows. Click it to see the price of every design.',
      },
      {
        id: 'quick',
        route: quoteTab('design'),
        target: 'quote-quick',
        title: 'Quick quote',
        body: 'Opens the printable quotation. The ▾ arrow has more: smart-quote link for the customer, download reports, create revision, edit, and mark as won or lost.',
      },
      {
        id: 'tabs',
        route: quoteTab('design'),
        target: 'quote-tabs',
        title: 'Four tabs',
        body: 'Documents for files, Design for the windows, Pricing for the costs and Report for PDFs and Excel sheets.',
      },
      {
        id: 'documents',
        route: quoteTab('documents'),
        target: 'docs-upload',
        title: 'Documents',
        body: 'Keep site photos, drawings, purchase orders and measurement sheets with the quote. Choose a category, then drag files here or press Browse files.',
      },
    ],
  },
  {
    id: 'designs',
    title: 'Designs & the window configurator',
    summary: 'Adding windows, library designs, design cards and every part of the configurator.',
    sample: true,
    steps: [
      {
        id: 'create',
        route: quoteTab('design'),
        target: 'design-create',
        title: 'Create design',
        body: 'Opens the window configurator so you can draw a new window.',
      },
      {
        id: 'library',
        route: quoteTab('design'),
        target: 'design-library',
        title: 'Library designs',
        body: 'Ready-made windows. Picking one adds it to this quote and opens it in the configurator.',
      },
      {
        id: 'library-open',
        route: quoteTab('design'),
        target: 'quote-library',
        selector: '.drawer',
        keep: ['drawer'],
        before: () => ensureOpen(tourSel('design-library'), '.drawer', 8000),
        title: 'Choose from the library',
        body: 'Search or filter by system, then press Select design under the one you want. We will not add anything now.',
      },
      {
        id: 'global',
        route: quoteTab('design'),
        target: 'design-global',
        title: 'Global edits and project defaults',
        body: 'Change the colour, glass, system, quantity or location of all (or only the ticked) designs at once. Project defaults sets what new designs start with.',
      },
      {
        id: 'tools',
        route: quoteTab('design'),
        target: 'design-refresh',
        title: 'Refresh, order and filter',
        body: "Refresh designs re-prices every window with today's rates. Design orders changes the order on the quotation. Filter and the list / grid switch help in big projects.",
      },
      {
        id: 'card',
        route: quoteTab('design'),
        target: 'design-card',
        title: 'A design card',
        body: 'Shows the window ref, a drawing, quantity, location, system, glass, colour and price. Tick the box to select several designs for bulk edit or delete.',
      },
      {
        id: 'card-menu',
        route: quoteTab('design'),
        selector: '.menu',
        before: () => openMenu(tourSel('design-card-menu'), 8000),
        title: 'Design actions (⋮)',
        body: 'Edit, view details, duplicate, save to the library for reuse, or delete.',
      },
      {
        id: 'details',
        route: quoteTab('design'),
        selector: '.drawer',
        before: () => ensureOpen(tourSel('design-details'), '.drawer', 8000),
        title: 'Design details',
        body: 'The cost summary, bill of materials and cutting list of one window.',
      },
      {
        id: 'cfg-canvas',
        route: configurator,
        target: 'cfg-canvas',
        timeout: 10000,
        title: 'The window configurator',
        body: 'This is the drawing board. Click a panel to select it, use the mouse wheel to zoom and drag the background to move around.',
      },
      {
        id: 'cfg-basic',
        route: configurator,
        target: 'cfg-sec-basic-info',
        placement: 'right',
        title: 'Basic info',
        body: 'Design ref (W1, W2…), quantity, name, location and floor. You can type the width and height here too.',
      },
      {
        id: 'cfg-finish',
        route: configurator,
        target: 'cfg-sec-surface-finish',
        placement: 'right',
        before: openSection('surface-finish'),
        after: closeSection('surface-finish'),
        title: 'Surface finish',
        body: 'The inside and outside colour. Laminated (wood-look) colours use brown hardware automatically; white windows use white hardware.',
      },
      {
        id: 'cfg-framing',
        route: configurator,
        target: 'cfg-sec-framing',
        placement: 'right',
        before: openSection('framing'),
        after: closeSection('framing'),
        title: 'Framing',
        body: 'The profile system and the frame, mullion and guide-rail profiles it uses.',
      },
      {
        id: 'cfg-sash',
        route: configurator,
        target: 'cfg-sec-sash',
        placement: 'right',
        before: openSection('sash'),
        after: closeSection('sash'),
        title: 'Sash',
        body: 'The sash and interlock profiles of the opening panels, the handle colour and the insect-mesh option.',
      },
      {
        id: 'cfg-glazing',
        route: configurator,
        target: 'cfg-sec-glazing-item',
        placement: 'right',
        before: openSection('glazing-item'),
        after: closeSection('glazing-item'),
        title: 'Glazing Item',
        body: 'Choose the glass for all panels, or only for the panel you selected. The picture button in the tool strip opens this section too.',
      },
      {
        id: 'cfg-bead',
        route: configurator,
        target: 'cfg-sec-bead',
        placement: 'right',
        before: openSection('bead'),
        after: closeSection('bead'),
        title: 'Bead',
        body: 'The bead holds the glass in place. It is picked automatically for the glass thickness.',
      },
      {
        id: 'cfg-toolbar',
        route: configurator,
        target: 'cfg-toolbar',
        placement: 'bottom',
        title: 'Undo, Redo, Clear, Fit and Grid',
        body: 'Undo and Redo your changes (Ctrl+Z / Ctrl+Y). Clear empties the drawing after asking you. Fit centres the drawing and Grid shows the background grid.',
      },
      {
        id: 'cfg-divider',
        route: configurator,
        target: 'cfg-divider-flyout',
        placement: 'right',
        before: () => ensureOpen(tourSel('cfg-tool-divider'), tourSel('cfg-divider-flyout'), 8000),
        after: () => ensureClosed(tourSel('cfg-tool-divider'), tourSel('cfg-divider-flyout')),
        title: 'Divider',
        body: 'Splits the selected panel into 2, 3 or more parts with mullions. Then choose Mullion or Glass equalization to size the parts.',
      },
      {
        id: 'cfg-designs',
        route: configurator,
        target: 'cfg-designs-flyout',
        placement: 'right',
        before: () => ensureOpen(tourSel('cfg-tool-designs'), tourSel('cfg-designs-flyout'), 8000),
        after: () => ensureClosed(tourSel('cfg-tool-designs'), tourSel('cfg-designs-flyout')),
        title: 'Designs',
        body: '50+ window types – openable, tilt & turn, sliding, bifold and more – plus add-ons like louvers, mesh, Georgian bars and safety grills. Select a panel first, then click a design.',
      },
      {
        id: 'cfg-system',
        route: configurator,
        selector: '.drawer',
        before: () => ensureOpen(tourSel('cfg-tool-system'), '.drawer', 8000),
        title: 'Profile system',
        body: 'Choose the brand and the series. Sliding designs need a sliding system, and the size limits of each system are shown.',
      },
      {
        id: 'cfg-colours',
        route: configurator,
        selector: '.drawer',
        before: () => ensureOpen(tourSel('cfg-tool-colours'), '.drawer', 8000),
        title: 'Colours',
        body: 'Pick the inside / outside colour combination, then press Confirm.',
      },
      {
        id: 'cfg-dims',
        route: configurator,
        target: 'cfg-dim',
        padding: 8,
        title: 'Change a size',
        body: 'Click any measurement on the drawing and type the new size in mm. Click the Floor label to set the floor aperture distance.',
      },
      {
        id: 'cfg-views',
        route: configurator,
        target: 'cfg-views',
        placement: 'left',
        before: async () => {
          if (!find('.cfg-views .cfg-view-btn.active')) await clickWhenReady(tourSel('cfg-view-3d'), 6000);
        },
        after: () => {
          find('.cfg-views .cfg-view-btn.active')?.click();
        },
        title: '3D, Section and Wall views',
        body: 'See the window in 3D, cut through it to see the profile chambers (Section), or see it in a wall. Click the same button again to go back to the drawing.',
      },
      {
        id: 'cfg-inout',
        route: configurator,
        target: 'cfg-viewtoggle',
        title: 'Inside or outside',
        body: 'Look at the window from inside or from outside – handy when the two colours are different.',
      },
      {
        id: 'cfg-price',
        route: configurator,
        target: 'cfg-price',
        title: 'Live price',
        body: 'The price of one window updates as you make changes. Click it for the design summary.',
      },
      {
        id: 'cfg-summary',
        route: configurator,
        selector: '.drawer',
        before: () => ensureOpen(tourSel('cfg-summary-btn'), '.drawer', 8000),
        title: 'Design summary',
        body: 'Size, area, system, colour, glass, shutter weight, the price breakdown and the bill of materials of this window.',
      },
      {
        id: 'cfg-save',
        route: configurator,
        target: 'cfg-save',
        placement: 'bottom',
        title: 'Save Design',
        body: 'Saves the window (Ctrl+S). The ▾ arrow has Save & close, Save as new design and Save to library designs. The ⚠ button next to it lists anything that needs fixing.',
      },
      {
        id: 'cfg-close',
        route: configurator,
        target: 'cfg-close',
        placement: 'bottom',
        title: 'Close the configurator',
        body: 'Closes the configurator and goes back to the Design tab. If something is not saved, it asks you first.',
      },
    ],
  },
  {
    id: 'pricing',
    title: 'Pricing',
    summary: 'Price structure, cost heads, price levels, rate changes, add-ons and manual rates.',
    sample: true,
    steps: [
      {
        id: 'menu',
        route: quoteTab('pricing'),
        target: 'pricing-nav',
        placement: 'right',
        before: pricingPage('structure'),
        title: 'The pricing menu',
        body: 'Project Price Structure shows how the price is built. The other pages let you change rates and add costs for this quote only.',
      },
      {
        id: 'structure',
        route: quoteTab('pricing'),
        target: 'pricing-structure',
        before: pricingPage('structure'),
        title: 'Price structure',
        body: 'The set of cost heads this quote uses, for example Retail Projects. You can switch to another structure here.',
      },
      {
        id: 'table',
        route: quoteTab('pricing'),
        target: 'pricing-table',
        before: pricingPage('structure'),
        title: 'Cost heads',
        body: 'The price is built line by line: materials and wastage, labour, profit, add-ons, Basic Value, discount, transport and other charges, GST and finally the Grand Total. The switch in the header shows each formula.',
      },
      {
        id: 'modify',
        route: quoteTab('pricing'),
        selector: '.menu',
        perm: 'quote.manualRate',
        before: async () => {
          await pricingPage('structure')();
          await openMenu(`${tourSel('pricing-head-actions')} button`, 8000);
        },
        title: 'Modify a cost head (⋮)',
        body: 'Change a rate (for example Labour Charge or Discount %), show or hide it on the quotation, add a remark, edit the formula, move it or delete it.',
      },
      {
        id: 'add-head',
        route: quoteTab('pricing'),
        target: 'costhead-add',
        before: pricingPage('structure'),
        title: 'Add your own cost head',
        body: 'Add an extra charge with its cost to this quote, for example crane hire or site cleaning.',
      },
      {
        id: 'update',
        route: quoteTab('pricing'),
        target: 'pricing-update',
        before: pricingPage('structure'),
        title: 'Update Pricing',
        body: 'Recalculates the whole quote with the latest rates.',
      },
      {
        id: 'summary',
        route: quoteTab('pricing'),
        target: 'pricing-summary',
        placement: 'left',
        before: pricingPage('structure'),
        title: 'Price Summary',
        body: 'The green card shows what the customer sees: Basic Value, discount, extra charges, GST and Grand Total, plus the total area and rate per sqft.',
      },
      {
        id: 'level',
        route: quoteTab('pricing'),
        target: 'rate-level',
        before: pricingPage('profile'),
        title: 'Rate pages and price levels',
        body: 'Profile, Reinforcement, Hardware, Glass and Mesh Rate list the items used in this quote. Pick a price level here, for example Default Profile Rate or 25% Discounted Price.',
      },
      {
        id: 'rates',
        route: quoteTab('pricing'),
        target: 'rate-table',
        before: pricingPage('profile'),
        title: 'Change a rate for this quote',
        body: 'Type a new rate and press Save – it changes this quote only. Edited rows get an orange badge, and ↺ puts back the price-level rate.',
      },
      {
        id: 'rate-add',
        route: quoteTab('pricing'),
        target: 'rate-add-entry',
        before: pricingPage('profile'),
        title: 'Add an entry with its cost',
        body: 'Add an extra item with its rate to this page, for example a special handle the customer asked for.',
      },
      {
        id: 'addons',
        route: quoteTab('pricing'),
        target: 'addon-table',
        before: pricingPage('addons'),
        title: 'Design add-on cost heads',
        body: 'Extra charges for one window – grill work, scaffolding, custom colour… – per window or per sqft. They are added after profit as DESIGN OVERHEAD.',
      },
      {
        id: 'manual',
        route: quoteTab('pricing'),
        target: 'manual-table',
        before: pricingPage('manual'),
        title: 'Design manual rate',
        body: 'Switch a design from Actual to Manual and type your own SQFT rate or basic price. The difference shows as FREEZE RATE so the totals stay correct.',
      },
      {
        id: 'manual-single',
        route: quoteTab('pricing'),
        target: 'manual-rate-single',
        perm: 'quote.manualRate',
        before: pricingPage('manual'),
        title: 'One rate for many windows',
        body: 'Apply a single SQFT rate to all designs, or to one system type or system name. Then press Save.',
      },
    ],
  },
  {
    id: 'reports',
    title: 'Reports & PDF',
    summary: 'Report categories, viewing, PDF and Excel downloads, favourites.',
    sample: true,
    steps: [
      {
        id: 'categories',
        route: quoteTab('report'),
        target: 'report-categories',
        placement: 'right',
        title: 'Report categories',
        body: 'Favourite Reports first, then Project Basic Details, Quotation & Costing, Material Purchase Orders, Production Reports and Dispatch & Installation.',
      },
      {
        id: 'search',
        route: quoteTab('report'),
        target: 'report-search',
        title: 'Find a report',
        body: 'Type part of a report name, for example BOQ or Challan.',
      },
      {
        id: 'card',
        route: quoteTab('report'),
        target: 'report-card',
        title: 'A report',
        body: 'Each card is one report. Tick the box to select it for downloading several at once.',
      },
      {
        id: 'view',
        route: quoteTab('report'),
        target: 'report-view',
        title: 'View or print',
        body: 'Opens the report in a new browser tab, where you can zoom, Print, Download PDF and – for tables – Download Excel.',
      },
      {
        id: 'download',
        route: quoteTab('report'),
        target: 'report-download',
        title: 'Download PDF',
        body: 'Saves the report as a PDF straight away. If an item has a ₹0 rate or a design has a manual rate, you are warned first.',
      },
      {
        id: 'menu',
        route: quoteTab('report'),
        selector: '.menu',
        before: () => openMenu(tourSel('report-card-menu'), 8000),
        title: 'More (⋮)',
        body: 'Add the report to Favourite Reports (or remove it), download it as Excel, or copy a link to it.',
      },
      {
        id: 'select',
        route: quoteTab('report'),
        target: 'report-selbar',
        before: async () => {
          if (!find(tourSel('report-selbar'))) await clickWhenReady(`${tourSel('report-card')} input[type="checkbox"]`, 8000);
        },
        after: () => {
          click(`${tourSel('report-selbar')} .btn-ghost`);
        },
        title: 'Download many at once',
        body: 'When reports are ticked, this bar downloads them all as PDF, or the table reports as Excel. Clear selection un-ticks them.',
      },
      {
        id: 'filter',
        route: quoteTab('report'),
        target: 'report-filter',
        placement: 'left',
        title: 'Filter report',
        body: 'Another way to download: pick PDF or Excel and the report from a list, then press View or Download.',
      },
    ],
  },
  {
    id: 'quotes',
    title: 'Quotes list',
    summary: 'All quotes with their revisions.',
    sample: true,
    steps: [
      {
        id: 'table',
        route: '/quotes',
        target: 'quotes-table',
        title: 'All quotes',
        body: 'One row per opportunity with its default quote, revision, area, quantity and value. Projects with revisions have a ▸ arrow – click it to see every revision.',
      },
      {
        id: 'actions',
        route: '/quotes',
        selector: '.menu',
        before: () => openMenu(`${tourSel('quotes-row-actions')} button`, 8000),
        title: 'Quote actions (⋮)',
        body: 'Open the quote, view the quotation, create a revision, or make this quote the default one.',
      },
      {
        id: 'toolbar',
        route: '/quotes',
        target: 'quotes-toolbar',
        title: 'Find quotes',
        body: 'The same tools as Opportunities: views, search, date range, only mine, filter and sort.',
      },
      {
        id: 'create',
        route: '/quotes',
        target: 'quotes-create',
        title: 'Create quote',
        body: 'A quote always belongs to an opportunity, so this opens the Create opportunity form first.',
      },
    ],
  },
  {
    id: 'contacts',
    title: 'Contacts',
    summary: 'Your customers: search, add, edit and remove contacts.',
    sample: true,
    steps: [
      {
        id: 'table',
        route: '/contacts',
        target: 'contacts-table',
        title: 'Contacts',
        body: 'Contacts you added and the customers from your opportunities, with how many deals they have and how many were won. Click a contact to edit it.',
      },
      {
        id: 'search',
        route: '/contacts',
        target: 'contacts-toolbar',
        title: 'Search',
        body: 'Find a customer by name, phone, email, city or company.',
      },
      {
        id: 'add',
        route: '/contacts',
        target: 'contacts-add',
        title: 'Add a contact',
        body: 'Save a new customer with their phone, email, company and address – even before there is an opportunity.',
      },
      {
        id: 'actions',
        route: '/contacts',
        selector: '.menu',
        before: () => openMenu(tourSel('contacts-actions'), 8000),
        title: 'Contact actions (⋮)',
        body: 'Edit the contact, open their latest opportunity, or delete a contact you added yourself.',
      },
    ],
  },
  {
    id: 'rate-master',
    title: 'Rate master',
    summary: 'Base rates of profiles, hardware, glass, colours, systems and library designs.',
    steps: [
      {
        id: 'tabs',
        route: '/masters',
        selector: '.adm-rm .adm-tabs',
        title: 'Rate master',
        body: 'The base rates used to price every window: profiles, aluminium, reinforcement, hardware, glass & mesh, colours, systems and library designs.',
      },
      {
        id: 'items',
        route: '/masters',
        target: 'masters-items',
        title: 'Base rates',
        body: 'Each item has a rate, and coloured profiles also have a laminated rate. Change a rate and press Save. Only users with the price permission can edit.',
      },
      {
        id: 'add-item',
        route: '/masters',
        target: 'masters-add-item',
        perm: 'rates.manage',
        title: 'Add an item',
        body: 'Add a new profile, hardware or other item with its code, unit and rate.',
      },
      {
        id: 'systems',
        route: '/masters?tab=systems',
        target: ['masters-add-system', 'masters-systems'],
        title: 'Profile systems',
        body: 'Each system lists the profiles it uses for the frame, sash, mullion and so on.',
      },
      {
        id: 'library',
        route: '/masters?tab=library',
        target: 'masters-library',
        title: 'Library designs',
        body: 'Windows saved for reuse in any quote. Add one from a quote with "Save to library".',
      },
    ],
  },
  {
    id: 'settings',
    title: 'Settings',
    summary: 'Search, favourites, price levels, price structure, users and roles, company profile and quotation terms.',
    perm: 'settings.manage',
    steps: [
      {
        id: 'nav',
        route: '/settings?section=roles',
        target: 'settings-nav',
        placement: 'right',
        title: 'Settings categories',
        body: 'Settings are grouped: roles, users, locations, raw material pricing, glazing, price & calculation, payment, opportunity lists, transport, import, raw materials and other.',
      },
      {
        id: 'search',
        route: '/settings?section=roles',
        target: 'settings-head',
        title: 'Search settings',
        body: 'Type a word like price, stage or bank to find the right page quickly.',
      },
      {
        id: 'favourites',
        route: '/settings?section=roles',
        target: 'settings-fav',
        title: 'Favourites',
        body: 'Click the ☆ on any card to keep that page under Favourite Settings.',
      },
      {
        id: 'levels',
        route: '/settings?page=profile-price',
        target: 'settings-levels',
        placement: 'right',
        title: 'Price levels',
        body: 'A price level is a full price list, for example 25% Discounted Price. Add one (starting from the default ± a %), edit the prices and Save. Each quote picks a level on its rate pages.',
      },
      {
        id: 'structure',
        route: '/settings?page=price-structure',
        target: 'settings-ps-heads',
        title: 'Price structure',
        body: 'The cost heads used to calculate every quote: rates, formulas and what shows on the quotation. Tick "Set as default" to use it for new quotes.',
      },
      {
        id: 'users',
        route: '/settings?page=users',
        target: 'settings-users-add',
        title: 'Users',
        body: 'Add a user with a name, email (their login ID), password and role. New users see this tour the first time they log in.',
      },
      {
        id: 'roles',
        route: '/settings?page=roles',
        target: 'settings-roles',
        title: 'Roles & permissions',
        body: 'Tick what each role may do: change settings, edit price levels, delete opportunities, use manual rates and see costing reports.',
      },
      {
        id: 'company',
        route: '/settings?page=company-profile',
        target: 'settings-company-images',
        title: 'Company profile and logos',
        body: 'Upload your company logo, the partner brand logo and the quotation header image, and keep the address, GSTIN and bank details up to date.',
      },
      {
        id: 'terms',
        route: '/settings?page=quotation-terms',
        target: 'settings-terms',
        title: 'Quotation terms',
        body: 'Edit the covering letter, payment terms, terms & conditions, warranty, site prerequisites and brands printed on the quotation.',
      },
      {
        id: 'lists',
        route: '/settings?section=opportunity',
        target: 'settings-cards',
        title: 'Your own lists',
        body: 'Add the sources, stages, lost reasons, tags, touchpoint types and other choices that appear in drop-downs across the app.',
      },
    ],
  },
  {
    id: 'guide',
    title: 'Guide & help',
    summary: 'Where to find this guide and the tours again.',
    steps: [
      {
        id: 'start',
        route: '/guide',
        target: 'guide-start',
        title: 'Start the full tour',
        body: 'Runs this tour again from the beginning.',
      },
      {
        id: 'toc',
        route: '/guide',
        target: 'guide-toc',
        placement: 'right',
        title: 'Chapters',
        body: 'Jump to any part of the guide. A ✓ means you have finished the tour of that chapter.',
      },
      {
        id: 'search',
        route: '/guide',
        target: 'guide-search',
        title: 'Search the guide',
        body: 'Type a word such as GST, revision or logo to find the help you need.',
      },
      {
        id: 'show-me',
        route: '/guide',
        target: 'guide-chapter-tour',
        title: 'Show me',
        body: 'Each chapter has its own short tour. Press "Show me" to see just that part.',
      },
      {
        id: 'faq',
        route: '/guide',
        target: 'guide-faq',
        title: 'Questions & answers',
        body: 'How prices are worked out, revisions, manual rates, laminated colours, smart-quote links, permissions, logos and passwords.',
      },
      {
        id: 'done',
        route: '/guide',
        placement: 'center',
        title: "You're all set! 🎉",
        body: 'That is the whole app. The sample project is removed when you press Finish. Press ? at the top any time you need help.',
      },
    ],
  },
];

/* ------------------------------------------------------------------ selection */

const can = (user: User, perm?: PermissionKey) => !perm || !!user.permissions?.[perm];

/** Chapters (and their steps) this user may see. */
export function visibleChapters(user: User): TourChapter[] {
  return CHAPTERS.filter((c) => can(user, c.perm))
    .map((c) => ({ ...c, steps: c.steps.filter((s) => can(user, s.perm)) }))
    .filter((c) => c.steps.length > 0);
}

export function flattenChapters(chapters: TourChapter[]): RunStep[] {
  return chapters.flatMap((c) =>
    c.steps.map<RunStep>((s: TourStep, i) => ({
      ...s,
      sample: s.sample || c.sample,
      chapterId: c.id,
      chapterTitle: c.title,
      chapterStep: i + 1,
      chapterSize: c.steps.length,
      chapterEnd: i === c.steps.length - 1,
    })),
  );
}

/** The chapter that explains the page at this address (used by the ▶ button). */
export function chapterForLocation(pathname: string, search: string): ChapterId | null {
  const params = new URLSearchParams(search);
  if (pathname.startsWith('/dashboard')) return 'dashboard';
  if (pathname === '/opportunity/create' || /^\/opportunity\/\d+\/edit/.test(pathname)) return 'create-opportunity';
  if (pathname.startsWith('/opportunity')) return 'opportunities';
  if (pathname.startsWith('/quotes')) return 'quotes';
  if (pathname.startsWith('/quote/')) {
    const tab = params.get('tab');
    if (tab === 'pricing') return 'pricing';
    if (tab === 'report') return 'reports';
    if (tab === 'documents') return 'quote';
    return params.get('cfg') ? 'designs' : 'quote';
  }
  if (pathname.startsWith('/contacts')) return 'contacts';
  if (pathname.startsWith('/masters')) return 'rate-master';
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/guide')) return 'guide';
  return null;
}
