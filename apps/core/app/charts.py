"""Chart builder — ECharts option JSON murni (tanpa fungsi JS; aman dilewatkan JSON/SSE).

Tema IDXMACA: biru=fokus, hijau/merah=arah, amber=warning, abu=peer/median (docs/INTENT-OUTPUT.md §7).
"""
from __future__ import annotations

import math
from typing import Any

FOCUS = "#1b4dd8"
ALT = "#15803d"
WARN = "#b45309"
RED = "#b91c1c"
GREY = "#94a3b8"
INK = "#1f1f1f"
MUTED = "#747775"
LINE = "#e3e3e3"
FONT = "Roboto, 'Google Sans', Arial, sans-serif"
PALETTE = [FOCUS, ALT, WARN, "#7c3aed", "#0891b2", RED]


def num(v: float | None, digits: int = 1) -> str:
    if v is None:
        return "—"
    s = f"{v:,.{digits}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def _base(*, legend: bool = False, grid: dict | None = None) -> dict[str, Any]:
    return {
        "color": PALETTE,
        "textStyle": {"fontFamily": FONT, "color": INK},
        "animationDuration": 450,
        "tooltip": {"trigger": "axis", "backgroundColor": "#ffffff", "borderColor": LINE, "borderWidth": 1,
                    "textStyle": {"color": INK, "fontSize": 12}},
        "grid": grid if grid is not None else {"left": 54, "right": 64, "top": 26, "bottom": 44, "containLabel": True},
        "legend": ({"bottom": 0, "icon": "roundRect", "itemWidth": 10, "itemHeight": 10,
                    "textStyle": {"color": MUTED, "fontSize": 11}} if legend else {"show": False}),
    }


def line(x: list[str], series: list[dict], *, y_name: str | None = None, y_min: float | None = None,
         y_max: float | None = None, band: tuple[float, float] | None = None, band_label: str | None = None,
         end_label: bool = True, height: int = 280, smooth: bool = True, suffix: str = "",
         markers: list[dict] | None = None, area: bool = False, x_interval: int | None = None) -> dict:
    opt = _base(legend=len(series) > 1, grid={"left": 54, "right": 86, "top": 26, "bottom": 46, "containLabel": True})
    prepared: list[dict] = []
    for s in series:
        item = {**s}
        item.setdefault("type", "line")
        item.setdefault("smooth", smooth)
        item.setdefault("symbolSize", 5)
        item.setdefault("connectNulls", True)
        item["emphasis"] = {"focus": "series"}
        if end_label:
            item.setdefault("endLabel", {"show": True, "fontSize": 11, "fontWeight": "bold",
                                         "formatter": f"{item.get('name', '')} {{c}}{suffix}"})
        if area:
            item.setdefault("areaStyle", {"opacity": 0.08})
        prepared.append(item)
    if band:
        prepared.insert(0, {
            "name": band_label or "band", "type": "line", "data": [band[0]] * len(x), "symbol": "none",
            "lineStyle": {"type": "dashed", "color": GREY, "width": 1.4}, "silent": True, "tooltip": {"show": False},
            "markArea": {"silent": True, "itemStyle": {"color": "rgba(27,77,216,0.08)"},
                         "label": {"show": bool(band_label), "position": "insideTop", "color": MUTED, "fontSize": 10,
                                   "formatter": band_label or ""},
                         "data": [[{"yAxis": band[0]}, {"yAxis": band[1]}]]},
        })
    if markers and prepared:
        prepared[-1].setdefault("markPoint", {
            "symbol": "circle", "symbolSize": 22,
            "label": {"fontSize": 10, "fontWeight": "bold", "color": "#fff", "formatter": "{b}"},
            "data": markers,
        })
    opt["series"] = prepared
    opt["xAxis"] = {"type": "category", "data": x, "boundaryGap": False,
                    "axisLabel": {"color": MUTED, "fontSize": 10, "interval": (x_interval if x_interval is not None else "auto")},
                    "axisLine": {"lineStyle": {"color": LINE}}, "axisTick": {"show": False}}
    opt["yAxis"] = {"type": "value", "name": y_name, "nameTextStyle": {"color": MUTED, "fontSize": 10},
                    "min": y_min, "max": y_max,
                    "axisLabel": {"color": MUTED, "fontSize": 10, "formatter": "{value}" + suffix},
                    "splitLine": {"lineStyle": {"color": "#f1f3f4"}}}
    opt["_height"] = height
    return opt


def combo_bar_line(x: list[str], bars: dict, line_series: dict, *, suffix_bar: str = "", suffix_line: str = "",
                   y_left: str | None = None, y_right: str | None = None, height: int = 300) -> dict:
    opt = _base(legend=True, grid={"left": 62, "right": 74, "top": 30, "bottom": 52, "containLabel": True})
    opt["xAxis"] = {"type": "category", "data": x, "axisLabel": {"color": MUTED, "fontSize": 10},
                    "axisLine": {"lineStyle": {"color": LINE}}, "axisTick": {"show": False}}
    opt["yAxis"] = [
        {"type": "value", "name": y_left, "nameTextStyle": {"color": MUTED, "fontSize": 10},
         "axisLabel": {"color": MUTED, "fontSize": 10, "formatter": "{value}" + suffix_bar},
         "splitLine": {"lineStyle": {"color": "#f1f3f4"}}},
        {"type": "value", "name": y_right, "nameTextStyle": {"color": MUTED, "fontSize": 10},
         "axisLabel": {"color": MUTED, "fontSize": 10, "formatter": "{value}" + suffix_line},
         "splitLine": {"show": False}},
    ]
    bar = {"name": bars.get("name", "Nilai"), "type": "bar", "data": bars.get("data", []),
           "itemStyle": {"color": FOCUS, "borderRadius": [3, 3, 0, 0]}, "barMaxWidth": 26,
           "label": {"show": len(x) <= 10, "position": "top", "fontSize": 10, "fontWeight": "bold",
                     "color": "#33415c", "formatter": "{c}" + suffix_bar}}
    ln = {"name": line_series.get("name", "Rasio"), "type": "line", "yAxisIndex": 1, "smooth": True,
          "symbolSize": 5, "data": line_series.get("data", []), "color": ALT, "connectNulls": True,
          "endLabel": {"show": True, "fontSize": 11, "fontWeight": "bold",
                       "formatter": f"{line_series.get('name', '')} {{c}}{suffix_line}"}}
    opt["series"] = [bar, ln]
    opt["_height"] = height
    return opt


def bar(categories: list[str], values: list[float | None], *, name: str = "Nilai", horizontal: bool = False,
        suffix: str = "", threshold: float | None = None, color: str = FOCUS, height: int = 260,
        labels: bool = True, mark_names: list[str] | None = None) -> dict:
    opt = _base(grid={"left": 54, "right": 58, "top": 24, "bottom": 40, "containLabel": True})
    cat_axis = {"type": "category", "data": categories, "axisLabel": {"color": INK, "fontSize": 11, "interval": 0},
                "axisLine": {"lineStyle": {"color": LINE}}, "axisTick": {"show": False}}
    val_axis = {"type": "value", "axisLabel": {"color": MUTED, "fontSize": 10, "formatter": "{value}" + suffix},
                "splitLine": {"lineStyle": {"color": "#f1f3f4"}}}
    opt["xAxis"], opt["yAxis"] = (val_axis, cat_axis) if horizontal else (cat_axis, val_axis)
    data = values
    if mark_names:
        data = [{"value": v, "name": n} for v, n in zip(values, mark_names)]
    series: dict[str, Any] = {"name": name, "type": "bar", "data": data, "barMaxWidth": 26,
                              "itemStyle": {"color": color, "borderRadius": [3, 3, 0, 0] if not horizontal else [0, 3, 3, 0]}}
    if labels:
        series["label"] = {"show": True, "position": "right" if horizontal else "top", "fontSize": 11,
                           "fontWeight": "bold", "color": "#33415c", "formatter": "{c}" + suffix}
    if threshold is not None:
        series["markLine"] = {"silent": True, "symbol": "none",
                              "lineStyle": {"color": WARN, "type": "dashed", "width": 1.5},
                              "label": {"formatter": f"ambang {num(threshold)}{suffix}", "color": WARN, "fontSize": 10},
                              "data": [{"xAxis": threshold} if horizontal else {"yAxis": threshold}]}
    opt["series"] = [series]
    opt["_height"] = height
    return opt


def diverging_bar(categories: list[str], values: list[float | None], *, name: str = "Net", suffix: str = "",
                  height: int = 260, labels: bool = True) -> dict:
    opt = _base(legend=False, grid={"left": 58, "right": 62, "top": 20, "bottom": 40, "containLabel": True})
    opt["xAxis"] = {"type": "value", "axisLabel": {"color": MUTED, "fontSize": 10},
                    "splitLine": {"lineStyle": {"color": "#f1f3f4"}}}
    opt["yAxis"] = {"type": "category", "data": categories, "axisLabel": {"color": INK, "fontSize": 11, "interval": 0},
                    "axisLine": {"lineStyle": {"color": LINE}}, "axisTick": {"show": False}}
    data = []
    for v in values:
        positive = (v or 0) >= 0
        data.append({"value": v, "itemStyle": {"color": ALT if positive else RED,
                                               "borderRadius": [0, 3, 3, 0] if positive else [3, 0, 0, 3]},
                     "label": {"show": labels, "fontSize": 10, "fontWeight": "bold", "color": "#33415c",
                               "position": "right" if positive else "left",
                               "formatter": f"{{c}}{suffix}" if positive else f"{{c}}{suffix}"}})
    opt["series"] = [{"name": name, "type": "bar", "data": data, "barMaxWidth": 22}]
    opt["_height"] = height
    return opt


def stacked_bar(categories: list[str], series: list[dict], *, suffix: str = "%", height: int = 260,
                horizontal: bool = False) -> dict:
    opt = _base(legend=True, grid={"left": 54, "right": 62, "top": 24, "bottom": 52, "containLabel": True})
    cat_axis = {"type": "category", "data": categories, "axisLabel": {"color": INK, "fontSize": 11, "interval": 0},
                "axisLine": {"lineStyle": {"color": LINE}}, "axisTick": {"show": False}}
    val_axis = {"type": "value", "max": 100 if suffix == "%" else None,
                "axisLabel": {"color": MUTED, "fontSize": 10, "formatter": "{value}" + suffix},
                "splitLine": {"lineStyle": {"color": "#f1f3f4"}}}
    opt["xAxis"], opt["yAxis"] = (val_axis, cat_axis) if horizontal else (cat_axis, val_axis)
    out = []
    for s in series:
        out.append({**s, "type": "bar", "stack": "total", "barMaxWidth": 36,
                    "emphasis": {"focus": "series"},
                    "label": {"show": True, "fontSize": 10, "color": "#fff", "formatter": "{c}" + suffix}})
    opt["series"] = out
    opt["_height"] = height
    return opt


def donut(labels: list[str], values: list[float], *, height: int = 250, center: str | None = None,
          suffix: str = "%") -> dict:
    opt = _base(legend=True)
    opt.pop("grid", None)
    opt["tooltip"] = {"trigger": "item", "backgroundColor": "#ffffff", "borderColor": LINE,
                      "textStyle": {"color": INK, "fontSize": 12}, "formatter": "{b}: {c}" + suffix}
    series = {
        "type": "pie", "radius": ["58%", "82%"], "center": ["50%", "46%"],
        "itemStyle": {"borderColor": "#ffffff", "borderWidth": 2},
        "label": {"show": True, "formatter": "{b}\n{d}%", "fontSize": 11, "color": INK},
        "data": [{"name": l, "value": v} for l, v in zip(labels, values)],
    }
    if center:
        series["label"] = {"show": False}
        series["emphasis"] = {"label": {"show": False}}
        opt["graphic"] = [{"type": "text", "left": "center", "top": "40%",
                           "style": {"text": center, "fontSize": 13, "fontWeight": "bold", "fill": INK}}]
    opt["series"] = [series]
    opt["_height"] = height
    return opt


def gauge(value: float, *, label: str = "skor", max_value: float = 100, color: str | None = None,
          height: int = 200) -> dict:
    c = color or (ALT if value < 40 else WARN if value < 70 else RED)
    return {
        "textStyle": {"fontFamily": FONT},
        "tooltip": {"show": False},
        "series": [{
            "type": "gauge", "min": 0, "max": max_value, "startAngle": 200, "endAngle": -20,
            "radius": "100%", "center": ["50%", "62%"],
            "progress": {"show": True, "width": 16, "itemStyle": {"color": c}},
            "axisLine": {"lineStyle": {"width": 16, "color": [[1, "#eceff3"]]}},
            "axisTick": {"show": False}, "splitLine": {"show": False}, "axisLabel": {"show": False},
            "pointer": {"show": False}, "anchor": {"show": False},
            "title": {"show": True, "offsetCenter": [0, "34%"], "fontSize": 11, "color": MUTED},
            "detail": {"valueAnimation": True, "formatter": "{value}", "fontSize": 32, "fontWeight": "bold",
                       "color": c, "offsetCenter": [0, "-4%"]},
            "data": [{"value": round(value), "name": label}],
        }],
        "_height": height,
    }


def scatter(points: list[dict], *, x_name: str, y_name: str, height: int = 300,
            size_scale: float = 0.55, size_max: float = 42,
            y_max: float | None = None, x_max: float | None = None) -> dict:
    opt = _base(legend=False, grid={"left": 58, "right": 44, "top": 30, "bottom": 50, "containLabel": True})
    opt["tooltip"] = {"trigger": "item", "backgroundColor": "#ffffff", "borderColor": LINE,
                      "textStyle": {"color": INK, "fontSize": 12}, "formatter": "{b}"}
    data = []
    for p in points:
        size = p.get("size") or 1e12
        px = max(10.0, min(size_max, math.sqrt(max(size, 1) / 1e12) * size_scale))
        data.append({"name": f"{p.get('symbol')} · x {num(p.get('x'))} · y {num(p.get('y'))}",
                     "value": [p.get("x"), p.get("y"), p.get("size") or 0],
                     "symbolSize": round(px, 1),
                     "itemStyle": {"color": p.get("color", FOCUS), "opacity": 0.78}})
    opt["xAxis"] = {"type": "value", "name": x_name, "nameLocation": "middle", "nameGap": 28,
                    "nameTextStyle": {"color": MUTED, "fontSize": 10},
                    "axisLabel": {"color": MUTED, "fontSize": 10}, "splitLine": {"lineStyle": {"color": "#f1f3f4"}}}
    opt["yAxis"] = {"type": "value", "name": y_name, "nameTextStyle": {"color": MUTED, "fontSize": 10},
                    "max": y_max, "axisLabel": {"color": MUTED, "fontSize": 10},
                    "splitLine": {"lineStyle": {"color": "#f1f3f4"}}}
    if x_max is not None:
        opt["xAxis"]["max"] = x_max
    opt["series"] = [{"type": "scatter", "data": data, "clip": True}]
    opt["_height"] = height
    return opt


def heatmap2d(x_labels: list[str], y_labels: list[str], data: list[list], *, height: int = 280,
              suffix: str = "") -> dict:
    from . import charts as _self  # noqa: F401 - jaga kompatibilitas import lokal
    opt = _base(grid=None)
    opt.pop("grid", None)
    opt["tooltip"] = {"trigger": "item", "backgroundColor": "#ffffff", "borderColor": LINE,
                      "textStyle": {"color": INK, "fontSize": 12}, "formatter": "{b}"}
    opt["xAxis"] = {"type": "category", "data": x_labels,
                    "axisLabel": {"color": INK, "fontSize": 10, "interval": 0},
                    "axisLine": {"lineStyle": {"color": LINE}}, "axisTick": {"show": False}}
    opt["yAxis"] = {"type": "category", "data": y_labels,
                    "axisLabel": {"color": INK, "fontSize": 10, "interval": 0},
                    "axisLine": {"lineStyle": {"color": LINE}}, "axisTick": {"show": False}}
    flat = [d[2] for d in data] or [0]
    lo, hi = min(flat + [0.0]), max(flat + [0.0])
    opt["visualMap"] = {"min": round(lo, 2), "max": round(hi, 2), "show": False,
                        "inRange": {"color": [RED, "#f6f7f9", ALT]}}
    opt["series"] = [{"type": "heatmap", "data": data,
                      "label": {"show": True, "fontSize": 9, "color": INK,
                                "formatter": "{c}" + suffix},
                      "itemStyle": {"borderColor": "#ffffff", "borderWidth": 2, "borderRadius": 6}}]
    opt["_height"] = height
    return opt


def sector_heatmap(labels: list[str], values: list[float], *, suffix: str = "%", height: int = 190) -> dict:
    opt = _base(grid=None)
    opt.pop("grid", None)
    opt["tooltip"] = {"trigger": "item", "backgroundColor": "#ffffff", "borderColor": LINE,
                      "textStyle": {"color": INK, "fontSize": 12}, "formatter": "{b}: {c}" + suffix}
    opt["xAxis"] = {"type": "category", "data": labels, "axisLabel": {"color": INK, "fontSize": 10, "interval": 0},
                    "axisLine": {"lineStyle": {"color": LINE}}, "axisTick": {"show": False}}
    opt["yAxis"] = {"type": "category", "data": ["perubahan"], "show": False}
    lo, hi = min(values + [0.0]), max(values + [0.0])
    opt["visualMap"] = {"min": round(lo, 2), "max": round(hi, 2), "show": False, "calculable": False,
                        "inRange": {"color": [RED, "#f6f7f9", ALT]}}
    opt["series"] = [{"type": "heatmap", "data": [[i, 0, v] for i, v in enumerate(values)],
                      "label": {"show": True, "fontSize": 10, "color": INK, "formatter": "{c}" + suffix},
                      "itemStyle": {"borderColor": "#ffffff", "borderWidth": 2, "borderRadius": 6}}]
    opt["_height"] = height
    return opt


def price_position(rows: list[dict], *, height: int = 200) -> dict:
    """Bar rentang 52 minggu + titik harga kini (bar+scatter, JSON murni — tanpa renderItem)."""
    symbols = [r["symbol"] for r in rows]
    low_min = min(r["low"] for r in rows) * 0.97
    high_max = max(r["high"] for r in rows) * 1.03
    opt = _base(legend=False, grid={"left": 60, "right": 40, "top": 24, "bottom": 40, "containLabel": True})
    opt["tooltip"] = {"trigger": "axis", "backgroundColor": "#ffffff", "borderColor": LINE,
                      "textStyle": {"color": INK, "fontSize": 12}}
    opt["xAxis"] = {"type": "value", "min": round(low_min, 1), "max": round(high_max, 1),
                    "axisLabel": {"color": MUTED, "fontSize": 10}, "splitLine": {"lineStyle": {"color": "#f1f3f4"}}}
    opt["yAxis"] = {"type": "category", "data": symbols, "axisLabel": {"color": INK, "fontSize": 11}}
    base = [{"value": r["low"], "itemStyle": {"color": "transparent"}, "tooltip": {"show": False}} for r in rows]
    span = [{"value": round(r["high"] - r["low"], 1),
             "itemStyle": {"color": "#d5dbe3", "borderRadius": 4}} for r in rows]
    opt["series"] = [
        {"type": "bar", "stack": "range", "data": base, "silent": True, "barMaxWidth": 14},
        {"type": "bar", "stack": "range", "data": span, "silent": True, "barMaxWidth": 14,
         "label": {"show": True, "position": "right", "fontSize": 10, "color": MUTED, "formatter": ""}},
        {"type": "scatter", "data": [{"value": [r["close"], r["symbol"]],
                                      "symbolSize": 14, "itemStyle": {"color": FOCUS},
                                      "label": {"show": True, "position": "top", "fontSize": 10,
                                                "fontWeight": "bold", "color": FOCUS,
                                                "formatter": str(round(r["position"], 0)) + "%"}} for r in rows],
         "symbolOffset": [0, 0]},
    ]
    opt["_height"] = height
    return opt


def tree_nodes(rows: list[dict], *, height: int = 240) -> dict:
    return {"_height": height, "_kind": "tree", "rows": rows}


def map_points(points: list[dict], *, height: int = 300) -> dict:
    return {"_height": height, "_kind": "map", "points": points}


def waterfall(labels: list[str], values: list[float], *, suffix: str = "%", height: int = 260) -> dict:
    opt = _base(grid={"left": 54, "right": 44, "top": 24, "bottom": 40, "containLabel": True})
    opt["xAxis"] = {"type": "category", "data": labels, "axisLabel": {"color": MUTED, "fontSize": 10, "interval": 0}}
    opt["yAxis"] = {"type": "value", "axisLabel": {"color": MUTED, "fontSize": 10, "formatter": "{value}" + suffix},
                    "splitLine": {"lineStyle": {"color": "#f1f3f4"}}}
    cumulative = 0.0
    helpers, deltas = [], []
    for v in values:
        helpers.append(round(cumulative, 2) if v >= 0 else round(cumulative + v, 2))
        deltas.append(abs(v))
        cumulative += v
    opt["series"] = [
        {"type": "bar", "stack": "w", "itemStyle": {"color": "transparent"}, "data": helpers, "silent": True},
        {"type": "bar", "stack": "w", "data": [{"value": d, "itemStyle": {"color": FOCUS if v >= 0 else RED}}
                                               for d, v in zip(deltas, values)], "barMaxWidth": 40,
         "label": {"show": True, "position": "top", "fontSize": 10, "formatter": "{c}" + suffix, "color": "#33415c"}},
    ]
    opt["_height"] = height
    return opt


def dot_plot(rows: list[dict], *, height: int = 260, suffix: str = "%") -> dict:
    opt = _base(legend=False, grid={"left": 70, "right": 70, "top": 24, "bottom": 44, "containLabel": True})
    opt["tooltip"] = {"trigger": "item", "backgroundColor": "#ffffff", "borderColor": LINE,
                      "textStyle": {"color": INK, "fontSize": 12}, "formatter": "{b}: {c}" + suffix}
    opt["xAxis"] = {"type": "value", "axisLabel": {"color": MUTED, "fontSize": 10, "formatter": "{value}" + suffix},
                    "splitLine": {"lineStyle": {"color": "#f1f3f4"}}}
    opt["yAxis"] = {"type": "category", "data": [r["label"] for r in rows],
                    "axisLabel": {"color": INK, "fontSize": 11}}
    opt["series"] = [{
        "type": "scatter",
        "data": [{"name": r["label"], "value": [r["value"], r["label"]], "symbolSize": 16,
                  "itemStyle": {"color": r.get("color", FOCUS)}} for r in rows if r.get("value") is not None],
        "label": {"show": True, "position": "right", "fontSize": 11, "fontWeight": "bold",
                  "formatter": "{@[0]}" + suffix, "color": "#33415c"},
    }]
    opt["_height"] = height
    return opt


def table(columns: list[dict], rows: list[dict], *, note: str | None = None) -> dict:
    return {"columns": columns, "rows": rows, "note": note}


def kpi(label: str, value: str, sub: str | None = None, tone: str = "neutral") -> dict:
    return {"label": label, "value": value, "sub": sub, "tone": tone}