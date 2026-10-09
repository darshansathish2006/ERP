# Titans ERP

A desktop web app for quoting uPVC windows, built for **TITANS WINDOWS** (authorised partner of PROMINANCE uPVC). It replicates the EvA ERP quotation system shown in the reference walkthrough video, laid out for desktop screens.

## Quick start

Requirements: **Node.js 22.13 or newer** (it uses the built-in `node:sqlite` module).

**Option 1: double-click.** Run `start-titans-erp.bat`. The first time, it installs dependencies and builds the app. Then it starts the server and opens http://localhost:4000 in your browser.

**Option 2: terminal.**

```bash
npm install
npm run build      # type-check and build the client
npm start          # serves app + API on http://localhost:4000
```

For development with hot reload, run `npm run dev`. The API runs on :4000 and the UI on http://localhost:5173.

**Login:** `titanswindows1@gmail.com` / `Titans@123`

The first start creates `data/titans.db` with:
- master data: systems, profiles, hardware, glass, colours, price levels and price structures
- 23 library designs (ready-made window templates)
- the admin login

There is no demo or sample data. Opportunities, quotes and contacts start empty, ready for real work.

| Command | What it does |
|---|---|
| `npm run clear-data` | Delete every opportunity, quote, design, document, touchpoint and contact. Rates, masters, library designs, settings and user logins are kept, and quote numbering restarts. Stop the server first. |
| `npm run reset` | Wipe the whole database back to the original master data and the admin login. Edited rates and settings are lost. |
| `npm run test:engine` | Check the pricing engine against the reference quotation |

## Deploy on Render (test link)

The repository includes a Render Blueprint (`render.yaml`) for a single free web service that serves both the app and the API.

1. On [render.com](https://render.com), choose **New → Blueprint** and connect this GitHub repository.
2. When asked for **TITANS_ADMIN_PASSWORD**, enter the password testers will use with `titanswindows1@gmail.com`. If you leave it blank, the password is `Titans@123`, which anyone reading this README knows.
3. Click **Apply**. The first build takes a few minutes. The app is then live at `https://titans-erp.onrender.com`, or a similar address shown in the dashboard.

Every push to the connected branch redeploys automatically.

**Free plan limits:**
- The service sleeps after 15 minutes without traffic, and the first request after that takes about a minute to load.
- There is no persistent disk. The database starts empty again (master data and admin login only) on every deploy, restart or wake from sleep, so testers' changes do not last.
- To keep data, move to a paid plan, add a disk and set `TITANS_DATA_DIR` (see the comments in `render.yaml`).

Optional environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `TITANS_ADMIN_PASSWORD` | `Titans@123` | Password for the admin login when the database is first created |
| `TITANS_DATA_DIR` | `./data` | Folder for `titans.db` and uploaded images |
| `PORT` | `4000` | Set automatically by Render |

## What's included

- **Guided tour and Guide tab.**
  - Every new user gets a welcome prompt on first login and a step-by-step spotlight tour of every page. A temporary sample project is created for the tour and deleted automatically afterwards.
  - The **Guide** tab in the sidebar holds the full written guide (13 chapters plus questions and answers) with search, a "Show me" tour per chapter and "Start full tour".
  - The top-bar **?** opens the Guide, and **▶** starts the tour for the current page.
- **Add and edit everywhere.**
  - Quote rate pages (profile, reinforcement, hardware, glass, mesh) have **Add entry** for extra items with qty × rate. The cost is added to that category's cost head.
  - The quote price structure has **Add cost head** for extra charges (fixed ₹, ₹ per window, ₹ per sqft or % of a head).
  - Designs have add-on costs. Contacts, touchpoints, documents, items, glass, colours, profile systems, library designs, teams, bank accounts, vehicles and price structures can all be added, edited and deleted.
- **uPVC drawings.** 2D drawings, icons, the 3D view and the reports show white multi-chamber uPVC profiles, with welded corners, glazing bead, EPDM gasket and drainage slots. Laminated colours keep their woodgrain finish.
- **Login.** Includes "Keep me signed in", forgot/reset password and create account. Email isn't configured, so the reset link is shown on screen and printed in the server console.
- **Dashboard.** Shows:
  - KPI cards: created, newly quoted, won and lost
  - Sales analytics chart (weekly / monthly / yearly)
  - Sales location by city or state
  - Lost reasons, opportunity sources and the conversion funnel
  - Opportunities by stage, teams of the month and teams performance
  - Smart-quote analytics
  - A filter for date range and executive
- **Opportunity.**
  - The list has Active / Won / Lost / All tabs, EvA's desktop columns (Account, Managed By, Category, Opportunity Value, Deal Stage, Touchpoint, Last Contacted On), saved **custom views**, search, date range, a filter drawer, sorting, column settings, a list/grid toggle and pagination.
  - Row actions: open quote, log a **touchpoint** (call, site visit, meeting, WhatsApp…), edit, mark won, mark lost (with a reason), reopen and delete.
  - The 2-step create/edit wizard has a "Create City" option, a site map (Leaflet / OpenStreetMap), account, tags and opportunity personnel.
- **Quote page.**
  - Header: project and quote number, a **revision switcher** (Rev 1, Rev 2 · "Colour"… with Create revision / Set as default quote), a cart summary, and a Quick quote menu (view quotation, smart-quote link, create revision, mark won/lost).
  - **Documents:** upload, download and delete files.
  - **Design:** project designs as cards or a list, "Choose from library designs", global edits, project defaults, design ordering, filters, duplicate, save to library, a details drawer (cost summary, bill of materials, cutting list) and bulk delete.
  - **Configurator (EvA 3.0 layout):**
    - Left panel with **Basic info** (ref, quantity, name, location, floor, size, note), **Surface finish**, **Framing**, **Sash**, **Glazing Item** and **Bead** sections.
    - Top toolbar: Undo, Redo, Clear (with confirmation), Fit, Grid; Design summary, Save Design ▾, validation count.
    - Dividers with mullion or glass equalisation, and 50+ designs: openable, tilt & turn, twin sash, sliding, monorail, bifold, mesh sashes, **pleated & pull-down mesh**, and **add-ons** (louvers with Fixed Glass / Fixed PVC / Movable Glass type, exhaust fan, Georgian bars, MS safety grill).
    - Click-to-edit dimensions, floor aperture, inside/outside views, and round **3D / Section / Wall view** buttons (Section view cuts the window to show the real profile chambers).
  - **Pricing:** a permanent left menu (Project Price Structure, Profile / Reinforcement / Hardware / Glass / Mesh Rate, Design Add On Cost Heads, Design Manual Rate) and a green **Price Summary** card.
    - 26-row cost-head table (incl. Extra Charges); "Modify <head>" dialog for rate, visibility and remark; formula view.
    - Rate pages pick a **price level** (e.g. Default Profile Rate or 25% Discounted Price) and allow quote-specific rate edits with Reset / Save.
    - Design add-on cost heads, and Design manual rate (Actual / Manual) with "Apply single rate SQFT" (FREEZE RATE).
  - **Report:** twelve reports grouped in a category sidebar (Project Basic Details, Quotation & Costing, Material Purchase Orders, Production Reports, Dispatch & Installation). Each can be viewed, printed or downloaded as PDF, with Excel for the tabular ones.
    - Quotation, Elevation, Project Cost Summary, Typology Cost Breakup, Profile / Accessories / Glass BOQ, Cutting Schedule, Design Assembly.
    - New: **Window Schedule**, **Delivery Challan** (windows plus loose installation hardware, with signature blocks) and **Installation Checklist** (per-window checks, the pre-installation list and the handover declaration).
    - Favourites, multi-select download, and the "Download report" warning for ₹0 items and manual rates.
    - Elevation
    - Quotation
    - Project Cost Summary
    - Typology Cost Breakup
    - Profile BOQ (bar optimisation)
    - Accessories BOQ
    - Glass BOQ
    - Cutting Schedule
    - Design Assembly
- **Smart quote links.** A public `/sq/:token` page lets the customer view the quotation without logging in. Views are counted on the dashboard. The public page shows only what is printed on the quotation, never internal costs or rates.
- **Quotes list:** one row per opportunity with its default quote; expand a row to see every revision (Revision No., Revision Title, Parent Quote ID), plus area, qty, value, deal stage, managed by, category and contact; custom views, filters and sorting.
- **Settings (EvA layout):** a searchable hub with favourites:
  - Roles & Permissions, Users And Teams, Locations & Territories.
  - **Raw Material Pricing** with **price levels** for profiles (one row per colour), reinforcement and hardware (white / brown variants), plus Excel price-list import and template download.
  - Glazing Pricing, Price & Calculation (price-structure editor with default structure), Payment, Opportunity lookup lists, Transportation, Import Data (opportunities from Excel), Raw Material Settings, and Other (company profile with logo / partner logo / header image uploads, quotation terms, maintenance banner).
- **Other pages:** Contacts and My profile.

## Pricing accuracy

The bill of materials and pricing engine (`server/engine/`) reproduces both reference recordings exactly. A white W1 SL-SL 1220 × 1220 mm prices at **Basic ₹8,503.24 / Grand ₹10,033.82 (₹530.89/sqft)**. White windows use white hardware codes (PR-STLL, PR-BS, PR-FC …), and laminated colours use the brown variants. For W1 SL-SL, 1500 × 1500 mm, walnut, 4 mm pinhead glass, PROMINANCE INVENTA SLIDING SERIES:

| | Value |
|---|---|
| Basic value | ₹18,406.99 (₹760.02/sqft) |
| Grand total | ₹21,720.25 |
| Manual rate ₹700/sqft | Basic ₹16,953.30, FREEZE RATE −₹1,453.69, GST ₹3,051.59, Grand ₹20,004.89 |
| Profile BOQ | 8 standard bars, 43.800 m |

`npm run test:engine` verifies these numbers.

## Things to fill in

- **Settings → Other → Company profile:** upload your **TITANS logo**, the **PROMINANCE logo** and the **quotation header image** (brand ambassador photo) so the quotation header matches yours. Bank details and terms are already filled in from the quotation in the video.
- Rates for profiles, hardware and glass not shown in the video (for example the OPTIMA casement series) are reasonable placeholders. Update them in **Rate Master**.
- The site-location search and map tiles need an internet connection. Everything else works offline.

## Project layout

```
server/            Express API + SQLite (node:sqlite)
  engine/          catalog (master data), BOM engine, pricing engine, quote calculation
  routes/          auth, masters/settings, opportunities, quotes/designs/pricing/reports, dashboard
client/            React 19 + TypeScript + Vite
  src/configurator 2D renderer (DesignSvg), design model, typologies, configurator, 3D view (three.js)
  src/reports      report templates, viewer, PDF (jsPDF + html2canvas) and Excel (SheetJS) export
  src/pages        dashboard, opportunity, quote tabs, admin pages
data/              titans.db and uploaded documents (created at runtime)
```
