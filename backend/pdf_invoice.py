"""PDF invoice generator using reportlab."""
import io
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
)


PRIMARY = HexColor("#0055FF")
MUTED = HexColor("#6B7280")
BORDER = HexColor("#E5E7EB")
DARK = HexColor("#0A0A0A")


def _fmt_money(n, currency="INR"):
    sym = "₹" if currency == "INR" else currency + " "
    return f"{sym}{n:,.2f}"


def build_invoice_pdf(bill: dict, business: dict, outlet: dict | None = None) -> bytes:
    """Returns a PDF as bytes."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=18 * mm, bottomMargin=18 * mm,
    )
    story = []
    styles = getSampleStyleSheet()
    currency = business.get("currency", "INR")

    # Custom styles
    h_brand = ParagraphStyle(
        "brand", parent=styles["Normal"],
        fontName="Helvetica-Bold", fontSize=22, textColor=DARK, leading=24,
    )
    label = ParagraphStyle(
        "label", parent=styles["Normal"],
        fontName="Helvetica", fontSize=7, textColor=MUTED, leading=10,
        spaceAfter=2,
    )
    value = ParagraphStyle(
        "value", parent=styles["Normal"],
        fontName="Helvetica-Bold", fontSize=10, textColor=DARK, leading=14,
    )
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8, textColor=MUTED)
    rt = ParagraphStyle("rt", parent=styles["Normal"], fontSize=9, alignment=TA_RIGHT, textColor=DARK)

    # ---- Header ----
    header_data = [[
        Paragraph(f"<b>{business.get('business_name', 'Business')}</b>", h_brand),
        Paragraph(f"<font color='#0055FF'><b>INVOICE</b></font><br/><font color='#6B7280' size='8'>{bill.get('bill_no', '')}</font>", ParagraphStyle("inv_no", parent=styles["Normal"], alignment=TA_RIGHT, fontSize=18, textColor=PRIMARY, leading=20)),
    ]]
    header_tbl = Table(header_data, colWidths=[100 * mm, 60 * mm])
    header_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(header_tbl)

    # Business info bar
    biz_info = (
        f"{business.get('address', '') or ''}<br/>"
        f"{business.get('phone', '') or ''}"
        + (f" · GST: {business.get('gst_number', '')}" if business.get("gst_number") else "")
    )
    story.append(Paragraph(biz_info, small))
    story.append(Spacer(1, 14))

    # Divider
    story.append(Table([[""]], colWidths=[174 * mm], rowHeights=[1], style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PRIMARY),
    ])))
    story.append(Spacer(1, 14))

    # ---- Customer / Meta Info ----
    bill_date = (bill.get("created_at") or "")[:19].replace("T", " ")
    meta_data = [
        [
            Paragraph("BILLED TO", label),
            Paragraph("OUTLET", label),
            Paragraph("DATE", label),
            Paragraph("PAYMENT", label),
        ],
        [
            Paragraph(f"<b>{bill.get('customer_name', 'Walk-in')}</b>"
                      + (f"<br/><font size='8' color='#6B7280'>{bill.get('customer_phone')}</font>" if bill.get("customer_phone") else ""), value),
            Paragraph(f"<b>{outlet['name'] if outlet else '-'}</b>"
                      + (f"<br/><font size='8' color='#6B7280'>{outlet.get('address', '')}</font>" if outlet else ""), value),
            Paragraph(f"<b>{bill_date}</b>", value),
            Paragraph(f"<b>{bill.get('payment_method', 'cash').upper()}</b>", value),
        ],
    ]
    meta_tbl = Table(meta_data, colWidths=[50 * mm, 50 * mm, 40 * mm, 34 * mm])
    meta_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 4),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 12),
    ]))
    story.append(meta_tbl)
    story.append(Spacer(1, 6))

    # ---- Items table ----
    items_data = [["#", "Item", "SKU", "Qty", "Unit Price", "Tax", "Total"]]
    for i, it in enumerate(bill.get("items", []), 1):
        items_data.append([
            str(i),
            it.get("product_name", ""),
            it.get("sku", "") or "-",
            str(it.get("quantity", 0)),
            _fmt_money(it.get("unit_price", 0), currency),
            f"{it.get('tax_percent', 0)}%",
            _fmt_money(it.get("line_total", 0) + it.get("tax_amount", 0), currency),
        ])

    items_tbl = Table(items_data, colWidths=[10 * mm, 60 * mm, 25 * mm, 14 * mm, 25 * mm, 14 * mm, 26 * mm], repeatRows=1)
    items_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), DARK),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LINEBELOW", (0, 1), (-1, -2), 0.5, BORDER),
        ("LINEBELOW", (0, -1), (-1, -1), 0.5, BORDER),
    ]))
    story.append(items_tbl)
    story.append(Spacer(1, 12))

    # ---- Totals ----
    subtotal = bill.get("subtotal", 0)
    tax_total = bill.get("tax_total", 0)
    disc = bill.get("discount_total", 0)
    redeem = bill.get("redeem_value", 0)
    total = bill.get("total", 0)

    totals_rows = [
        ["Subtotal", _fmt_money(subtotal, currency)],
        ["Tax", _fmt_money(tax_total, currency)],
    ]
    if disc:
        totals_rows.append(["Discount", f"-{_fmt_money(disc, currency)}"])
    if redeem:
        totals_rows.append([f"Reward redeem ({bill.get('redeem_points', 0)} pts)", f"-{_fmt_money(redeem, currency)}"])
    totals_rows.append(["", ""])  # spacer
    totals_rows.append(["GRAND TOTAL", _fmt_money(total, currency)])

    totals_tbl = Table(totals_rows, colWidths=[40 * mm, 36 * mm], hAlign="RIGHT")
    totals_tbl.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -2), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (0, -2), MUTED),
        ("ALIGN", (-1, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, -1), (-1, -1), 13),
        ("TEXTCOLOR", (0, -1), (-1, -1), PRIMARY),
        ("LINEABOVE", (0, -1), (-1, -1), 1, DARK),
        ("TOPPADDING", (0, -1), (-1, -1), 8),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 8),
    ]))
    story.append(totals_tbl)
    story.append(Spacer(1, 18))

    # ---- Rewards earned ----
    if bill.get("reward_points_earned", 0) > 0:
        rw_tbl = Table([[
            Paragraph(f"<font color='#10B981'><b>🎁 {bill['reward_points_earned']} reward points earned</b></font>",
                      ParagraphStyle("rw", parent=styles["Normal"], fontSize=10, leading=14))
        ]], colWidths=[174 * mm])
        rw_tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), HexColor("#ECFDF5")),
            ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#10B981")),
            ("TOPPADDING", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ]))
        story.append(rw_tbl)
        story.append(Spacer(1, 12))

    # ---- Footer ----
    cashier = bill.get("cashier_name", "")
    footer_text = f"Served by <b>{cashier}</b> · Thank you for shopping with us!" if cashier else "Thank you for shopping with us!"
    story.append(Paragraph(
        f"<font color='#6B7280' size='8'>{footer_text}</font>",
        ParagraphStyle("ft", parent=styles["Normal"], alignment=TA_CENTER, fontSize=8),
    ))
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        f"<font color='#9CA3AF' size='7'>Generated on {datetime.now().strftime('%d %b %Y, %H:%M')} · RetailFlow AI</font>",
        ParagraphStyle("gen", parent=styles["Normal"], alignment=TA_CENTER, fontSize=7),
    ))

    doc.build(story)
    buf.seek(0)
    return buf.getvalue()
