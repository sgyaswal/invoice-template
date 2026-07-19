# InvoiceOS — Invoice & Quotation Generator

A modern, premium, fully-responsive **Invoice / Quotation template** for ERP &
CRM SaaS products. Built with **plain HTML5, CSS3 and Vanilla JavaScript** — no
frameworks, no build step, no dependencies. Just open `index.html`.

One template drives four document types:

| Sales Invoice | Purchase Invoice | Sales Quotation | Purchase Quotation |
| :-----------: | :--------------: | :-------------: | :----------------: |

---

## ✨ Features

- **Dashboard layout** — 25% action sidebar + 75% printable document.
- **Live line items** — add / remove unlimited rows with inline editing.
- **Auto-calculation engine** — quantity × price, per-line discount, per-line
  tax, subtotal, tax split (CGST/SGST · IGST · VAT), shipping, other charges,
  automatic **round-off**, grand total, amount paid and **balance due**.
- **Currency aware** — USD, INR, EUR, GBP, AED via `Intl.NumberFormat`.
- **Dynamic dates** — invoice date = today, due date = today + 30 days.
- **Invoice number generator** — prefix changes with the document type
  (`INV / BILL / QUO / RFQ`).
- **Status badges** — Draft, Pending, Paid, Cancelled, Quotation Accepted,
  Quotation Rejected — each with its own colour.
- **Dark / Light mode** toggle (remembered via `localStorage`, respects the OS
  preference on first visit).
- **Real PDF export** — Download generates an actual `.pdf` (jsPDF +
  html2canvas), multi-page A4, no print dialog.
- **Google Drive auto-filing** — one click saves the PDF to
  `Invoices/YYYY/MM/DD/<DocNumber>.pdf`, creating the date folders as needed.
- **Editable payment terms** — add / edit / remove any number of terms inline.
- **Actions** — Save to Drive, Download PDF, Print, Send Email (`mailto:`),
  Share (`navigator.share` with a clipboard fallback).
- **Print-perfect** — hides the sidebar & toolbar, forces a clean light theme,
  A4 page size, sensible page breaks and print margins.
- **Beautiful empty state** when there are no line items.
- **Responsive** — desktop, tablet and mobile via CSS Grid + Flexbox.
- **Accessible** — semantic HTML, labelled controls, keyboard shortcuts,
  `prefers-reduced-motion` support.

---

## 📁 Project structure

```
invoice-template/
├── index.html      # Markup & document structure
├── styles.css      # Design tokens, components, responsive & print styles
├── script.js       # State, calculations, actions, theming (vanilla JS)
├── assets/
│   └── logo.svg     # Sample company logo
└── README.md
```

---

## 🚀 Getting started

No install, no server. Either:

- **Double-click `index.html`**, or
- Serve the folder (optional, avoids browser file-URL quirks):

  ```bash
  # Python 3
  python3 -m http.server 8080
  # then open http://localhost:8080/invoice-template/
  ```

---

## 🧾 Saving as PDF (print-first)

Click **Download PDF** (or **Print**) → in the dialog choose **“Save as PDF”**,
paper size **A4**. The PDF is produced by the **browser's own print engine**, so
it renders the *same CSS as the screen* — **typography, spacing and colours are
identical to the preview**, text is crisp and selectable (vector, not an image),
table rows never break across pages, and nothing is cut off or overlaps.

The dedicated `@media print` stylesheet in `styles.css`:

- locks the document to **A4 portrait** with a **12 mm** margin
  (`@page { size: A4 portrait; margin: 12mm }`);
- hides the sidebar, toolbar and all buttons;
- keeps the desktop two-column layout (parties + totals);
- uses a **fixed-layout items table** whose columns sum to exactly the 186 mm
  content width, so no column is ever clipped;
- applies `break-inside: avoid` to rows, cards and sections and repeats the
  table header on every page.

> **One-time tip:** in the print dialog turn **“Headers and footers” Off** so the
> browser doesn't stamp the file path / page number onto the page (Firefox:
> *More settings → Header and footer → --blank--*; Chrome: uncheck *Headers and
> footers*).

> **Note:** *Save to Google Drive* still builds its uploaded PDF with
> jsPDF + html2canvas (a browser can't hand a print-rendered file to an upload),
> so the Drive copy is an image-based rendering. For a pixel-perfect vector PDF,
> use **Download PDF → Save as PDF**.

---

## ☁️ Google Drive auto-filing

Click **Save to Google Drive** and the invoice PDF is filed at:

```
Invoices/
└── 2026/          ← year
    └── 07/        ← month
        └── 18/    ← day
            └── INV-2026-0019.pdf
```

Folders are created on demand; existing ones are reused. Only files this app
creates are visible to it (the least-privilege `drive.file` scope).

### One-time setup (required)

Drive access from a browser-only app needs your own OAuth credential, and the
page must be served over **http/https** — Google blocks `file://` origins.

1. Open the **[Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)**
   and create/select a project.
2. **Enable the “Google Drive API”** (APIs & Services → Library).
3. Configure the **OAuth consent screen** (External is fine; add yourself as a
   test user).
4. **Create Credentials → OAuth client ID → Web application.**
5. Under **Authorized JavaScript origins** add the origin you serve from, e.g.
   `http://localhost:8080`.
6. Copy the **Client ID** and paste it into `script.js`:

   ```js
   const CONFIG = {
     GOOGLE_CLIENT_ID: "1234567890-abcdef.apps.googleusercontent.com",
     DRIVE_ROOT_FOLDER: "Invoices",
     // …
   };
   ```

7. Serve the folder and open it over http:

   ```bash
   python3 -m http.server 8080
   # → http://localhost:8080/invoice-template/
   ```

The first save shows a Google sign-in / consent popup; subsequent saves reuse
the session. Until a real Client ID is set, the button shows a friendly hint and
does nothing destructive.

---

## 🧷 Payment terms

The **Payment Terms** panel is fully dynamic — **Add term** appends an editable
line, and each term has a remove (×) button. Terms print with the document; the
add/remove controls never do. Start with the two seeded defaults or clear them
and write your own.

---

## ⌨️ Keyboard shortcuts

| Shortcut               | Action              |
| ---------------------- | ------------------- |
| `Ctrl` / `Cmd` + `Enter` | Add a new line item |
| `Ctrl` / `Cmd` + `P`     | Print / Save as PDF |

---

## 🎨 Design tokens

Defined as CSS custom properties at the top of `styles.css` — change them once
to re-skin the whole template.

| Token         | Value      |
| ------------- | ---------- |
| `--primary`   | `#6C4AB6`  |
| `--secondary` | `#3B82F6`  |
| `--success`   | `#22C55E`  |
| `--danger`    | `#EF4444`  |
| `--warning`   | `#F59E0B`  |
| `--radius`    | `16px`     |
| `--pad`       | `24px`     |
| Font          | Inter (system-font fallback stack) |

---

## 🛠️ Customising

- **Company / customer details** — edit the `.party` blocks in `index.html`.
- **Seed line items** — edit the `SEED_ITEMS` array in `script.js`.
- **Currencies** — extend the `CURRENCIES` map in `script.js` and add an
  `<option>` to the currency `<select>` in `index.html`.
- **Document types & labels** — edit the `DOC_TYPES` map in `script.js`.
- **Logo** — replace `assets/logo.svg` (keep it square for best results).

---

## 🌐 Browser support

Modern evergreen browsers (Chrome, Edge, Firefox, Safari). Uses standard
`Intl`, CSS Grid, custom properties and `color-mix()`.

---

## 📄 License

Sample template — free to adapt for your own products. Replace the placeholder
company, customer and bank details before real use.
