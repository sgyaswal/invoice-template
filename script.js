/* ============================================================================
   InvoiceOS · Invoice & Quotation Generator
   script.js  —  Vanilla JavaScript (no dependencies)
   ----------------------------------------------------------------------------
   1.  Config & constants
   2.  App state
   3.  Small helpers (escape, currency, dates, toast)
   4.  Line-item rendering (add / remove / render)
   5.  Calculation engine (auto totals, tax, round-off)
   6.  Document meta (type, currency, status, number)
   7.  Actions (print, PDF, email, share)
   8.  Theme (dark / light)
   9.  Event wiring & init
   ========================================================================== */
(function () {
  "use strict";

  /* ==========================================================================
     0. USER CONFIG  —  edit these two values
     --------------------------------------------------------------------------
     GOOGLE_CLIENT_ID : create a free OAuth Client ID (type "Web application")
       at  https://console.cloud.google.com/apis/credentials , enable the
       "Google Drive API", add your origin (e.g. http://localhost:8080) to the
       "Authorized JavaScript origins", then paste the ID below.
     DRIVE_ROOT_FOLDER : top folder in Drive; invoices are filed underneath as
       <root>/YYYY/MM/DD/<DocNumber>.pdf
     ======================================================================== */
  const CONFIG = {
    GOOGLE_CLIENT_ID: "774832676725-7dp790kjckcvck6dcugkq0qo0eb6h9vp.apps.googleusercontent.com",
    DRIVE_ROOT_FOLDER: "Invoices",
    DRIVE_SCOPE: "https://www.googleapis.com/auth/drive.file",
  };

  /* ==========================================================================
     1. CONFIG & CONSTANTS
     ======================================================================== */

  /** Behaviour + labels for every supported document type. */
  const DOC_TYPES = {
    sales_invoice: {
      title: "Invoice", prefix: "KE",
      dateLabel: "Issue Date:", dueLabel: "Due Date:",
      customerRole: "Bill to:", totalLabel: "Invoice Total",
    },
    purchase_invoice: {
      title: "Purchase Invoice", prefix: "BILL",
      dateLabel: "Bill Date:", dueLabel: "Due Date:",
      customerRole: "Bill from:", totalLabel: "Invoice Total",
    },
    sales_quotation: {
      title: "Quotation", prefix: "QUO",
      dateLabel: "Quotation Date:", dueLabel: "Valid Until:",
      customerRole: "Quote to:", totalLabel: "Quotation Total",
    },
    purchase_quotation: {
      title: "Purchase Quotation", prefix: "RFQ",
      dateLabel: "Request Date:", dueLabel: "Respond By:",
      customerRole: "Request to:", totalLabel: "Quotation Total",
    },
  };

  /** Currency → symbol + locale used by Intl.NumberFormat. */
  const CURRENCIES = {
    INR: { symbol: "₹", locale: "en-IN" },
    USD: { symbol: "$", locale: "en-US" },
    EUR: { symbol: "€", locale: "de-DE" },
    GBP: { symbol: "£", locale: "en-GB" },
    AED: { symbol: "د.إ", locale: "en-AE" },
  };

  /** Human labels for the status pill. */
  const STATUS_LABELS = {
    draft: "Draft", pending: "Pending", paid: "Paid",
    cancelled: "Cancelled", accepted: "Quotation Accepted",
    rejected: "Quotation Rejected",
  };

  const THEME_KEY = "invoiceos-theme";

  /* ==========================================================================
     2. APP STATE
     ======================================================================== */

  const state = {
    docType: "sales_invoice",
    currency: "INR",
    status: "paid",
    seq: 1,                  // running sequence (2-digit) → …01, …02, …
    year: new Date().getFullYear(),
    docNumber: "",           // editable invoice/quotation number (user-controlled)
    numberEdited: false,     // true once the user types their own number
    nextId: 1,               // incremental row id
    items: [],               // [{ id, name, hsn, qty, price }]
    extras: { paid: 0 },
    paidEdited: false,       // false → Amount Paid auto-mirrors the total (fully paid)
    nextTermId: 1,           // incremental payment-term id
    paymentTerms: [],        // [{ id, text }]
  };

  /** Default legal / payment terms (fully editable / removable at runtime). */
  const SEED_TERMS = [
    "Payment Terms: MoneyGram",
  ];

  /** Seed data used on first load (simple product / qty / price rows). */
  const SEED_ITEMS = [
    { name: "Weft wavy 60cm 500g",     hsn: "05010010", qty: 1, price: 425 },
    { name: "Weft straight 60cm 500g", hsn: "05010010", qty: 1, price: 425 },
    { name: "Weft wavy 70cm 500g",     hsn: "05010010", qty: 1, price: 450 },
    { name: "Weft straight 70cm 500g", hsn: "05010010", qty: 1, price: 450 },
    { name: "Topper 50cm wavy",        hsn: "05010010", qty: 1, price: 115 }
  ];

  /* Cached DOM refs (assigned in init) */
  const el = {};

  /* ==========================================================================
     3. HELPERS
     ======================================================================== */

  const $ = (id) => document.getElementById(id);

  /** Escape a string for safe injection into an HTML attribute / text node. */
  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Format a number as currency in the active currency + locale. */
  function formatCurrency(amount) {
    const cfg = CURRENCIES[state.currency] || CURRENCIES.INR;
    const value = Number.isFinite(amount) ? amount : 0;
    try {
      return new Intl.NumberFormat(cfg.locale, {
        style: "currency",
        currency: state.currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    } catch (_) {
      // Fallback if a currency code is unknown to the runtime
      return cfg.symbol + value.toFixed(2);
    }
  }

  /** Coerce an input value to a non-negative number. */
  function toNumber(value) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }

  /** Format a Date as "Jul 19, 2026". */
  function formatDate(date) {
    return new Intl.DateTimeFormat("en-US", {
      month: "short", day: "numeric", year: "numeric",
    }).format(date);
  }

  let toastTimer = null;
  /** Show a transient toast message. */
  function toast(message) {
    const t = el.toast;
    t.textContent = message;
    t.hidden = false;
    // Force reflow so the transition runs even on rapid re-triggers
    void t.offsetWidth;
    t.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      t.classList.remove("is-visible");
      window.setTimeout(() => { t.hidden = true; }, 260);
    }, 2400);
  }

  /* ==========================================================================
     4. LINE-ITEM RENDERING
     ======================================================================== */

  /** Build one <tr> of markup for a line item. */
  function rowMarkup(item) {
    return (
      '<tr data-id="' + item.id + '">' +
        '<td><input class="cell-input is-name" data-field="name" type="text" value="' + esc(item.name) + '" placeholder="Product or service" /></td>' +
        '<td><input class="cell-input" data-field="hsn" type="text" value="' + esc(item.hsn) + '" placeholder="HSN/SAC" /></td>' +
        '<td class="num"><input class="cell-input is-num" data-field="qty" type="number" min="0" step="1" value="' + esc(item.qty) + '" /></td>' +
        '<td class="num"><input class="cell-input is-num" data-field="price" type="number" min="0" step="0.01" value="' + esc(item.price) + '" /></td>' +
        '<td class="num inv__line-total" data-total="' + item.id + '">—</td>' +
        '<td class="inv__c-act no-print">' +
          '<button class="row-remove" type="button" data-remove="' + item.id + '" title="Remove item" aria-label="Remove item">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6M14 11v6" /></svg>' +
          "</button>" +
        "</td>" +
      "</tr>"
    );
  }

  /** Re-render the whole table body from state, then recalculate. */
  function renderItems() {
    if (state.items.length === 0) {
      el.itemsBody.innerHTML = "";
      el.emptyState.hidden = false;
      el.itemsTable.hidden = true;
    } else {
      el.emptyState.hidden = true;
      el.itemsTable.hidden = false;
      el.itemsBody.innerHTML = state.items.map(rowMarkup).join("");
    }
    recalculate();
  }

  /** Append a fresh blank line item. */
  function addItem() {
    state.items.push({ id: state.nextId++, name: "", hsn: "", qty: 1, price: 0 });
    renderItems();
    // Focus the name field of the new row for fast entry
    const last = el.itemsBody.querySelector("tr:last-child .is-name");
    if (last) last.focus();
  }

  /** Remove a line item by id. */
  function removeItem(id) {
    state.items = state.items.filter((it) => it.id !== id);
    renderItems();
    toast("Item removed");
  }

  /* ==========================================================================
     4b. PAYMENT TERMS  (add / edit / remove)
     ======================================================================== */

  /** Markup for a single editable payment term. */
  function termMarkup(term) {
    return (
      '<li class="term-row" data-term-id="' + term.id + '">' +
        '<span class="term-bullet" aria-hidden="true"></span>' +
        '<input class="term-input" type="text" value="' + esc(term.text) + '" placeholder="Enter a payment term…" />' +
        '<button class="term-remove no-print" type="button" data-remove-term="' + term.id + '" title="Remove term" aria-label="Remove term">' +
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>' +
        "</button>" +
      "</li>"
    );
  }

  /** Render the payment-terms list (or its empty state). */
  function renderTerms() {
    if (state.paymentTerms.length === 0) {
      el.paymentTerms.innerHTML = "";
      el.termsEmpty.hidden = false;
    } else {
      el.termsEmpty.hidden = true;
      el.paymentTerms.innerHTML = state.paymentTerms.map(termMarkup).join("");
    }
  }

  /** Append a blank payment term and focus it. */
  function addTerm() {
    state.paymentTerms.push({ id: state.nextTermId++, text: "" });
    renderTerms();
    const last = el.paymentTerms.querySelector(".term-row:last-child .term-input");
    if (last) last.focus();
  }

  /** Remove a payment term by id. */
  function removeTerm(id) {
    state.paymentTerms = state.paymentTerms.filter((t) => t.id !== id);
    renderTerms();
  }

  /** Keep state in sync while a term is edited (event delegation). */
  function onTermInput(event) {
    const input = event.target.closest(".term-input");
    if (!input) return;
    const row = input.closest(".term-row");
    const id = Number(row.getAttribute("data-term-id"));
    const term = state.paymentTerms.find((t) => t.id === id);
    if (term) term.text = input.value;
  }

  /** Handle remove-term clicks (event delegation). */
  function onTermClick(event) {
    const btn = event.target.closest("[data-remove-term]");
    if (!btn) return;
    removeTerm(Number(btn.getAttribute("data-remove-term")));
  }

  /* ==========================================================================
     5. CALCULATION ENGINE
     ======================================================================== */

  /** Compute per-line totals + document totals; write them back to the DOM. */
  function recalculate() {
    let subtotal = 0;

    state.items.forEach((item) => {
      const lineTotal = toNumber(item.qty) * toNumber(item.price);
      subtotal += lineTotal;

      // Update the line-total cell (inputs untouched → focus is preserved)
      const cell = el.itemsBody.querySelector('[data-total="' + item.id + '"]');
      if (cell) cell.textContent = formatCurrency(lineTotal);
    });

    const invoiceTotal = subtotal;        // no tax/discount in this layout
    // Until the user edits it, Amount Paid mirrors the total (invoice is "Paid")
    if (!state.paidEdited) {
      state.extras.paid = invoiceTotal;
      if (el.inpPaid) el.inpPaid.value = invoiceTotal;
    }
    const paid = state.extras.paid;
    const balanceDue = invoiceTotal - paid;

    // ---- Write totals ----
    el.sumSubtotal.textContent = formatCurrency(subtotal);
    el.sumGrand.textContent = formatCurrency(invoiceTotal);
    el.sumDue.textContent = formatCurrency(balanceDue);

    // ---- Mirror into the sidebar ----
    el.sideTotal.textContent = formatCurrency(invoiceTotal);
    el.sidePayTotal.textContent = formatCurrency(invoiceTotal);
    el.sidePayPaid.textContent = formatCurrency(paid);
    el.sidePayDue.textContent = formatCurrency(balanceDue);

    // ---- Payment progress bar ----
    const pct = invoiceTotal > 0 ? Math.max(0, Math.min(100, (paid / invoiceTotal) * 100)) : 0;
    el.paidProgress.style.width = pct.toFixed(1) + "%";
    el.paidHint.textContent =
      pct >= 100 ? "Fully paid" :
      pct > 0 ? Math.round(pct) + "% paid · balance " + formatCurrency(balanceDue) :
      "Awaiting payment";
  }

  /* ==========================================================================
     6. DOCUMENT META (type / currency / status / number)
     ======================================================================== */

  /** Indian financial-year code, e.g. Jul 2026 → "2627" (FY Apr 2026–Mar 2027). */
  function financialYearCode() {
    const now = new Date();
    const m = now.getMonth();                        // 0 = Jan, 3 = Apr
    const startYear = m >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return String(startYear % 100).padStart(2, "0") +
      String((startYear + 1) % 100).padStart(2, "0");
  }

  /** Auto-generated number, e.g. "KE262701" = prefix + FY-code + sequence. */
  function defaultDocNumber() {
    const cfg = DOC_TYPES[state.docType];
    return cfg.prefix + financialYearCode() + String(state.seq).padStart(2, "0");
  }

  /** The number in effect: the user's typed value, else the generated one. */
  function buildDocNumber() {
    return (state.docNumber && state.docNumber.trim()) || defaultDocNumber();
  }

  /** Apply all labels that depend on the document type. */
  function applyDocType() {
    const cfg = DOC_TYPES[state.docType];
    el.docTypeTitle.textContent = cfg.title;
    el.metaDateLabel.textContent = cfg.dateLabel;
    el.metaDueLabel.textContent = cfg.dueLabel;
    el.customerRole.textContent = cfg.customerRole;
    el.totalLabel.textContent = cfg.totalLabel;
    // Refresh the number's prefix only until the user types their own
    if (!state.numberEdited) {
      state.docNumber = defaultDocNumber();
      el.docNumber.textContent = state.docNumber;
    }
  }

  /** Currency change → refresh all money figures. */
  function applyCurrency() {
    recalculate();
  }

  /** Reflect the chosen status in the sidebar badge. */
  function applyStatus() {
    const label = STATUS_LABELS[state.status] || "Draft";
    if (el.sideStatusBadge) {
      el.sideStatusBadge.textContent = label;
      el.sideStatusBadge.setAttribute("data-status", state.status);
    }
  }

  /* ==========================================================================
     7. ACTIONS
     ======================================================================== */

  /** Toggle a button's loading state. */
  function setBusy(btn, busy) {
    if (!btn) return;
    btn.disabled = busy;
    btn.classList.toggle("is-busy", busy);
  }

  /**
   * Open the print dialog with the invoice number as the default filename.
   * Browsers use document.title as the "Save as PDF" filename, so we set it to
   * the current number (e.g. "KE262701") and restore it after printing.
   */
  function printWithFilename() {
    const original = document.title;
    document.title = (buildDocNumber() || "invoice").trim();
    const restore = function () {
      document.title = original;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  }

  function printInvoice() {
    printWithFilename();
  }

  /**
   * Render the document to a real PDF Blob using html2canvas + jsPDF.
   *
   * Each top-level section of the document is captured on its own canvas and
   * placed as a unit, moving to a new page when it would not fit. That way a
   * page break never slices through a table row or a summary line. The document
   * is momentarily forced to a clean, desktop-width light layout (.is-exporting)
   * so every column fits and the words come out small.
   */
  async function buildPdfBlob() {
    if (!window.jspdf || !window.html2canvas) {
      throw new Error("PDF libraries not loaded (check your connection)");
    }
    const paper = document.querySelector(".paper");
    const html = document.documentElement;
    const prevTheme = html.getAttribute("data-theme");

    html.setAttribute("data-theme", "light");
    document.body.classList.add("is-exporting");
    try {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF("p", "mm", "a4");
      const pageW = pdf.internal.pageSize.getWidth(); // 210 mm
      const pageH = pdf.internal.pageSize.getHeight(); // 297 mm
      const margin = 10; // mm
      const usableW = pageW - margin * 2;
      const usableH = pageH - margin * 2;
      const gap = 4; // mm between sections
      let cursorY = margin;

      // In the cloned copy html2canvas renders, replace every editable <input>/
      // <textarea> with a plain text span. html2canvas mis-positions form-field
      // text (it renders low, so it clips/overlaps); plain text renders cleanly.
      // The live form on the page is never touched — only the throwaway clone.
      const flattenClone = (clonedDoc) => {
        const fields = clonedDoc.querySelectorAll(".paper input, .paper textarea");
        fields.forEach((field) => {
          const span = clonedDoc.createElement("span");
          span.textContent = field.value != null ? field.value : "";
          span.style.display = "inline-block";
          span.style.width = "100%";
          span.style.font = "inherit";
          span.style.color = "inherit";
          span.style.verticalAlign = "middle";
          span.style.textAlign =
            field.classList.contains("is-num") || field.classList.contains("control--num")
              ? "right"
              : "left";
          if (field.parentNode) field.parentNode.replaceChild(span, field);
        });
      };

      // Capture each printable top-level section separately
      const blocks = Array.prototype.filter.call(
        paper.children,
        (n) => n.nodeType === 1 && !n.classList.contains("no-print")
      );

      for (let i = 0; i < blocks.length; i++) {
        const canvas = await window.html2canvas(blocks[i], {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          logging: false,
          windowWidth: 1080, // force the desktop layout (media queries)
          onclone: flattenClone,
        });
        const blockH = (canvas.height * usableW) / canvas.width; // height in mm

        if (blockH <= usableH) {
          // Whole section fits on a page — start a new page if needed
          if (cursorY + blockH > pageH - margin + 0.1) {
            pdf.addPage();
            cursorY = margin;
          }
          pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", margin, cursorY, usableW, blockH);
          cursorY += blockH + gap;
        } else {
          // Rare: a section taller than a full page (e.g. a very long table).
          // Slice only this section so all its content is still included.
          if (cursorY > margin) {
            pdf.addPage();
            cursorY = margin;
          }
          const pxPerMm = canvas.width / usableW;
          const slicePx = Math.floor(usableH * pxPerMm);
          let sy = 0;
          let first = true;
          while (sy < canvas.height) {
            if (!first) pdf.addPage();
            first = false;
            const h = Math.min(slicePx, canvas.height - sy);
            const tmp = document.createElement("canvas");
            tmp.width = canvas.width;
            tmp.height = h;
            tmp.getContext("2d").drawImage(canvas, 0, sy, canvas.width, h, 0, 0, canvas.width, h);
            pdf.addImage(tmp.toDataURL("image/jpeg", 0.95), "JPEG", margin, margin, usableW, h / pxPerMm);
            sy += h;
          }
          cursorY = pageH; // force the next section onto a fresh page
        }
      }
      return pdf.output("blob");
    } finally {
      document.body.classList.remove("is-exporting");
      if (prevTheme) html.setAttribute("data-theme", prevTheme);
      else html.removeAttribute("data-theme");
    }
  }

  /**
   * Download as PDF via the browser's native print engine → "Save as PDF".
   * This renders the very same CSS as the on-screen document, so the PDF is
   * pixel-faithful to the preview: identical typography, no clipping, no
   * broken rows, proper A4 page breaks (all handled by the print stylesheet).
   */
  function downloadPdf() {
    printWithFilename();
  }

  /* ---------- Google Drive auto-filing ---------- */

  let tokenClient = null;
  let accessToken = null;

  /** Lazily initialise the Google OAuth token client. */
  function initGoogle() {
    if (tokenClient) return true;
    if (!(window.google && window.google.accounts && window.google.accounts.oauth2)) return false;
    if (CONFIG.GOOGLE_CLIENT_ID.indexOf("PASTE") === 0) return false;
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      scope: CONFIG.DRIVE_SCOPE,
      callback: function () {}, // replaced per-request in requestToken()
    });
    return true;
  }

  /** Obtain an access token (shows a Google popup the first time). */
  function requestToken() {
    return new Promise((resolve, reject) => {
      if (!initGoogle()) {
        reject(new Error("Google sign-in not ready — add your Client ID and serve over http"));
        return;
      }
      tokenClient.callback = (resp) => {
        if (resp && resp.access_token) {
          accessToken = resp.access_token;
          resolve(accessToken);
        } else {
          reject(new Error(resp && resp.error ? resp.error : "Authorization was cancelled"));
        }
      };
      tokenClient.requestAccessToken({ prompt: accessToken ? "" : "consent" });
    });
  }

  /** Authenticated JSON call against the Drive REST API. */
  async function driveFetch(url, options) {
    const opts = options || {};
    const headers = Object.assign({ Authorization: "Bearer " + accessToken }, opts.headers || {});
    const res = await fetch(url, Object.assign({}, opts, { headers: headers }));
    if (res.status === 401) {
      accessToken = null;
      throw new Error("Drive session expired — click Save again");
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error("Drive API " + res.status + ": " + text.slice(0, 140));
    }
    return res.json();
  }

  /** Find (or create) a folder by name under an optional parent; returns its id. */
  async function ensureFolder(name, parentId) {
    let q =
      "mimeType='application/vnd.google-apps.folder' and name='" +
      name.replace(/'/g, "\\'") +
      "' and trashed=false";
    if (parentId) q += " and '" + parentId + "' in parents";

    const found = await driveFetch(
      "https://www.googleapis.com/drive/v3/files?q=" +
        encodeURIComponent(q) +
        "&fields=files(id,name)&spaces=drive"
    );
    if (found.files && found.files.length) return found.files[0].id;

    const body = { name: name, mimeType: "application/vnd.google-apps.folder" };
    if (parentId) body.parents = [parentId];
    const created = await driveFetch("https://www.googleapis.com/drive/v3/files?fields=id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return created.id;
  }

  /**
   * Multipart-upload a PDF blob into a folder.
   * Builds a proper `multipart/related` body (Drive's documented format) so the
   * metadata and binary travel in one request.
   */
  async function uploadPdf(blob, filename, folderId) {
    const metadata = { name: filename, mimeType: "application/pdf", parents: [folderId] };
    const boundary = "invoiceos_boundary_7MA4YWxkTrZu0gW";
    const delimiter = "\r\n--" + boundary + "\r\n";
    const closeDelim = "\r\n--" + boundary + "--";

    const metaPart =
      delimiter +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata);
    const filePartHeader = delimiter + "Content-Type: application/pdf\r\n\r\n";

    // String parts + the binary Blob concatenate cleanly inside one Blob body
    const body = new Blob([metaPart, filePartHeader, blob, closeDelim], {
      type: "multipart/related; boundary=" + boundary,
    });

    return driveFetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
      {
        method: "POST",
        headers: { "Content-Type": "multipart/related; boundary=" + boundary },
        body: body,
      }
    );
  }

  /**
   * Save the current invoice to Google Drive under Invoices/YYYY/MM/DD/.
   * Steps: authorise → build PDF → ensure the date-folder chain → upload.
   */
  async function saveToDrive() {
    // Google blocks OAuth from file:// (null origin) — catch it before the popup
    if (location.protocol === "file:") {
      toast("Serve over http://localhost (python3 -m http.server) — Google blocks file:// sign-in");
      return;
    }
    if (CONFIG.GOOGLE_CLIENT_ID.indexOf("PASTE") === 0) {
      toast("Add your Google OAuth Client ID in script.js → CONFIG");
      return;
    }
    if (!window.jspdf || !window.html2canvas) {
      toast("PDF engine still loading — check your connection");
      return;
    }
    try {
      setBusy(el.btnDrive, true);

      toast("Connecting to Google Drive…");
      await requestToken();

      toast("Generating PDF…");
      const blob = await buildPdfBlob();

      // Date-based folder path: <root>/YYYY/MM/DD
      const now = new Date();
      const y = String(now.getFullYear());
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const d = String(now.getDate()).padStart(2, "0");

      toast("Filing under " + y + "/" + m + "/" + d + "…");
      let folder = await ensureFolder(CONFIG.DRIVE_ROOT_FOLDER, null);
      folder = await ensureFolder(y, folder);
      folder = await ensureFolder(m, folder);
      folder = await ensureFolder(d, folder);

      const filename = buildDocNumber() + ".pdf";
      toast("Uploading " + filename + "…");
      await uploadPdf(blob, filename, folder);

      toast("Saved to Drive · " + CONFIG.DRIVE_ROOT_FOLDER + "/" + y + "/" + m + "/" + d + "/" + filename);
    } catch (e) {
      toast("Drive save failed: " + (e.message || e));
    } finally {
      setBusy(el.btnDrive, false);
    }
  }

  function sendEmail() {
    const number = buildDocNumber();
    const subject = encodeURIComponent(DOC_TYPES[state.docType].title + " " + number);
    const body = encodeURIComponent(
      "Hello,\n\nPlease find " + DOC_TYPES[state.docType].title + " " + number +
      " for a total of " + el.sumGrand.textContent + ".\n\n" +
      "Balance due: " + el.sumDue.textContent + "\n\n" +
      "Kind regards,\nKHUSH EXIM"
    );
    window.location.href = "mailto:john.smith@northwind.co?subject=" + subject + "&body=" + body;
  }

  async function shareInvoice() {
    const number = buildDocNumber();
    const shareData = {
      title: DOC_TYPES[state.docType].title + " " + number,
      text: "Total " + el.sumGrand.textContent + " · Balance due " + el.sumDue.textContent,
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareData.title + " — " + shareData.url);
        toast("Share link copied to clipboard");
      } else {
        toast("Sharing is not supported in this browser");
      }
    } catch (_) {
      /* user dismissed the share sheet — no action needed */
    }
  }

  /* ==========================================================================
     8. THEME
     ======================================================================== */

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) { /* storage blocked */ }
  }

  function initTheme() {
    let theme = null;
    try { theme = localStorage.getItem(THEME_KEY); } catch (_) { /* ignore */ }
    if (!theme) {
      theme = window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    applyTheme(theme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
  }

  /* ==========================================================================
     9. EVENT WIRING & INIT
     ======================================================================== */

  /** Handle edits inside the items table (event delegation). */
  function onItemInput(event) {
    const input = event.target.closest(".cell-input");
    if (!input) return;
    const tr = input.closest("tr");
    if (!tr) return;
    const id = Number(tr.getAttribute("data-id"));
    const field = input.getAttribute("data-field");
    const item = state.items.find((it) => it.id === id);
    if (!item) return;

    const numericFields = ["qty", "price"];
    item[field] = numericFields.indexOf(field) !== -1 ? toNumber(input.value) : input.value;
    recalculate();
  }

  /** Handle remove-button clicks inside the items table (event delegation). */
  function onItemClick(event) {
    const btn = event.target.closest("[data-remove]");
    if (!btn) return;
    removeItem(Number(btn.getAttribute("data-remove")));
  }

  /** Handle edits to the Amount Paid input. */
  function onExtraInput(event) {
    const map = { inpPaid: "paid" };
    const key = map[event.target.id];
    if (!key) return;
    state.paidEdited = true;   // user has taken manual control of Amount Paid
    state.extras[key] = toNumber(event.target.value);
    recalculate();
  }

  /** Set the invoice/quotation dates dynamically (today + 30-day term). */
  function initDates() {
    const today = new Date();
    const due = new Date(today.getTime());
    due.setDate(due.getDate() + 30);
    el.metaDate.textContent = formatDate(today);
    el.metaDue.textContent = formatDate(due);
  }

  /** Cache every DOM element the app touches. */
  function cacheDom() {
    [
      "docTypeSelect", "currencySelect", "statusSelect",
      "themeToggle", "toast",
      "itemsTable", "itemsBody", "emptyState",
      "btnAddItem", "btnAddItemEmpty",
      "paymentTerms", "termsEmpty", "btnAddTerm",
      "btnDrive", "btnDownload", "btnPrint", "btnEmail", "btnShare",
      "docTypeTitle", "docNumber",
      "metaDateLabel", "metaDate", "metaDueLabel", "metaDue",
      "customerRole", "totalLabel",
      "sideStatusBadge",
      "sumSubtotal", "sumGrand", "sumDue",
      "sideTotal", "sidePayTotal", "sidePayPaid", "sidePayDue",
      "paidProgress", "paidHint",
      "inpPaid",
    ].forEach((id) => { el[id] = $(id); });
  }

  /** Attach all listeners. */
  function bindEvents() {
    // Table editing
    el.itemsBody.addEventListener("input", onItemInput);
    el.itemsBody.addEventListener("click", onItemClick);

    // Add item (header + empty-state button)
    el.btnAddItem.addEventListener("click", addItem);
    el.btnAddItemEmpty.addEventListener("click", addItem);

    // Payment terms (add / edit / remove)
    el.btnAddTerm.addEventListener("click", addTerm);
    el.paymentTerms.addEventListener("input", onTermInput);
    el.paymentTerms.addEventListener("click", onTermClick);

    // Amount Paid input
    ["inpPaid"].forEach((id) => {
      el[id].addEventListener("input", onExtraInput);
    });

    // Editable invoice number → keep it in state (used for the Drive filename & email)
    el.docNumber.addEventListener("input", () => {
      state.docNumber = el.docNumber.textContent;
      state.numberEdited = true;
    });

    // Single-line editable fields (number, dates, customer name): Enter commits,
    // doesn't insert a newline
    document.addEventListener("keydown", (e) => {
      const t = e.target;
      if (e.key === "Enter" && t && t.classList && t.classList.contains("inv__edit--line")) {
        e.preventDefault();
        if (typeof t.blur === "function") t.blur();
      }
    });

    // Meta selectors
    el.docTypeSelect.addEventListener("change", (e) => {
      state.docType = e.target.value;
      applyDocType();
    });
    el.currencySelect.addEventListener("change", (e) => {
      state.currency = e.target.value;
      applyCurrency();
    });
    el.statusSelect.addEventListener("change", (e) => {
      state.status = e.target.value;
      applyStatus();
    });

    // Actions
    el.btnDrive.addEventListener("click", saveToDrive);
    el.btnDownload.addEventListener("click", downloadPdf);
    el.btnPrint.addEventListener("click", printInvoice);
    el.btnEmail.addEventListener("click", sendEmail);
    el.btnShare.addEventListener("click", shareInvoice);

    // Theme
    el.themeToggle.addEventListener("click", toggleTheme);

    // Keyboard: Ctrl/Cmd+P prints, Ctrl/Cmd+Enter adds a row
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        addItem();
      }
    });
  }

  /** Boot the application. */
  function init() {
    cacheDom();

    // Seed line items with the sample data
    state.items = SEED_ITEMS.map((it) => Object.assign({ id: state.nextId++ }, it));
    // Seed default legal / payment terms (editable / removable)
    state.paymentTerms = SEED_TERMS.map((text) => ({ id: state.nextTermId++, text: text }));
    // Amount Paid defaults to the full total (fully paid) until the user edits it
    state.paidEdited = false;

    // Mirror the current state into the dropdowns (keeps UI + state in sync)
    el.currencySelect.value = state.currency;
    el.docTypeSelect.value = state.docType;
    el.statusSelect.value = state.status;

    initTheme();
    initDates();
    applyDocType();
    applyCurrency();   // also triggers the first recalculate()
    applyStatus();
    renderItems();
    renderTerms();
    bindEvents();
    initGoogle();      // no-op until a real Client ID is configured
  }

  // Kick off once the DOM is parsed
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
