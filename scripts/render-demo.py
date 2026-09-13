#!/usr/bin/env python3
"""Render docs/demo.gif from the captured tool output.

Reads scripts/demo-data.json (written by capture-demo.mjs) and renders a terminal
style animation. The text is never rewritten here: the only transforms are line
wrapping, collapsing one very long comma list to a count, and colour, all of
which are rule based so fresh captures render without editing this file.

    pip install Pillow
    npm run demo:render

Requires a monospace TTF. Override with DEMO_FONT / DEMO_FONT_BOLD if the
defaults are missing on your platform.
"""

import json
import os
import re
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("Pillow is required:  pip install Pillow")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(HERE, "demo-data.json")
OUT = os.path.join(ROOT, "docs", "demo.gif")

W = 900
PAD = 18
LH = 20
MAXCH = 96          # wrap width in characters
FPS_MS = 90         # per animation step

BG = (13, 17, 23)
FG = (201, 209, 217)
DIM = (110, 118, 129)
GREEN = (63, 185, 80)
RED = (248, 81, 73)
BLUE = (88, 166, 255)
YELLOW = (210, 153, 34)
PROMPT = (163, 113, 247)

# Consolas ships on Windows; DejaVu Sans Mono is the usual Linux fallback.
FONT_CANDIDATES = [
    (os.environ.get("DEMO_FONT"), os.environ.get("DEMO_FONT_BOLD")),
    (r"C:\Windows\Fonts\consola.ttf", r"C:\Windows\Fonts\consolab.ttf"),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
     "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"),
    ("/System/Library/Fonts/Menlo.ttc", "/System/Library/Fonts/Menlo.ttc"),
]


def load_fonts():
    for regular, bold in FONT_CANDIDATES:
        if regular and os.path.exists(regular):
            b = bold if (bold and os.path.exists(bold)) else regular
            return ImageFont.truetype(regular, 14), ImageFont.truetype(b, 14)
    sys.exit("No monospace font found. Set DEMO_FONT to a .ttf path.")


F, FB = load_fonts()

# Marker for a tool call. U+25CF is present in Consolas and DejaVu; U+23FA is
# not, and renders as a tofu box.
CALL_MARKER = "\u25cf"

# Rule-based colour, applied to whatever the capture produced.
COLOUR_RULES = [
    (re.compile(r"^Blocked AI crawlers", re.I), RED, True),
    (re.compile(r"^Allowed AI crawlers", re.I), GREEN, True),
    (re.compile(r"^(llms\.txt|llms-full\.txt):\s*present.*valid", re.I), GREEN, True),
    (re.compile(r"^(llms\.txt|llms-full\.txt):\s*present", re.I), YELLOW, False),
    (re.compile(r"^(llms\.txt|llms-full\.txt):\s*(absent|missing|not)", re.I), RED, True),
    (re.compile(r"^types:", re.I), GREEN, True),
    (re.compile(r"^Entities with sameAs", re.I), BLUE, False),
    (re.compile(r"^(AI-relevant types not found|Sitemaps)", re.I), DIM, False),
]


def colour_for(line):
    for pattern, colour, bold in COLOUR_RULES:
        if pattern.search(line.strip()):
            return colour, bold
    return FG, False


def collapse_long_list(line):
    """A 25-item sitemap list is unreadable at this size. Collapse to a count
    and say so, rather than silently truncating."""
    m = re.match(r"^(Sitemaps?):\s*(.+)$", line.strip(), re.I)
    if not m:
        return line
    items = [x for x in m.group(2).split(",") if x.strip()]
    if len(items) <= 2:
        return line
    return f"{m.group(1)}: {len(items)} found"


def wrap(text, width=MAXCH):
    if len(text) <= width:
        return [text]
    out, line = [], ""
    indent = "  " if text.startswith(" ") else ""
    for word in text.split(" "):
        if line and len(line) + len(word) + 1 > width:
            out.append(line)
            line = indent + word
        else:
            line = (line + " " + word) if line else word
    if line:
        out.append(line)
    return out


def build_lines(raw_output):
    """Returns display lines, each a list of (text, colour, font) runs.

    When a rule matches, only the `Label:` prefix takes the rule's colour and the
    values stay neutral. Colouring an entire 15-item crawler list red is accurate
    but unreadable, and the label alone carries the signal.
    """
    lines = []
    for raw in raw_output:
        if not raw.strip():
            continue
        collapsed = collapse_long_list(raw)
        colour, bold = colour_for(collapsed)
        pieces = wrap(collapsed)
        for i, piece in enumerate(pieces):
            if i == 0 and colour is not FG and ":" in piece:
                label, _, rest = piece.partition(":")
                runs = [(label + ":", colour, FB if bold else F)]
                if rest:
                    runs.append((rest, FG, F))
                lines.append(runs)
            elif i == 0:
                lines.append([(piece, colour, FB if bold else F)])
            else:
                lines.append([(piece, FG if colour is not FG else colour, F)])
    return lines


def draw(rendered, height):
    img = Image.new("RGB", (W, height), BG)
    d = ImageDraw.Draw(img)
    y = PAD
    for runs in rendered:
        x = PAD
        for text, colour, font in runs:
            d.text((x, y), text, font=font, fill=colour)
            x += int(d.textlength(text, font=font))
        y += LH
    return img


def scene_frames(scene, height):
    header = [[("geo-inspector-mcp", DIM, FB)]]
    question = scene["question"]
    call = CALL_MARKER + "  " + scene["call"]
    body = build_lines(scene["output"])

    frames = []
    # Type the question in.
    for i in range(1, len(question) + 1, 3):
        frames.append((header + [[(">  " + question[:i] + "\u2588", PROMPT, F)]], 1))
    typed = header + [[(">  " + question, PROMPT, F)]]
    frames.append((typed, 4))
    # Tool call.
    with_call = typed + [[("", FG, F)], [(call, BLUE, FB)]]
    frames.append((with_call, 5))
    # Stream the response.
    acc = with_call + [[("", FG, F)]]
    for line in body:
        acc = acc + [line]
        frames.append((acc, 2))
    frames.append((acc, 16))   # hold the finished result
    return frames


def main():
    if not os.path.exists(DATA):
        sys.exit(f"No capture found at {DATA}\nRun:  npm run build && npm run demo:capture")
    with open(DATA, encoding="utf-8") as fh:
        data = json.load(fh)
    scenes = data.get("scenes", [])
    if not scenes:
        sys.exit("Capture contains no scenes.")

    # One canvas height for every scene, sized to the tallest so the GIF does
    # not jump between frames.
    tallest = max(len(build_lines(s["output"])) for s in scenes)
    height = PAD * 2 + LH * (tallest + 5)

    all_frames = []
    for scene in scenes:
        all_frames.extend(scene_frames(scene, height))

    images, durations = [], []
    for rendered, steps in all_frames:
        images.append(draw(rendered, height))
        durations.append(FPS_MS * steps)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    images[0].save(
        OUT,
        save_all=True,
        append_images=images[1:],
        duration=durations,
        loop=0,
        optimize=True,
    )
    size_mb = os.path.getsize(OUT) / 1024 / 1024
    print(f"scenes   : {len(scenes)}")
    print(f"canvas   : {W}x{height}")
    print(f"frames   : {len(images)} authored")
    print(f"runtime  : {sum(durations) / 1000:.1f}s")
    print(f"size     : {size_mb:.2f} MB")
    print(f"captured : {data.get('capturedAt', 'unknown')}")
    print(f"wrote    : {OUT}")


if __name__ == "__main__":
    main()
