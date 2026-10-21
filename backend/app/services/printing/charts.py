from reportlab.graphics.charts.barcharts import HorizontalBarChart, VerticalBarChart
from reportlab.graphics.charts.lineplots import LinePlot
from reportlab.graphics.charts.piecharts import Pie
from reportlab.graphics.shapes import Drawing, Rect, String
from reportlab.lib.colors import HexColor

ORDER = ["orange", "blue", "teal", "amber", "rose", "green", "cyan", "pink", "violet", "gray"]


def _palette(series: list[dict], colors: dict[str, str]) -> list[str]:
    return [colors.get(str(s.get("color") or ""), colors[ORDER[i % len(ORDER)]]) for i, s in enumerate(series)]


def chart_flowable(block: dict, avail: float, colors: dict[str, str]):
    kind = str(block.get("kind") or "")
    data = block.get("data") or {}
    cats = [str(c) for c in data.get("categories") or []]
    series = [s for s in data.get("series") or [] if isinstance(s, dict)]
    if kind not in ("bar", "hbar", "line", "area", "donut") or not cats or not series:
        return None
    width = min(float(block.get("width") or 400), avail)
    height = float(block.get("height") or 220)
    d = Drawing(width, height)
    title = str(block.get("title") or "")
    top = 18 if title else 4
    if title:
        d.add(String(width / 2, height - 12, title, textAnchor="middle", fontName="Helvetica-Bold", fontSize=10))
    pal = _palette(series, colors)
    values = [[float(v) if isinstance(v, (int, float)) else 0.0 for v in (s.get("values") or [])] + [0.0] * len(cats) for s in series]
    values = [v[:len(cats)] for v in values]
    legend_h = 14 if len(series) > 1 else 0
    if kind == "donut":
        pie = Pie()
        side = min(width, height - top) - 16
        pie.x, pie.y, pie.width, pie.height = (width - side) / 2, 6, side, side
        pie.data = [abs(v) for v in values[0]] or [1]
        pie.labels = cats
        pie.sideLabels = 0
        pie.slices.strokeWidth = 0.5
        pie.slices.strokeColor = HexColor("#ffffff")
        pie.slices.fontSize = 7
        for i in range(len(cats)):
            pie.slices[i].fillColor = HexColor(colors[ORDER[i % len(ORDER)]])
        d.add(pie)
    elif kind in ("line", "area"):
        plot = LinePlot()
        plot.x, plot.y, plot.width, plot.height = 40, 24 + legend_h, width - 56, height - top - 34 - legend_h
        plot.data = [[(i, v) for i, v in enumerate(row)] for row in values]
        for i, col in enumerate(pal):
            plot.lines[i].strokeColor = HexColor(col)
            plot.lines[i].strokeWidth = 1.5
        plot.xValueAxis.valueMin, plot.xValueAxis.valueMax = 0, max(len(cats) - 1, 1)
        plot.xValueAxis.valueSteps = list(range(len(cats)))
        plot.xValueAxis.labelTextFormat = lambda v: cats[int(round(v))] if 0 <= int(round(v)) < len(cats) else ""
        plot.xValueAxis.labels.fontSize = 7
        plot.yValueAxis.labels.fontSize = 7
        d.add(plot)
    else:
        chart = HorizontalBarChart() if kind == "hbar" else VerticalBarChart()
        chart.x, chart.y, chart.width, chart.height = 44, 24 + legend_h, width - 60, height - top - 34 - legend_h
        chart.data = values
        chart.categoryAxis.categoryNames = cats
        chart.categoryAxis.labels.fontSize = 7
        chart.valueAxis.labels.fontSize = 7
        chart.bars.strokeWidth = 0
        chart.bars.strokeColor = None
        chart.valueAxis.valueMin = 0
        chart.groupSpacing = 8
        chart.categoryAxis.style = "stacked" if (block.get("options") or {}).get("stacked") else "parallel"
        for i, col in enumerate(pal):
            chart.bars[i].fillColor = HexColor(col)
        d.add(chart)
    if legend_h and kind != "donut":
        x = 44
        for name, col in zip([str(s.get("name", "")) for s in series], pal):
            d.add(Rect(x, 6, 7, 7, fillColor=HexColor(col), strokeWidth=0))
            d.add(String(x + 10, 6, name, fontName="Helvetica", fontSize=7))
            x += 24 + 4.2 * len(name)
    return d
