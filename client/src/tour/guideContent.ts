import type { ChapterId } from './types';

/**
 * The written user guide shown on the Guide page. Plain data so it can be searched.
 * `**text**` is shown in bold. Keep the wording simple – the readers are shop staff, not IT people.
 */

export interface GuideTopic {
  id: string;
  title: string;
  /** What it is for. */
  what: string;
  /** Numbered step-by-step instructions. */
  steps?: string[];
  tips?: string[];
  mistakes?: string[];
}

export interface GuideSection {
  /** Matches the tour chapter of the same id ("Show me" runs it). */
  id: ChapterId;
  title: string;
  /** Where to find it in the app. */
  where: string;
  intro: string;
  topics: GuideTopic[];
}

export interface FaqItem {
  id: string;
  q: string;
  /** Paragraphs; lines starting with "• " are shown as a bullet list, "1. " as numbered steps. */
  a: string[];
}

export const GUIDE: GuideSection[] = [
  {
    id: 'welcome',
    title: 'Getting around',
    where: 'Every page',
    intro: 'Titans ERP is where you record customer enquiries, draw their windows, work out the price and send the quotation. Everything is reached from the blue menu on the left and the small buttons at the top right.',
    topics: [
      {
        id: 'menu',
        title: 'The main menu',
        what: 'The blue bar on the left of every page. Each icon opens one page.',
        steps: [
          '**Dashboard** – your sales numbers and charts.',
          '**Contacts** – every customer from your opportunities.',
          '**Opportunities** – customer enquiries. Most work starts here.',
          '**Quotes** – every quotation and its revisions.',
          '**Guide** – this guide and the guided tours.',
          '**Settings** (the gear at the bottom) – company details, users, price lists and drop-down lists.',
        ],
        tips: ['Point at an icon and wait a moment to see its name.'],
      },
      {
        id: 'topbar',
        title: 'The top bar',
        what: 'The buttons at the top right of every page.',
        steps: [
          '**?** opens this Guide.',
          '**▶** starts a short tour of the page you are on.',
          '**Apps** (the grid of dots) has shortcuts to every page, including the **Rate Master**.',
          'Your **initials** open the account menu: My profile, Settings, Guide and Logout.',
        ],
      },
      {
        id: 'login',
        title: 'Logging in and out',
        what: 'Your login ID is your email address.',
        steps: [
          'Type your email and password on the login page and press **Login**.',
          'Tick **Keep me signed in** on your own computer so you stay logged in for 30 days. Without it you are logged out after 12 hours.',
          'To log out, click your initials at the top right and choose **Logout**.',
        ],
        mistakes: ['Ticking "Keep me signed in" on a shared computer – anyone using it can then open your account.'],
      },
    ],
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    where: 'Left menu → Dashboard',
    intro: 'A quick picture of how sales are going. Nothing can be changed here – it only shows figures from your opportunities and quotes.',
    topics: [
      {
        id: 'cards',
        title: 'Number cards and filter',
        what: 'The four cards at the top count the opportunities that were created, newly quoted, won and lost in the chosen period, with their value.',
        steps: [
          'Press **Filter** at the top right.',
          'Choose a **Date range** (for example Last 30 days, This month or Custom range) and, if you like, one person under **Managed by**.',
          'Press **Apply**. The whole dashboard updates. To go back, press **Reset** (last 30 days, all executives) and then **Apply**.',
          'Press the **↻** button to reload the figures.',
        ],
        tips: ['The line under the "Dashboard" title always tells you which period and executive you are looking at.'],
      },
      {
        id: 'charts',
        title: 'Charts and tables',
        what: 'Each panel answers one question about your sales.',
        steps: [
          '**Sales analytics** – created, won, lost and quoted value. Switch between Weekly, Monthly and Yearly in its corner.',
          '**Sales location** – value by City or State.',
          '**Lost opportunity reasons**, **Opportunity source** and **Opportunity Conversion Analytics** (created → quoted → won).',
          '**All active opportunities in various stages** – click a stage to open the Opportunities list filtered to that stage.',
          '**Teams of the month** and **Teams Performance** – how each team and executive is doing.',
          '**Smart quote analytics** – how many smart-quote links were made and how often customers opened them. Click a row to open that quote.',
        ],
      },
    ],
  },
  {
    id: 'opportunities',
    title: 'Opportunities',
    where: 'Left menu → Opportunities',
    intro: 'An opportunity is one customer enquiry or project. It holds the customer details, and every opportunity gets its own quote.',
    topics: [
      {
        id: 'list',
        title: 'Finding an opportunity',
        what: 'The list shows one row per project with the contact, phone, location, value, deal stage and more.',
        steps: [
          'Use the tabs **Active**, **Won**, **Lost** or **All**.',
          'Type in the search box – a name, phone number, project code or city.',
          'Change the date range button (it shows **Last 90 days** at first) if the enquiry is older.',
          'Press **Filter** to narrow by city, stage, source, managed by or category, and **Sort by** to change the order.',
          'Click the row to open its quote.',
        ],
        tips: [
          'Click the round button with your initials to see only the opportunities you manage.',
          'The list / grid switch shows the opportunities as rows or as cards.',
          'The column button at the right end of the header lets you show or hide columns. **Reset to default** brings back the normal set.',
        ],
        mistakes: ['Not finding an old enquiry because the date range is still "Last 90 days". Choose **All time**.'],
      },
      {
        id: 'views',
        title: 'Saved views',
        what: 'A view remembers a tab, date range, filters, sort and columns so you can get back to them with one click.',
        steps: [
          'Set the list up the way you like (tab, filters, columns…).',
          'Press **Create custom view**, type a name and press **Save view**.',
          'Pick the view later from the **Default View ▾** button. Your views are listed under "My views".',
          'To delete a view, open the same menu and click the bin next to it.',
        ],
        tips: ['Built-in views: Default View, My opportunities, Quoted opportunities and Not yet quoted.'],
      },
      {
        id: 'actions',
        title: 'Row actions: won, lost, edit, delete',
        what: 'The ⋮ button at the start of each row has everything you can do with an opportunity.',
        steps: [
          'Click **⋮** on the row.',
          'Choose **Open quote**, **Log touchpoint**, **Edit opportunity**, **Mark as won**, **Mark as lost**, **Reopen opportunity** or **Delete**.',
          'For **Mark as lost**, choose the reason (it appears on the Dashboard). If you pick "Other", type the reason.',
        ],
        tips: ['A won or lost opportunity moves to the Won or Lost tab. Use **Reopen opportunity** to make it active again.'],
        mistakes: ['Deleting removes the quotes, designs and documents too and cannot be undone. Only roles with the "Delete opportunities" permission can do it.'],
      },
      {
        id: 'touchpoints',
        title: 'Touchpoints (calls, visits, meetings)',
        what: 'A touchpoint is a record of a contact with the customer – a call, site visit, meeting, WhatsApp and so on. The list shows how many there are and when the customer was last contacted.',
        steps: [
          'Click the number in the **Touchpoint** column (or ⋮ → Log touchpoint).',
          'Choose the **Type**, check the **Contacted on** date and time, and write a short **Note**.',
          'Press **Log touchpoint**. It appears in the history below.',
          'To change or remove one, use the buttons next to it in the history.',
        ],
        mistakes: ['The contacted time cannot be in the future.'],
      },
    ],
  },
  {
    id: 'create-opportunity',
    title: 'Creating an opportunity',
    where: 'Opportunities → Create opportunity (also Quotes → Create quote)',
    intro: 'The form has two steps. Fields with a red * must be filled. When you save, the opportunity and its first quote are created and the quote opens.',
    topics: [
      {
        id: 'basic',
        title: 'Step 1 – Basic info',
        what: 'The customer and the site.',
        steps: [
          'Type the **Project name** (for example "Ravi villa – Porur").',
          'Choose Mr./Mrs./… and type the **First name**. Last name is optional.',
          'Type the **Phone number** (6 to 15 digits). Change the country code if needed. Email and Note are optional.',
          'Under **Site address**, choose the **City** – the **State** fills itself in. Address lines, pin code and country are optional.',
          'Optionally search the **site location** or click on the map to drop a pin.',
          'Press **Next**.',
        ],
        tips: ['City not in the list? Type its name and choose **Create City**, check the state and press Create.'],
        mistakes: ['Typing letters or spaces in the phone number. Use digits only.', 'A pin code must have exactly 6 digits.'],
      },
      {
        id: 'official',
        title: 'Step 2 – Official info',
        what: 'Who handles the deal and where it came from.',
        steps: [
          '**Managed By** is filled with your name – change it if someone else handles the customer.',
          '**Opportunity stage** starts as Enquiry.',
          'Choose the **Opportunity source** (Reference, Facebook, Walk-in…).',
          'Fill in anything else you know: estimated value, category, expected dates, account, tags and the people on the project (architect, site engineer…).',
          'Press **Save and create quote**. The new quote opens on its Design tab.',
        ],
        tips: ['**Back** returns to step 1 without losing what you typed.', 'To change an opportunity later, use ⋮ → Edit opportunity, or click the project name on its quote page.'],
        mistakes: ['The expected supply end date cannot be before the start date.'],
      },
    ],
  },
  {
    id: 'quote',
    title: 'The quote page',
    where: 'Open any opportunity or quote',
    intro: 'Each quote has a header and four tabs: Documents, Design, Pricing and Report.',
    topics: [
      {
        id: 'header',
        title: 'The header',
        what: 'Shows the project, quote number, revision, total value and quick actions.',
        steps: [
          'Click the **project name** to edit the opportunity details.',
          'The **Rev** button shows the revision you are looking at – see Revisions below.',
          'The **basket** shows the grand total and number of windows. Click it to see each design\'s price, the total area and the basic value.',
          '**Quick quote** opens the printable quotation in a new tab.',
          'The **▾** next to it has: View quotation, Generate smart quote link, Copy smart quote link, Download reports, Create revision, Edit opportunity, and Mark as won / lost (or Reopen).',
        ],
        mistakes: ['Quick quote and smart-quote links need at least one design in the quote.'],
      },
      {
        id: 'revisions',
        title: 'Revisions',
        what: 'A revision is a full copy of the quote (designs and pricing) that you can change without touching the original – for example "Colour change" or "Without mesh".',
        steps: [
          'Click the **Rev** button in the header and choose **Create revision**.',
          'Type a **Revision title** and keep "Make this the default quote" ticked if this is the one the customer should get.',
          'Press **Create revision**. The copy opens and you can change it.',
          'Switch between revisions from the same Rev menu. Use **Set as default quote** to choose which one counts.',
        ],
        tips: ['The default quote is the one shown in the Opportunities and Quotes lists and used for the opportunity value.'],
      },
      {
        id: 'documents',
        title: 'Documents tab',
        what: 'Keeps the files of the project with the quote: site photos, drawings, purchase orders, measurement sheets and invoices.',
        steps: [
          'Open the **Documents** tab.',
          'Choose a **category** in the drop-down.',
          'Drag files onto the box, or press **Browse files** (up to 25 MB each).',
          'Download or delete files from the list. The filter above the list shows one category at a time.',
        ],
      },
    ],
  },
  {
    id: 'designs',
    title: 'Designs and the window configurator',
    where: 'Quote page → Design tab',
    intro: 'Every window in the quote is a design (W1, W2…). You draw it in the configurator, which works out the materials and the price as you go.',
    topics: [
      {
        id: 'add',
        title: 'Adding a window',
        what: 'Two ways to add a design to the quote.',
        steps: [
          '**Create design** opens an empty configurator.',
          '**Choose from library designs** opens ready-made windows. Search or filter by system and press **Select design** – it is added to the quote and opens in the configurator.',
        ],
        tips: ['Save designs you use often to the library: ⋮ on a design card → Save to library.'],
      },
      {
        id: 'draw',
        title: 'Drawing a window, step by step',
        what: 'For example a 2-track, 2-panel sliding window of 1220 × 1220 mm.',
        steps: [
          'In **Basic info** on the left, check the **Design ref** (W1, W2…) and **quantity**, and add a location or floor if you like.',
          'Type the **width** and **height** in mm and press Enter (or click a measurement on the drawing).',
          'Click **Designs** in the tool strip and pick the window type, for example "2 Track 2 Panel (SL-SL)". If asked, choose the profile system in **Select System** and press Confirm.',
          'Click **Colours** (or Surface finish → Change), pick the colour and press **Confirm**.',
          'Open **Glazing Item** on the left and choose the glass.',
          'Check the live price at the bottom, then press **Save Design**.',
        ],
        tips: [
          'To split a window into parts, select it and use **Divider**. Then pick **Mullion** or **Glass equalization**.',
          'Click one panel to select it. The small card that appears lets you set sashes and tracks, the hinge side, add a mesh shutter, make it fixed or remove a divider.',
          'Designs that do not match the current system type are faded in the Designs list.',
        ],
        mistakes: [
          'When a window is divided into parts, click the part you want to change first – otherwise you are asked to select a panel on the drawing.',
          'Sizes outside the system\'s range – the size hint under Width/Height shows the allowed range and a warning appears.',
        ],
      },
      {
        id: 'panel',
        title: 'The left panel sections',
        what: 'Everything about the selected design, grouped in sections you can open and close.',
        steps: [
          '**Basic info** – ref, quantity, name, location, floor, size, floor aperture distance and a note.',
          '**Surface finish** – inside / outside colour, hardware colour and whether it is laminated.',
          '**Framing** – brand, system and the frame, mullion and guide-rail profiles.',
          '**Sash** – sash and interlock profiles, handle colour and the insect-mesh option.',
          '**Glazing Item** – glass for all panels, or for the selected panel only.',
          '**Bead** – chosen automatically for the glass thickness.',
        ],
        tips: ['Hide the panel with the button at the top left to get more room for the drawing.'],
      },
      {
        id: 'tools',
        title: 'Toolbar, views and saving',
        what: 'The buttons around the drawing.',
        steps: [
          '**Undo / Redo** (Ctrl+Z / Ctrl+Y), **Clear** (asks first), **Fit to view** and **Grid** are at the top.',
          'The round buttons on the right switch to **3D view**, **Section view** (a cut through the profiles) and **Wall view**. Click again to go back to the drawing.',
          '**Inside / Outside** at the bottom right shows the window from either side.',
          'The **price card** at the bottom shows the price of one window. Click it, or **Design summary**, for the price breakdown and bill of materials.',
          'The **⚠** button lists anything that needs fixing.',
          '**Save Design** (Ctrl+S) saves. The ▾ next to it has **Save & close**, **Save as new design** and **Save to library designs**.',
          'The **×** at the top right closes the configurator. It asks first if something is not saved.',
        ],
        tips: ['The ⋮ menu has Minimize (keep the design open while you look at the quote), realistic 3D materials and Reset view.'],
      },
      {
        id: 'cards',
        title: 'Managing designs in the Design tab',
        what: 'All windows of the quote as cards (or a list).',
        steps: [
          'Click a card\'s drawing or **Edit Design** to open it again.',
          '**View details** shows the cost summary, bill of materials and cutting list.',
          'The **⋮** menu has Edit design, View details, Duplicate, Save to library and Delete.',
          'Tick several cards to **Edit selected** or **Delete** them together.',
          '**Global edits** changes the colour, glass, system, quantity or location of all designs (or the ticked ones) at once.',
          '**Project defaults** sets the system, colour, glass and floor aperture that new designs start with.',
          '**Design orders** changes the order of the windows on the quotation; **Refresh designs** re-prices every design.',
        ],
        tips: ['An orange ⚠ on a card means the design has a warning – point at it to read it. "Manual rate" means its price was set by hand.'],
      },
    ],
  },
  {
    id: 'pricing',
    title: 'Pricing',
    where: 'Quote page → Pricing tab',
    intro: 'Shows how the price of the quote is built and lets you change it for this quote only. Changes here never change the master rates.',
    topics: [
      {
        id: 'structure',
        title: 'Project price structure and cost heads',
        what: 'The table of cost heads that turns material cost into the customer price, and the green Price Summary card.',
        steps: [
          'Open **Pricing**. The first page is **Project Price Structure**.',
          'The dark button at the top shows the price structure in use (for example Retail Projects). Pick another one to replace this quote\'s cost heads.',
          'Turn on the switch in the **Calculation Type** header to see the formula of each line.',
          'Press **⋮** on a line → **Modify …** to change its rate, whether it is shown in the quote summary, and a remark. Press Save.',
          'Use **Add cost head** to add your own charge to this quote.',
          'Press **Update Pricing** to recalculate with the latest rates.',
        ],
        tips: ['The Price Summary card shows exactly what the customer sees on the quotation, with the total area and rate per sqft.'],
        mistakes: ['Changing the price structure replaces every cost head of this quote, including any rates you modified.'],
      },
      {
        id: 'rates',
        title: 'Rate pages and price levels',
        what: 'Profile Rate, Reinforcement Rate, Hardware Rate, Glass Rate and Mesh Rate list every item used in this quote with its quantity and rate.',
        steps: [
          'Open a rate page from the menu on the left.',
          'Choose the **price level** with the dark button (for example Default Profile Rate or 25% Discounted Price). All rates on the page follow that price list.',
          'To change a rate for this quote only, type it in the **Price Level** column and press **Save**. Edited rows get an orange "Edited" badge.',
          'Tick several rows to set the same rate for all of them at once.',
          'Press **↺** on a row to go back to the price-level rate, or **Update Pricing** to undo all edits on the page.',
        ],
        tips: ['Price levels themselves are created in Settings → Raw Material Pricing (or Glazing Pricing).'],
        mistakes: ['Switching the price level while you have unsaved edits throws those edits away – press Save first.'],
      },
      {
        id: 'addons',
        title: 'Design add-on cost heads',
        what: 'Extra charges for a particular window, such as grill work, installation at height, scaffolding or custom colour charges.',
        steps: [
          'Open **Design Add On Cost Heads**.',
          'Press the edit button on the design\'s row.',
          'Press **Add add-on**, type a name (or pick a suggestion), the amount and whether it is **Per unit** or **Per SQFT**.',
          'Press **Save**. The total is added after profit as **DESIGN OVERHEAD**.',
        ],
      },
      {
        id: 'manual',
        title: 'Manual rate and FREEZE RATE',
        what: 'Use this when you want to quote a fixed price per sqft instead of the calculated price.',
        steps: [
          'Open **Design Manual Rate**.',
          'Change **Calculation type** of a design from Actual to **Manual**.',
          'Type the manual **SQFT rate** (or the basic price – the other one updates itself).',
          'To give many designs the same rate, press the pencil (**Apply single rate SQFT**), choose system type / system name or "Apply to all", type the SQFT value and press Update.',
          'Press **Save**.',
        ],
        tips: ['The difference between the calculated price and your manual price is shown as the **FREEZE RATE** cost head, so the totals still add up.', 'Reports warn you before download when a quotation uses manual rates.'],
        mistakes: ['Forgetting to press Save after "Apply single rate SQFT" – the rates are only filled in, not saved.'],
      },
    ],
  },
  {
    id: 'reports',
    title: 'Reports, PDF and Excel',
    where: 'Quote page → Report tab',
    intro: 'Twelve reports made from the quote: the quotation itself, elevations, bills of quantities for purchasing, production sheets and dispatch papers.',
    topics: [
      {
        id: 'find',
        title: 'Finding a report',
        what: 'Reports are grouped in categories on the left.',
        steps: [
          '**Favourite Reports** – the ones you use most.',
          '**Project Basic Details** – Elevation Report, Window Schedule.',
          '**Quotation & Costing** – Quotation, Project Cost Summary, Typology Cost Breakup.',
          '**Material Purchase Orders** – Profile, Accessories and Glass BOQ.',
          '**Production Reports** – Cutting Schedule, Design Assembly.',
          '**Dispatch & Installation** – Delivery Challan, Installation Checklist.',
        ],
        tips: ['Type in **Search reports** to look across all categories.', 'The costing reports are only shown to roles with the "View costing reports" permission.'],
      },
      {
        id: 'download',
        title: 'Viewing, printing and downloading',
        what: 'Each report card has buttons to view and download it.',
        steps: [
          'Press the **eye** to open the report in a new tab. There you can zoom, **Print**, **Download PDF** and, for table reports, **Download Excel**.',
          'Press the **cloud** to download the PDF straight away.',
          'Press **⋮** for Add to favourites, Download as Excel and Copy link.',
          'Tick several reports and use **Download selected (PDF)** or **Excel** in the bar that appears.',
          'Or press **Filter report** on the right edge: choose PDF or Excel and the report, then View or Download.',
        ],
        mistakes: [
          'A warning before download means some items have a ₹0 rate (they would not show prices) or a design uses a manual rate. Press **Update prices** to fix the rates first, or **Proceed & download** if that is what you want.',
        ],
      },
    ],
  },
  {
    id: 'quotes',
    title: 'Quotes list',
    where: 'Left menu → Quotes',
    intro: 'All quotes, one row per opportunity showing its default quote.',
    topics: [
      {
        id: 'list',
        title: 'Using the quotes list',
        what: 'See area, quantity, value, stage and revisions of every quote.',
        steps: [
          'Use the **Active / Won / Lost / All** tabs, search, date range, Filter and Sort by – just like Opportunities.',
          'Rows with revisions have a **▸** arrow at the start. Click it to list every revision under the row.',
          'Click a row to open the quote.',
          '**⋮** on a row has Open quote, View quotation, Create revision and Set as default quote.',
        ],
        tips: ['**Create quote** first opens the Create opportunity form, because every quote belongs to an opportunity.', 'Saved views and the column button work the same as on Opportunities.'],
      },
    ],
  },
  {
    id: 'contacts',
    title: 'Contacts',
    where: 'Left menu → Contacts',
    intro: 'Your customers, collected from your opportunities – one row per customer with how many opportunities they have and how many were won.',
    topics: [
      {
        id: 'list',
        title: 'Finding a customer',
        what: 'Search your customers and jump to their latest opportunity.',
        steps: [
          'Type a name, phone number, email or city in the search box.',
          'Click a row to open that customer\'s latest opportunity.',
          'Where your role allows it, use the add and edit buttons to add a contact or change one.',
        ],
        tips: ['Creating an opportunity adds its customer here automatically.'],
      },
    ],
  },
  {
    id: 'rate-master',
    title: 'Rate master (raw materials)',
    where: 'Apps → Rate Master, or Settings → Raw Material Settings',
    intro: 'The base list of everything a window is made of – profiles, aluminium, reinforcement, hardware, glass and mesh – with their rates, plus colours, profile systems and library designs.',
    topics: [
      {
        id: 'rates',
        title: 'Changing base rates',
        what: 'The rates used when a quote does not use a special price level.',
        steps: [
          'Open the tab you need: **Profiles**, **Aluminium**, **Reinforcement**, **Hardware** or **Glass & Mesh**.',
          'Search or pick a group to find the item.',
          'Type the new **rate** (profiles also have a **laminated rate** used for coloured profiles).',
          'Press **Save changes**. **Reset** throws away changes you have not saved.',
        ],
        tips: ['Quotes are re-priced with the new rates the next time they are opened. To be sure, press **Update Pricing** on the quote\'s Pricing tab.', 'Only roles with the "Edit raw material and glass price levels" permission can change rates – others can look.'],
        mistakes: ['Switching tabs with unsaved changes – you are asked first, and the changes are lost if you continue.'],
      },
      {
        id: 'more',
        title: 'Adding items, glass and colours',
        what: 'Add what you buy and sell.',
        steps: [
          'On an item tab press **Add item**, fill in the code, name, group, unit and rate, and save it.',
          'On **Glass & Mesh** press **Add glass** – code, kind (glass, louver or mesh), name, thickness and rate per sqm.',
          'On **Colours** press **Add colour** – name, colour, code suffix and whether it is laminated.',
          '**Systems** shows each profile system and the profiles it uses. **Library designs** lists the saved designs.',
        ],
      },
    ],
  },
  {
    id: 'settings',
    title: 'Settings',
    where: 'Left menu → Settings (gear at the bottom)',
    intro: 'Company details, users, price lists and the choices in drop-down lists. Everyone can look; only roles with the "Manage settings" permission can change most pages.',
    topics: [
      {
        id: 'find',
        title: 'Finding a setting',
        what: 'Settings are cards grouped by category.',
        steps: [
          'Pick a category on the left, or type in **Search** (for example "price", "stage" or "bank").',
          'Click a card to open the page. **Settings /** at the top takes you back.',
          'Click the **☆** on a card to add it to **Favourite Settings**.',
        ],
      },
      {
        id: 'levels',
        title: 'Price levels (price lists)',
        what: 'A price level is a complete price list for profiles, reinforcement, hardware or glass – for example "25% Discounted Price" for dealers.',
        steps: [
          'Open **Raw Material Pricing → Profile** (or Reinforcement / Hardware, or Glazing Pricing → Glazing).',
          'Press **Add price level**, type a name and, if you like, a % to start from the default prices adjusted up or down.',
          'Select the level on the left, change prices in the table and press **Save**.',
          'In a quote, choose this level on the Pricing tab\'s rate page.',
        ],
        tips: ['**Raw material price list** imports prices from Excel – download the template, fill it in and upload it.', 'The Default level cannot be deleted.'],
      },
      {
        id: 'structure',
        title: 'Price structure',
        what: 'The cost heads (wastage, labour, profit, discount, transport, GST…) used to calculate quotes.',
        steps: [
          'Open **Price & Calculation → Price structure**.',
          'Choose a structure on the left. Edit, move or delete cost heads with ⋮, or press **Add cost head**.',
          'Tick **Set as default** to use this structure for new quotes, then press **Save**.',
        ],
        mistakes: ['Existing quotes keep their own copy of the cost heads – changing the structure here only affects new quotes (or quotes you switch to it).'],
      },
      {
        id: 'users',
        title: 'Users, roles and teams',
        what: 'Who can log in and what they may do.',
        steps: [
          'Open **Users And Teams → Users** and press **Add user**.',
          'Fill in the name, email (this is their login ID), a password of at least 6 characters, the role, team and phone, and press **Add user**.',
          'Tell the person their email and password. When they first log in, they are offered this guided tour.',
          'In **Roles & Permissions → Roles**, tick what each role may do and press Save. **Add role** creates a new role.',
        ],
        tips: ['The Administrator role always has every permission.'],
      },
      {
        id: 'company',
        title: 'Company profile, logos and quotation terms',
        what: 'What is printed on your quotations.',
        steps: [
          'Open **Other → Company profile**.',
          'Under the images, press **Upload** for the **Company logo** (top-left of the quotation), the **Partner brand logo** (top-right) and the **Quotation header image**.',
          'Check the address, phone, email, GSTIN and bank details, then press **Save**.',
          'Open **Other → Quotation terms** to edit the covering letter, payment terms, terms & conditions, warranty, prerequisites at site and brands. Press **Save**.',
        ],
        tips: ['**Other → Notifications** shows a maintenance banner to everyone who is logged in.'],
      },
      {
        id: 'lists',
        title: 'Drop-down lists and imports',
        what: 'The choices offered in forms across the app.',
        steps: [
          'The **Opportunity** category holds sources, stages, lost reasons, competitors, personnel types, designations, categories, account types, tags and touchpoint types.',
          'Open one and press **Add …** to add a value. Use the row buttons to rename, move up or down (or drag the row) and delete.',
          '**Locations & Territories → Cities** manages cities and states. **Transportation → Vehicles** holds the transport charge per trip.',
          '**Import Data** brings in opportunities or raw material prices from Excel.',
        ],
        mistakes: ['The stages Won and Lost are built in and cannot be removed.'],
      },
    ],
  },
  {
    id: 'guide',
    title: 'This guide and the tours',
    where: 'Left menu → Guide, or ? at the top',
    intro: 'Everything in this guide is also shown as short guided tours on the real screens.',
    topics: [
      {
        id: 'tours',
        title: 'Using the tours',
        what: 'A tour highlights one part of the screen at a time and explains it.',
        steps: [
          'Press **Start full tour** at the top of this page for the whole app, or **Show me** on a chapter for just that part.',
          'Press **Next** and **Back**, or use the **→** and **←** keys. **Esc** or **×** closes the tour.',
          'A ✓ next to a chapter means you have finished its tour. **Reset tour progress** clears the ticks.',
          'The **▶** button at the top of every page starts the tour of that page.',
        ],
        tips: ['The tours use a temporary sample project. It is deleted automatically when the tour ends, so nothing you see in a tour is saved.'],
      },
    ],
  },
];

export const FAQ: FaqItem[] = [
  {
    id: 'price',
    q: 'How is the price of a window calculated?',
    a: [
      'The configurator works out every material the window needs (profiles, reinforcement, hardware, glass, mesh) and multiplies each one by its rate from the quote\'s price level. The cost heads of the price structure then build the price line by line. In the standard Retail Projects structure:',
      '• Raw material cost, with wastage (for example 5% on uPVC profile)',
      '• + Fabrication and installation labour (per sqft)',
      '• + Profit (a %), + DESIGN OVERHEAD (design add-ons) and FREEZE RATE (manual rate adjustment) = **Basic Value**',
      '• − Discount, + Transportation, Loading and Unloading, Labour and Extra Charges = **Total Project Cost**',
      '• + **GST** (18%) = **Grand Total**',
      'Your administrator may have changed these rates and heads. You can see the exact formula of every line on the Pricing tab by turning on the switch in the Calculation Type header.',
    ],
  },
  {
    id: 'levels',
    q: 'What is a price level?',
    a: [
      'A price level is a complete price list – for example "Default Profile Rate" or "25% Discounted Price". Administrators create them in Settings → Raw Material Pricing. On a quote\'s Pricing tab, each rate page lets you choose which level that quote uses, so a dealer quote can use dealer prices without changing anyone else\'s quotes.',
    ],
  },
  {
    id: 'revisions',
    q: 'What is the difference between a revision and the default quote?',
    a: [
      'A **revision** is a full copy of a quote that you can change – for example to offer a different colour – while keeping the original as it was. One opportunity can have many revisions (Rev 1, Rev 2…).',
      'The **default quote** is the one revision that counts: it is shown in the Opportunities and Quotes lists and used as the opportunity value. Change it with Rev ▾ → Set as default quote, or from ⋮ in the Quotes list.',
    ],
  },
  {
    id: 'manual',
    q: 'What are manual rate and FREEZE RATE?',
    a: [
      'Normally a design is priced automatically ("Actual"). On Pricing → Design Manual Rate you can switch a design to "Manual" and give your own rate per sqft (or basic price). The app keeps the calculated cost and posts the difference to the **FREEZE RATE** cost head, so the totals, GST and reports stay correct. The design card then shows a "Manual rate" badge, and you are reminded before downloading reports.',
      'Using manual rates needs the "Apply manual rates and edit quote cost heads" permission.',
    ],
  },
  {
    id: 'laminated',
    q: 'Why does the hardware change to brown for some colours?',
    a: [
      'Plain white windows use white hardware. Laminated (wood-look or coloured) profiles are usually fitted with brown hardware, so when you choose a laminated colour the app automatically switches to the brown hardware items and uses the laminated profile rate. You can see the hardware colour in the configurator\'s Surface finish section and in the Design summary.',
    ],
  },
  {
    id: 'smart',
    q: 'How do I share a smart-quote link with a customer?',
    a: [
      '1. Open the quote (it needs at least one design).',
      '2. Press the ▾ next to **Quick quote** and choose **Generate smart quote link** (it is copied and opened) or **Copy smart quote link**.',
      '3. Paste the link into WhatsApp, SMS or email.',
      'The customer can open the quotation without logging in. They see only what is printed on the quotation – never your costs or rates. Every time they open it, it is counted on the Dashboard under Smart quote analytics.',
    ],
  },
  {
    id: 'roles',
    q: 'Why are some buttons greyed out or missing? (roles and permissions)',
    a: [
      'What you can do depends on your role. The permissions are:',
      '• Manage settings, users and price structures',
      '• Edit raw material and glass price levels',
      '• Delete opportunities',
      '• Apply manual rates and edit quote cost heads',
      '• View costing reports (Project Cost Summary, Typology Cost Breakup)',
      'Administrators have all of them. The Sales role can use manual rates and costing reports but cannot change settings or price levels, or delete opportunities. Ask an administrator if you need more – they can change roles in Settings → Roles & Permissions.',
    ],
  },
  {
    id: 'logos',
    q: 'How do I add our logo to the quotation?',
    a: [
      '1. Go to Settings → **Other** → **Company profile** (administrators only).',
      '2. Press **Upload** under Company logo, Partner brand logo and, if you like, Quotation header image.',
      '3. Press **Save**. New quotations and PDFs show the images straight away.',
    ],
  },
  {
    id: 'password',
    q: 'How do I change or reset my password?',
    a: [
      '**Know your password?** Click your initials at the top right → **My profile**. Under Change password, type your current password and the new one twice, then press **Change password**.',
      '**Forgot it?** On the login page press **Forgot your password?** and type your login ID (email). Email is not set up, so on the computer that runs Titans ERP the reset page opens straight away. On any other computer, ask your administrator for the reset link – it is printed in the server window.',
    ],
  },
  {
    id: 'old',
    q: 'I cannot find an opportunity or quote I made earlier.',
    a: [
      'The lists show the last 90 days to start with. Click the date range button and choose **All time**, and check you are on the right tab (Active, Won, Lost or All). Also clear any filter or saved view you were using.',
    ],
  },
  {
    id: 'city',
    q: 'The customer\'s city is not in the list.',
    a: ['In the opportunity form, type the city name in the City box and choose **Create City**. Administrators can also manage cities in Settings → Locations & Territories → Cities.'],
  },
  {
    id: 'zero',
    q: 'Why does a report warn me about ₹0 items?',
    a: [
      'Some material in the quote has no rate in the chosen price level, so it would print without a price. Press **Update prices** in the warning to go to the Pricing tab and fill in the rate (or ask an administrator to add it to the price level), or press **Proceed & download** if that is fine.',
    ],
  },
];

export const SHORTCUTS: { keys: string; what: string }[] = [
  { keys: 'Ctrl + Z / Ctrl + Y', what: 'Undo / redo in the configurator' },
  { keys: 'Ctrl + S', what: 'Save the design in the configurator' },
  { keys: 'Esc', what: 'Deselect the panel in the configurator, or close a window or the tour' },
  { keys: 'Mouse wheel', what: 'Zoom the drawing' },
  { keys: 'Drag the background', what: 'Move the drawing around' },
  { keys: '→ / ←', what: 'Next / previous step of a tour' },
];
