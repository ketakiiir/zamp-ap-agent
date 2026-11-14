"""Generate the 7 fictional test documents into public/samples.

Clean documents: HTML printed to PDF by headless Chrome (real text layer).
Scanned document: HTML screenshotted, then skewed, blurred and speckled with
Pillow and saved as an image-only PDF, so there is no text layer at all and
the vision path is exercised for real.

Run: python3 scripts/make_samples.py
"""
import os
import random
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT = Path(__file__).resolve().parent.parent / "public" / "samples"
OUT.mkdir(parents=True, exist_ok=True)

BUYER = "Meadowgate Provisions<br>Attn: Accounts Payable<br>44 Orchard Row, Suite 300<br>Columbus, OH 43215"


def money(n):
    return f"{n:,.2f}"


def invoice_html(v, number, date, due, po, lines, accent, tax=0.0, note="", smudge=False, title="INVOICE", font="Helvetica"):
    rows = "".join(
        f"<tr><td>{d}</td><td class=r>{q:g}</td><td class=r>{money(u)}</td><td class=r>{money(q*u)}</td></tr>" for d, q, u in lines
    )
    sub = sum(q * u for _, q, u in lines)
    total = sub + tax
    num_html = f'<span class="smudge">{number}</span>' if smudge else number
    po_row = f"<tr><th>PO reference</th><td>{po}</td></tr>" if po else ""
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
    @page {{ size: Letter; margin: 0.6in; }}
    body {{ font-family: {font}, Arial, sans-serif; color:#1f2328; font-size: 12px; margin:0; }}
    .top {{ display:flex; justify-content:space-between; border-bottom: 3px solid {accent}; padding-bottom:14px; }}
    .brand {{ font-size: 22px; font-weight: 700; color: {accent}; }}
    .muted {{ color:#57606a; line-height:1.5 }}
    h1 {{ font-size: 26px; letter-spacing: 3px; margin: 0; color:#24292f; text-align:right }}
    table.meta {{ margin-top: 6px; border-collapse: collapse; float:right }}
    table.meta th {{ text-align:left; color:#57606a; font-weight:500; padding:2px 12px 2px 0 }}
    table.meta td {{ text-align:right; font-weight:600 }}
    .billto {{ margin-top: 22px; display:flex; justify-content:space-between }}
    table.lines {{ width:100%; border-collapse: collapse; margin-top: 26px }}
    table.lines th {{ background: {accent}; color:#fff; text-align:left; padding:7px; font-weight:600 }}
    table.lines td {{ padding:7px; border-bottom: 1px solid #d0d7de }}
    .r {{ text-align:right }}
    .totals {{ width: 280px; margin-left:auto; margin-top: 14px; border-collapse: collapse }}
    .totals td {{ padding: 4px 7px }}
    .totals tr.grand td {{ border-top: 2px solid #24292f; font-size: 15px; font-weight: 700 }}
    .foot {{ margin-top: 36px; font-size: 11px; color:#57606a; border-top: 1px solid #d0d7de; padding-top: 10px }}
    .smudge {{ position: relative; display:inline-block; filter: blur(3.2px); }}
    .smudge::after {{ content:""; position:absolute; left:-10px; top:-7px; width:110px; height:30px; border-radius:50%;
      background: radial-gradient(ellipse at center, rgba(70,50,30,.85) 0%, rgba(90,70,40,.6) 45%, rgba(120,100,60,0) 75%); }}
    </style></head><body>
    <div class="top">
      <div><div class="brand">{v['name']}</div><div class="muted">{v['addr']}<br>Tax ID {v['tax']} · {v['email']}</div></div>
      <div><h1>{title}</h1><table class="meta">
        <tr><th>Invoice no.</th><td>{num_html}</td></tr>
        <tr><th>Invoice date</th><td>{date}</td></tr>
        <tr><th>Due date</th><td>{due}</td></tr>
        {po_row}
      </table></div>
    </div>
    <div class="billto"><div><div class="muted" style="font-weight:600;color:#24292f">Bill to</div><div class="muted">{BUYER}</div></div>
      <div class="muted" style="text-align:right;max-width:260px">{note}</div></div>
    <table class="lines"><tr><th>Description</th><th class=r>Qty</th><th class=r>Unit price (USD)</th><th class=r>Amount (USD)</th></tr>{rows}</table>
    <table class="totals">
      <tr><td>Subtotal</td><td class=r>{money(sub)}</td></tr>
      <tr><td>Sales tax</td><td class=r>{money(tax)}</td></tr>
      <tr class="grand"><td>Total due</td><td class=r>USD {money(total)}</td></tr>
    </table>
    <div class="foot">Payment terms: Net 30. Remit by ACH to account ending 4417. Please quote the invoice number with payment.</div>
    </body></html>"""


def delivery_note_html(v, number, date, lines, accent):
    rows = "".join(f"<tr><td>{d}</td><td class=r>{q:g}</td><td>Received in good condition</td></tr>" for d, q, _ in lines)
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
    @page {{ size: Letter; margin: 0.6in; }}
    body {{ font-family: Helvetica, Arial, sans-serif; color:#1f2328; font-size: 12px; }}
    .brand {{ font-size: 22px; font-weight: 700; color: {accent}; }}
    h1 {{ font-size: 24px; letter-spacing: 2px; }}
    table {{ width:100%; border-collapse: collapse; margin-top: 20px }}
    th {{ background:#f6f8fa; text-align:left; padding:7px; border-bottom: 2px solid #24292f }}
    td {{ padding:7px; border-bottom: 1px solid #d0d7de }} .r {{ text-align:right }}
    .sig {{ margin-top: 60px; display:flex; gap: 60px }} .sig div {{ border-top: 1px solid #24292f; width: 220px; padding-top: 4px; color:#57606a }}
    </style></head><body>
    <div class="brand">{v['name']}</div><div style="color:#57606a">{v['addr']}</div>
    <h1>DELIVERY NOTE</h1>
    <p><b>Delivery note no.</b> {number} &nbsp; · &nbsp; <b>Delivered</b> {date} &nbsp; · &nbsp; <b>Order ref</b> PO-4501</p>
    <p><b>Deliver to:</b> Meadowgate Provisions, Dock 3, 1180 Industrial Pkwy, Columbus, OH 43219</p>
    <table><tr><th>Item</th><th class=r>Qty delivered</th><th>Condition</th></tr>{rows}</table>
    <p style="margin-top:18px;color:#57606a">This is not an invoice. An invoice will follow separately from our accounts team.</p>
    <div class="sig"><div>Driver signature</div><div>Received by (print and sign)</div></div>
    </body></html>"""


V = {
    "larkspur": dict(name="Larkspur Valley Produce LLC", addr="2290 County Road 14, Marysville, OH 43040", tax="84-2217731", email="billing@larkspurvalley.example"),
    "okafor": dict(name="Okafor &amp; Lindqvist Packaging", addr="71 Foundry Lane, Dayton, OH 45402", tax="61-5520943", email="accounts@olpack.example"),
    "brightwater": dict(name="Brightwater Cold Chain Inc", addr="9 Terminal Way, Indianapolis, IN 46241", tax="37-9048816", email="ar@brightwatercc.example"),
    "tamsin": dict(name="Tamsin Ridge Dairy Cooperative", addr="415 Creamery Road, Wooster, OH 44691", tax="52-1183467", email="invoices@tamsinridge.example"),
    "willowmere": dict(name="Willowmere Farms Ltd", addr="88 Holloway Pike, Circleville, OH 43113", tax="29-7765012", email="office@willowmere.example"),
    "kestrel": dict(name="Kestrel Kitchen Supply Co", addr="1500 Commerce Blvd, Grove City, OH 43123", tax="73-4406289", email="billing@kestrelkitchen.example"),
}

L = {
    "cleanA": [("Romaine hearts, 24 ct case", 120, 31.5), ("Roma tomatoes, 25 lb case", 90, 28.0), ("Yellow onions, 50 lb sack", 60, 22.0), ("Gala apples, 40 lb case", 80, 46.5)],
    "scanned": [("Hinged clamshell 9x9, compostable (case of 200)", 85, 41.0), ("Soup cup 16 oz with lid (case of 500)", 40, 68.0)],
    "split": [("Refrigerated linehaul, Columbus to Indianapolis, November loads", 1, 19400.0)],
    "duplicate": [("Whole milk, 1 gal (case of 4)", 480, 12.5), ("Low-fat yogurt cups 6 oz (case of 24)", 120, 22.0)],
    "noPo": [("Butternut squash, 35 lb case", 70, 27.0), ("Sweet potatoes, 40 lb case", 55, 33.0)],
    "cleanB": [("Half sheet pans, aluminium (pack of 12)", 15, 96.0), ("Food storage containers 22 qt", 40, 38.5), ("Cutting boards, colour coded set", 12, 78.0), ("Instant-read thermometers", 25, 26.5)],
}


def chrome(args):
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--hide-scrollbars", *args], check=True, capture_output=True)


def to_pdf(html, name, tmp):
    src = Path(tmp) / f"{name}.html"
    src.write_text(html)
    chrome([f"--print-to-pdf={OUT / name}", src.as_uri()])


def to_scan(html, name, tmp):
    src = Path(tmp) / f"{name}.html"
    src.write_text(html.replace("@page { size: Letter; margin: 0.6in; }", "").replace("<body>", '<body style="padding:48px;width:720px">'))
    png = Path(tmp) / f"{name}.png"
    chrome(["--window-size=816,1056", "--force-device-scale-factor=1.6", f"--screenshot={png}", src.as_uri()])
    img = Image.open(png).convert("L")
    img = img.rotate(1.4, resample=Image.BICUBIC, expand=True, fillcolor=245)
    img = img.filter(ImageFilter.GaussianBlur(0.7))
    random.seed(7)
    px = img.load()
    w, h = img.size
    for _ in range(int(w * h * 0.004)):
        x, y = random.randrange(w), random.randrange(h)
        px[x, y] = random.choice([60, 90, 200])
    img = ImageOps.autocontrast(img, cutoff=1)
    img = img.point(lambda p: int(p * 0.93 + 10))  # dull the whites like a photocopy
    img.convert("RGB").save(OUT / name, "PDF", resolution=150)


with tempfile.TemporaryDirectory() as tmp:
    to_pdf(invoice_html(V["larkspur"], "LVP-30417", "10 November 2026", "10 December 2026", "PO-4501", L["cleanA"], "#2f7d32"), "01-clean-invoice-A.pdf", tmp)
    to_scan(invoice_html(V["okafor"], "OLP-88213", "Nov 8, 2026", "Dec 8, 2026", "PO-4502", L["scanned"], "#444c56", smudge=True, font="Georgia"), "02-scanned-unreadable-number.pdf", tmp)
    to_pdf(invoice_html(V["brightwater"], "BWC-10452", "2026-11-12", "2026-12-12", "PO-4503", L["split"], "#0b5cad",
                        note="Final billing on PO-4503 (40%). The first 60% was billed on BWC-10388."), "03-split-po-40pct.pdf", tmp)
    to_pdf(invoice_html(V["tamsin"], "TRD-2304", "November 5, 2026", "December 5, 2026", "PO-4504", L["duplicate"], "#8a4b08"), "04-duplicate-new-number.pdf", tmp)
    to_pdf(invoice_html(V["willowmere"], "WMF-5521", "11 Nov 2026", "11 Dec 2026", "PO-7781", L["noPo"], "#6e4c9e"), "05-no-matching-po.pdf", tmp)
    to_pdf(delivery_note_html(V["larkspur"], "DN-77120", "9 November 2026", L["cleanA"], "#2f7d32"), "06-delivery-note.pdf", tmp)
    to_pdf(invoice_html(V["kestrel"], "KKS-2026-0193", "13 November 2026", "13 December 2026", "PO-4506", L["cleanB"], "#b42318"), "07-clean-invoice-B.pdf", tmp)

for f in sorted(os.listdir(OUT)):
    print(f, os.path.getsize(OUT / f))
