"""Render a project's brand guide (design.html) from its design.json tokens and logo SVG."""

import html
import json
import sys
from pathlib import Path


def esc(value):
    return html.escape(str(value), quote=True)


ALIASES = {"Canvas": ["canvas", "bg"], "Group": ["group", "panel", "surface"], "Ink": ["ink", "text"],
           "Secondary": ["secondary", "muted"], "Tertiary": ["tertiary", "muted"], "Separator": ["separator", "border"],
           "Blue": ["blue", "accent", "gain"], "Blue-fill": ["action fill", "blue-fill", "blue", "accent", "gain"], "Green": ["green", "gain"], "Orange": ["orange", "amber"], "Red": ["red", "loss"]}


def normal(colors):
    return [{"name": c.get("name") or c["token"].title(), "hex": c["hex"], "role": c.get("role") or c.get("use", "")} for c in colors]


def palette_vars(colors, prefix=""):
    by_key = {c["name"].lower(): c["hex"] for c in colors}
    return {prefix + var: next((by_key[a] for a in names if a in by_key), "#888888") for var, names in ALIASES.items()}


def swatches(colors):
    return "".join(
        f'<figure class="swatch"><span style="background:{esc(c["hex"])}"></span>'
        f'<figcaption><b>{esc(c["name"])}</b><code>{esc(c["hex"])}</code><small>{esc(c.get("role", ""))}</small></figcaption></figure>'
        for c in colors)


def type_scale(scale):
    rows = []
    for t in scale:
        style = f'font-size:{t["size"]}px;font-weight:{t["weight"]};letter-spacing:{t.get("tracking", "normal")}'
        meta = f'{t["size"]} px · {t["weight"]}' + (f' · {t["tracking"]}' if t.get("tracking") else "")
        rows.append(f'<div class="type-row"><span style="{esc(style)}">{esc(t["role"])}</span><code>{esc(meta)}</code></div>')
    return "".join(rows)


def items(values):
    return "".join(f"<li>{esc(v)}</li>" for v in values)


def spacing(scale):
    return "".join(f'<div class="space"><span style="width:{int(v) * 4}px"></span><code>{esc(v)} px</code></div>' for v in scale)


def voice(v):
    examples = "".join(f'<div class="quote"><small>{esc(e["where"])}</small><p>“{esc(e["text"])}”</p></div>' for e in v.get("examples", []))
    return (f'<div class="cols"><div><h3>Tone</h3><ul>{items(as_list(v.get("tone")))}</ul></div>'
            f'<div><h3>Say</h3><ul>{items(v.get("use", []))}</ul></div>'
            f'<div><h3>Never</h3><ul>{items(v.get("avoid", []))}</ul></div></div><div class="quotes">{examples}</div>')


def mark_colors(mark):
    import re
    found = list(dict.fromkeys(c.upper() for c in re.findall(r'fill="(#[0-9A-Fa-f]{6})"', mark) if c.upper() != "#FFFFFF"))
    if not found:
        return ""
    chips = swatches([{"name": f"Mark {i + 1}", "hex": c, "role": "From the logo; for the mark only"} for i, c in enumerate(found)])
    return f'<div class="group"><h3>Mark</h3><div class="swatches">{chips}</div></div>'


def palette_groups(colors, colors_dark):
    if not colors_dark:
        return f'<div class="group"><h3>Palette</h3><div class="swatches">{swatches(colors)}</div></div>'
    return (f'<div class="group"><h3>Light</h3><div class="swatches">{swatches(colors)}</div></div>'
            f'<div class="group"><h3>Dark</h3><div class="swatches">{swatches(colors_dark)}</div></div>')


def radius_line(radius):
    return ", ".join(f"{k} {v if isinstance(v, str) else str(v) + ' px'}" for k, v in radius.items()) or "not recorded"


def font_line(fonts):
    parts = [f'{f.get("name") or f.get("family")} for {(f.get("use") or f.get("role") or "").lower()}' for f in fonts]
    return "; ".join(parts) + "."


def as_list(value):
    if isinstance(value, list):
        return value
    return [value] if value else []


def component_line(c):
    detail = c.get("rule") or ("States: " + ", ".join(c.get("states", [])))
    return f"<li><b>{esc(c['name'])}.</b> {esc(detail)}</li>"


def motion_items(m):
    tokens = m.get("tokens") if isinstance(m.get("tokens"), dict) else {}
    extra = [f"Hover and disclosure {tokens['hover']}"] if tokens.get("hover") else []
    return m.get("principles", []) + extra + as_list(m.get("reduceMotion"))


def logo_sizes(mark):
    return "".join(f'<figure class="icon-size"><span class="app-icon" style="width:{s}px;height:{s}px">{mark}</span><figcaption>{s} px</figcaption></figure>' for s in (22, 36, 56, 96))


CSS = """
:root{--canvas:%(Canvas)s;--group:%(Group)s;--ink:%(Ink)s;--secondary:%(Secondary)s;--tertiary:%(Tertiary)s;--separator:%(Separator)s;--blue:%(Blue)s;--blue-fill:%(Blue-fill)s;--green:%(Green)s;--orange:%(Orange)s;--red:%(Red)s;color-scheme:light dark}
%(dark)s
*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);font:14.5px/1.45 -apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",Inter,system-ui,sans-serif;letter-spacing:-.01em}
main{max-width:980px;margin:0 auto;padding:56px 40px 96px}code{font:12px "SF Mono",ui-monospace,Menlo,monospace;color:var(--secondary)}
.hero{display:flex;align-items:center;gap:24px;margin-bottom:56px}.hero .app-icon{width:96px;height:96px}
.hero h1{margin:0;font-size:40px;font-weight:600;letter-spacing:-.03em}.hero p{margin:6px 0 0;color:var(--secondary);font-size:17px;max-width:60ch}
section{margin-top:48px}section>h2{margin:0 0 4px;font-size:26px;font-weight:600;letter-spacing:-.022em}section>p.lede{margin:0 0 16px;color:var(--secondary);max-width:70ch}
.group{background:var(--group);border-radius:12px;padding:24px}.group+.group{margin-top:16px}h3{margin:0 0 8px;font-size:13px;font-weight:600;color:var(--secondary)}
ul{margin:0;padding-left:18px}li{margin:4px 0}.cols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}
.app-icon{display:inline-grid;place-items:center;border-radius:22%%;background:#fff;box-shadow:inset 0 0 0 .5px rgba(0,0,0,.12);overflow:hidden}.app-icon svg{width:100%%;height:100%%}
.logo-row{display:flex;align-items:end;gap:32px;flex-wrap:wrap}.icon-size{margin:0;text-align:center}.icon-size figcaption{margin-top:8px;font-size:12.5px;color:var(--tertiary)}
.on-dark{display:flex;align-items:center;gap:16px;margin-top:24px;padding:24px;border-radius:12px;background:#000;color:#f5f5f7;font-weight:600;font-size:17px}.on-dark .app-icon{width:56px;height:56px}
.swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px}.swatch{margin:0}.swatch span{display:block;height:72px;border-radius:12px;box-shadow:inset 0 0 0 .5px rgba(0,0,0,.12)}
.swatch figcaption{display:grid;gap:2px;margin-top:8px}.swatch b{font-weight:500}.swatch small{color:var(--tertiary);font-size:12px;line-height:1.35}
.type-row{display:flex;align-items:baseline;justify-content:space-between;gap:16px;padding:12px 0;border-top:.5px solid var(--separator)}.type-row:first-child{border-top:0;padding-top:0}
.space{display:flex;align-items:center;gap:16px;padding:6px 0}.space span{height:12px;border-radius:3px;background:var(--blue)}
.demo{display:flex;flex-wrap:wrap;align-items:center;gap:12px}.pill{min-height:36px;padding:0 18px;border:0;border-radius:980px;font-size:14px;font-weight:500;line-height:36px;font-family:inherit}
.pill.primary{background:var(--blue-fill);color:#fff}.pill.secondary{background:rgba(120,120,128,.14);color:var(--ink)}
.seg{display:inline-flex;padding:2px;border-radius:9px;background:rgba(120,120,128,.14)}.seg span{padding:0 16px;line-height:32px;border-radius:7px;font-weight:500;font-size:13px}.seg span.on{background:var(--group);box-shadow:0 1px 3px rgba(0,0,0,.12)}
.rows{margin-top:16px;border-radius:12px;background:var(--canvas);padding:0 16px}.rows div{display:flex;justify-content:space-between;padding:12px 0;border-top:.5px solid var(--separator)}.rows div:first-child{border-top:0}
.dot{display:inline-flex;align-items:center;gap:6px}.dot:before{content:"";width:8px;height:8px;border-radius:50%%;background:currentColor}
.quotes{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin-top:24px}.quote{padding:16px;border-radius:12px;background:var(--canvas)}.quote small{color:var(--tertiary)}.quote p{margin:4px 0 0;font-size:17px;font-weight:500}
.rules{columns:2;column-gap:32px}.rules li{break-inside:avoid}
@media (max-width:760px){main{padding:32px 16px 64px}.hero{flex-direction:column;align-items:start}.cols{grid-template-columns:1fr}.rules{columns:1}}
"""


def build(tokens_path, logo_path, name, tagline):
    d = json.loads(Path(tokens_path).read_text())
    mark = Path(logo_path).read_text().strip()
    v, t = d["visual"], d["typography"]
    colors, colors_dark = normal(v["colors"]), normal(v.get("colorsDark", []))
    dark = ""
    if colors_dark:
        dv = palette_vars(colors_dark)
        dark = "@media (prefers-color-scheme:dark){:root{" + ";".join(f"--{k.lower()}:{val}" for k, val in dv.items()) + "}}"
    css = CSS % {**palette_vars(colors), "dark": dark}
    brand, comps = d["brand"], d["components"]
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(name)} brand guide</title><style>{css}</style></head><body><main>
<header class="hero"><span class="app-icon">{mark}</span><div><h1>{esc(name)}</h1><p>{esc(tagline)}</p></div></header>

<section><h2>Feeling</h2><p class="lede">{esc(d["principles"]["feeling"])}</p>
<div class="group"><h3>Principles</h3><ul class="rules">{items(d["principles"]["rules"])}</ul></div></section>

<section><h2>Logo</h2><p class="lede">{esc(brand.get("idea", ""))}</p>
<div class="group"><div class="logo-row">{logo_sizes(mark)}</div>
<div class="on-dark"><span class="app-icon">{mark}</span>{esc(name)}</div></div>
<div class="group cols"><div><h3>Clear space</h3><p>{esc(brand.get("clearSpace", ""))}</p></div><div><h3>Smallest size</h3><p>{esc(brand.get("minSize", ""))}</p></div><div><h3>Never</h3><ul>{items(brand.get("dont", []))}</ul></div></div></section>

<section><h2>Colour</h2><p class="lede">Colour means state or the brand’s own content, never decoration.</p>
{mark_colors(mark)}{palette_groups(colors, colors_dark)}</section>

<section><h2>Type</h2><p class="lede">{esc(font_line(t["fonts"]))}</p>
<div class="group">{type_scale(t["scale"])}</div><div class="group"><h3>Rules</h3><ul>{items(t.get("rules", []))}</ul></div></section>

<section><h2>Space and shape</h2><p class="lede">Spacing comes only from this scale. Corners: {esc(radius_line(v.get("radius", {})))}.</p>
<div class="group">{spacing(v["spacing"]["scale"] if isinstance(v["spacing"], dict) else v["spacing"])}</div></section>

<section><h2>Components</h2><p class="lede">One filled primary pill per view; everything else is quiet.</p>
<div class="group"><div class="demo"><button class="pill primary">Primary action</button><button class="pill secondary">Secondary</button>
<span class="seg"><span class="on">Selected</span><span>Second</span><span>Third</span></span></div>
<div class="rows"><div><span>Healthy state</span><span class="dot" style="color:var(--green)">Good</span></div><div><span>Caution state</span><span class="dot" style="color:var(--orange)">Needs attention</span></div><div><span>Failure state</span><span class="dot" style="color:var(--red)">Failed</span></div></div></div>
<div class="group"><ul>{"".join(component_line(c) for c in comps)}</ul></div></section>

<section><h2>Voice</h2><p class="lede">How {esc(name)} talks.</p>
<div class="group">{voice(d["voice"])}</div></section>

<section><h2>Imagery, icons and motion</h2>
<div class="group cols"><div><h3>Imagery</h3><p>{esc(d["imagery"]["direction"])}</p><ul>{items(d["imagery"].get("rules", []) + ["Never: " + x for x in d["imagery"].get("dont", [])])}</ul></div>
<div><h3>Icons</h3><p>{esc(d["icons"]["style"])}</p><ul>{items(["Never: " + x for x in d["icons"].get("dont", [])])}</ul></div>
<div><h3>Motion</h3><ul>{items(motion_items(d["motion"]))}</ul></div></div></section>

<section><h2>Accessibility</h2><div class="group"><ul>{items(d["accessibility"] if isinstance(d["accessibility"], list) else d["accessibility"].get("rules", []))}</ul></div></section>
</main></body></html>
"""


if __name__ == "__main__":
    tokens, logo, out, name, tagline = sys.argv[1:6]
    Path(out).write_text(build(tokens, logo, name, tagline))
    print(f"wrote {out}")
