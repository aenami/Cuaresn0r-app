"""Genera los formatos en blanco para diligenciar a mano; requiere reportlab."""
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "output" / "pdf" / "CONTINGENCIA_POS.pdf"
FONT_DIR = Path("C:/Windows/Fonts")
if (FONT_DIR / "calibri.ttf").exists():
    pdfmetrics.registerFont(TTFont("Form", str(FONT_DIR / "calibri.ttf")))
    pdfmetrics.registerFont(TTFont("FormBold", str(FONT_DIR / "calibrib.ttf")))
else:
    pdfmetrics.registerFont(pdfmetrics.Font("Form", "Helvetica", "WinAnsiEncoding"))
    pdfmetrics.registerFont(pdfmetrics.Font("FormBold", "Helvetica-Bold", "WinAnsiEncoding"))

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
C = canvas.Canvas(str(OUTPUT), pagesize=A4)
C.setTitle("Contingencia POS - formatos manuales")
C.setAuthor("Cuaresnor")
W, H = A4
LEFT, RIGHT = 36, W - 36
WIDTH = RIGHT - LEFT
INK = colors.HexColor("#183E42")
GRAY = colors.HexColor("#60676B")
LINE = colors.HexColor("#8A9599")


def text(x, y, value, size=10, bold=False, color=INK):
    C.setFont("FormBold" if bold else "Form", size)
    C.setFillColor(color)
    C.drawString(x, y, value)


def line(x1, y1, x2, y2):
    C.setStrokeColor(LINE)
    C.setLineWidth(0.5)
    C.line(x1, y1, x2, y2)


def field(x, y, label, width):
    text(x, y, label, 9, color=GRAY)
    line(x, y - 22, x + width, y - 22)


def check(x, y, label):
    C.setStrokeColor(INK)
    C.rect(x, y - 2, 8, 8)
    text(x + 13, y, label, 9)


def section(y, title):
    text(LEFT, y, title, 12, bold=True)
    line(LEFT, y - 8, RIGHT, y - 8)


def table(y, labels, widths, rows, row_height=29):
    assert abs(sum(widths) - WIDTH) < 0.1
    top = y
    C.setFillColor(colors.HexColor("#ECF1F1"))
    C.rect(LEFT, top - 28, WIDTH, 28, fill=1, stroke=0)
    x = LEFT
    for label, width in zip(labels, widths):
        parts = label.split("\n")
        for i, part in enumerate(parts):
            text(x + 5, top - 11 - i * 10, part, 8, bold=True)
        x += width
    bottom = top - 28 - row_height * rows
    x = LEFT
    for width in [0] + widths:
        x += width
        line(x, top, x, bottom)
    for i in range(rows + 1):
        line(LEFT, top - 28 - i * row_height, RIGHT, top - 28 - i * row_height)
    line(LEFT, top, RIGHT, top)
    return bottom


def header(number, title, subtitle):
    text(LEFT, H - 42, "CUARESNOR / CONTINGENCIA MANUAL", 9, bold=True)
    text(LEFT, H - 73, title, 24, bold=True)
    text(LEFT, H - 92, subtitle, 10, color=GRAY)
    line(LEFT, 38, RIGHT, 38)
    text(LEFT, 24, "Formato en blanco - conservar junto con la guía de contingencia / 10-10-2026", 8, color=GRAY)
    C.setFont("Form", 8)
    C.drawRightString(RIGHT, 24, f"{number} / 3")


header(1, "Pedido de Restaurante", "Un folio por pedido. Las adiciones conservan el folio e indican su ronda.")
field(LEFT, 724, "Folio REST-AAAAMMDD-0001", 245)
field(LEFT + 270, 724, "Fecha / hora / turno", WIDTH - 270)
field(LEFT, 674, "Cajero / responsable", 245)
field(LEFT + 270, 674, "Ficha (opcional al autorizar) / ronda", WIDTH - 270)
section(616, "Productos y entregas")
table(594, ["Cuenta /\ncliente", "Producto / opciones / observaciones", "Cant.", "Precio\nunitario", "Subtotal", "Enviado\nhora", "Entregado\nhora"],
      [57, 171, 32, 65, 64, 67, WIDTH - 456], 8, 30)
text(LEFT, 308, "Ejecutivo: indicar caldo, principio y proteína. Bandeja: sin caldo.", 9, color=GRAY)
field(LEFT, 284, "Total pedido $", 145)
field(LEFT + 175, 284, "Pagado confirmado $", 145)
field(LEFT + 350, 284, "Saldo pendiente $", WIDTH - 350)
field(LEFT, 233, "Efectivo aplicado $", 145)
field(LEFT + 175, 233, "Nequi / transferencia $", 145)
field(LEFT + 350, 233, "Tarjeta $", WIDTH - 350)
check(LEFT, 181, "Pago previo confirmado")
check(LEFT + 210, 181, "Autorizado preparar sin pago total")
field(LEFT, 158, "Autorizó (cajero / admin local)", 245)
field(LEFT + 270, 158, "Digital pendiente de verificar $", WIDTH - 270)
field(LEFT, 106, "Pan compartido: reserva / entrega y folio remisión", WIDTH)
check(LEFT, 57, "POS por verificar")
check(LEFT + 155, 57, "Anulado (conservar hoja)")
check(LEFT + 337, 57, "Vinculado al registro de control")
C.showPage()

header(2, "Venta de Panadería", "Un folio por venta. No mezclar remisiones, hornadas o mermas con ventas.")
field(LEFT, 724, "Folio PAN-AAAAMMDD-0001", 245)
field(LEFT + 270, 724, "Fecha / hora / turno", WIDTH - 270)
field(LEFT, 674, "Cajero / responsable", WIDTH)
section(616, "Productos vendidos")
table(594, ["Producto de catálogo / observaciones", "Cantidad", "Precio unitario $", "Total $"],
      [245, 62, 110, WIDTH - 417], 6, 30)
field(LEFT, 362, "Total venta $", 145)
field(LEFT + 175, 362, "Efectivo aplicado $", 145)
field(LEFT + 350, 362, "Digital / tarjeta $", WIDTH - 350)
field(LEFT, 310, "Efectivo recibido $", 145)
field(LEFT + 175, 310, "Cambio entregado $", 145)
field(LEFT + 350, 310, "Digital por verificar $", WIDTH - 350)
section(251, "Movimientos físicos (no son ventas al público)")
table(229, ["Hora / tipo / folio\nhornada, proveedor, merma, remisión", "Artículo / motivo / destino", "Cant. /\nunidad", "Responsable"],
      [190, 172, 70, WIDTH - 432], 4, 29)
text(LEFT, 68, "Registre la receta / soporte por separado. Use el mismo folio de remisión en ambas áreas.", 9, color=GRAY)
check(LEFT, 50, "POS por verificar")
check(LEFT + 165, 50, "Anulado (conservar hoja)")
check(LEFT + 350, 50, "Control completado")
C.showPage()

header(3, "Control y conciliación", "Por área y turno. Este control evita volver a registrar o cobrar un mismo folio.")
field(LEFT, 724, "Área / fecha / turno / responsable", WIDTH)
field(LEFT, 674, "Hora inicio y retorno de Internet", 245)
field(LEFT + 270, 674, "Última operación confirmada POS (ID)", WIDTH - 270)
section(616, "Seguimiento de folios")
table(594, ["Folio manual", "ID POS", "Total $", "Efectivo $", "Digital /\ntarjeta $", "Saldo $", "Estado* /\nrevisor"],
      [108, 62, 62, 62, 72, 56, WIDTH - 422], 8, 29)
text(LEFT, 318, "* Ya existe / pendiente / anulado / revisar / conciliado. Digital sin verificar sigue pendiente.", 9, color=GRAY)
section(291, "Cierre provisional y comprobaciones")
field(LEFT, 268, "Base recibida $ (no es venta)", 245)
field(LEFT + 270, 268, "Efectivo contado con base $", WIDTH - 270)
field(LEFT, 216, "Ventas confirmadas: efectivo / digital $", 245)
field(LEFT + 270, 216, "Egresos / retiros: efectivo / digital $", WIDTH - 270)
check(LEFT, 161, "Folios e IDs sin duplicados")
check(LEFT + 260, 161, "Pagos y saldos verificados")
check(LEFT, 141, "Hornadas / remisiones sin duplicados")
check(LEFT + 260, 141, "Conteo e inconsistencias revisados")
field(LEFT, 116, "Pendientes / diferencias (anexar soportes)", WIDTH)
field(LEFT, 65, "Firma cajero", 245)
field(LEFT + 270, 65, "Firma administrador local", WIDTH - 270)
C.showPage()
C.save()
print(f"PDF generado: {OUTPUT}")
