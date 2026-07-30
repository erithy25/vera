"""Renders a fake screen recording for testing Vera.

Every credential in here is invented. They are structurally valid so the
detector fires, and they are verified against the engine before rendering.
"""
from PIL import Image, ImageDraw, ImageFont
import os, subprocess, shutil

W, H = 1600, 1000
FPS = 10
OUT_DIR = "/tmp/vera-demo-frames"
FINAL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vera-demo-recording.mov")

BG        = (30, 30, 30)
CHROME    = (60, 60, 60)
TITLE     = (200, 200, 200)
FG        = (212, 212, 212)
COMMENT   = (106, 153, 85)
STRING    = (206, 145, 120)
KEYWORD   = (86, 156, 214)
PROMPT    = (78, 201, 176)
MUTED     = (128, 128, 128)
YELLOW    = (220, 220, 170)

MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
font      = ImageFont.truetype(MONO, 21)
font_bold = ImageFont.truetype(BOLD, 21)
font_ui   = ImageFont.truetype(MONO, 17)

# (seconds, window title, [(colour, text), ...])
SCENES = [
    (6, "app.ts — acme-api", [
        (COMMENT, "// src/lib/openai.ts"),
        (FG,      ""),
        (KEYWORD, "import") ,
        (FG,      "import OpenAI from \"openai\";"),
        (FG,      ""),
        (COMMENT, "// Never hard-code the key. Read it from the environment."),
        (FG,      "const apiKey = process.env.OPENAI_API_KEY;"),
        (FG,      ""),
        (FG,      "export const client = new OpenAI({ apiKey });"),
        (FG,      ""),
        (COMMENT, "// TODO: add retry with backoff"),
    ]),
    (6, "zsh — acme-api", [
        (PROMPT,  "~/dev/acme-api $ git log --oneline -3"),
        (YELLOW,  "a074f80ab12cd34ef56789012345678901234567 (HEAD -> main)"),
        (FG,      "3c198ac  Revise README"),
        (FG,      "8be21d4  Bump deps to v2.11.2"),
        (FG,      ""),
        (PROMPT,  "~/dev/acme-api $ npm run dev"),
        (FG,      ""),
        (FG,      "  vite v7.0.4  ready in 412 ms"),
        (FG,      "  Local:   http://127.0.0.1:5173/"),
        (FG,      "  dist/assets/index-Dz8mcTBK.js  259.84 kB"),
    ]),
    # ---- FINDING 1: OpenAI project key, 10 s on screen ----
    (10, ".env — acme-api", [
        (COMMENT, "# .env  (do NOT commit)"),
        (FG,      ""),
        (FG,      "NODE_ENV=development"),
        (FG,      "PORT=5173"),
        (FG,      ""),
        (FG,      "OPENAI_API_KEY=sk-proj-T3xK9mPq2LvR8wZa5NbYc7Hd"),
        (FG,      ""),
        (FG,      "LOG_LEVEL=debug"),
        (COMMENT, "# rotate quarterly"),
    ]),
    (6, "docs — Getting started", [
        (TITLE,   "Getting started"),
        (FG,      ""),
        (FG,      "1. Copy the example file:"),
        (PROMPT,  "   cp .env.example .env"),
        (FG,      ""),
        (FG,      "2. Paste your own key:"),
        (STRING,  "   OPENAI_API_KEY=sk-your-api-key-here"),
        (STRING,  "   AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE"),
        (FG,      ""),
        (MUTED,   "   (placeholders — replace them with real values)"),
    ]),
    # ---- FINDING 2: connection string with password, 8 s ----
    (8, "zsh — acme-api", [
        (PROMPT,  "~/dev/acme-api $ cat docker-compose.override.yml"),
        (FG,      ""),
        (FG,      "services:"),
        (FG,      "  api:"),
        (FG,      "    environment:"),
        (FG,      "      DATABASE_URL=postgres://admin:Hunter2Pass9x@db.internal.acme.dev:5432/orders"),
        (FG,      "      REDIS_URL=redis://cache.internal.acme.dev:6379"),
        (FG,      ""),
        (PROMPT,  "~/dev/acme-api $ "),
    ]),
    # ---- FINDING 3: Stripe publishable key (info), 6 s ----
    (6, "checkout.tsx — acme-api", [
        (COMMENT, "// Client-side Stripe. This key is meant to be public."),
        (FG,      ""),
        (FG,      "const stripe = Stripe(\"pk_live_51QxK9mPq2LvR8wZa5NbYc7HdT3x\");"),
        (FG,      ""),
        (FG,      "export function Checkout() {"),
        (FG,      "  return <PaymentElement />;"),
        (FG,      "}"),
    ]),
    # ---- FINDING 4: GitHub token, 8 s ----
    (8, "zsh — acme-api", [
        (PROMPT,  "~/dev/acme-api $ curl -sS \\"),
        (FG,      "    -H \"Authorization: token ghp_T3xK9mPq2LvR8wZa5NbYc7HdQ2rW4u\" \\"),
        (FG,      "    https://api.github.com/user"),
        (FG,      ""),
        (FG,      "{"),
        (FG,      "  \"login\": \"acme-bot\","),
        (FG,      "  \"id\": 1263387532"),
        (FG,      "}"),
    ]),
    (6, "zsh — acme-api", [
        (PROMPT,  "~/dev/acme-api $ npm run build && npm test"),
        (FG,      ""),
        (FG,      "  ✓ 76 tests passed"),
        (FG,      "  built in 1.22s"),
        (FG,      ""),
        (PROMPT,  "~/dev/acme-api $ "),
    ]),
]


def render(scene_title, lines, cursor_on):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # window chrome
    d.rectangle([0, 0, W, 44], fill=CHROME)
    for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        d.ellipse([20 + i * 22, 16, 32 + i * 22, 28], fill=c)
    tw = d.textlength(scene_title, font=font_ui)
    d.text(((W - tw) / 2, 14), scene_title, font=font_ui, fill=TITLE)

    # gutter
    d.rectangle([0, 44, 58, H], fill=(37, 37, 38))

    y = 78
    for n, (colour, text) in enumerate(lines, start=1):
        d.text((20, y), str(n).rjust(2), font=font, fill=(90, 90, 90))
        d.text((72, y), text, font=font, fill=colour)
        y += 34

    if cursor_on:
        last = lines[-1][1] if lines else ""
        d.rectangle([72 + d.textlength(last, font=font), y - 34,
                     72 + d.textlength(last, font=font) + 11, y - 34 + 24],
                    fill=(212, 212, 212))
    return img


def main():
    if os.path.isdir(OUT_DIR):
        shutil.rmtree(OUT_DIR)
    os.makedirs(OUT_DIR)

    idx = 0
    t = 0.0
    for seconds, title, lines in SCENES:
        print(f"  {int(t//60)}:{int(t%60):02d}  {title}")
        for f in range(seconds * FPS):
            # Blinking cursor: changes a handful of pixels, so the perceptual
            # hash should still treat these frames as identical and skip the
            # OCR. That is deliberately part of the test.
            cursor_on = (f // (FPS // 2)) % 2 == 0
            render(title, lines, cursor_on).save(f"{OUT_DIR}/f{idx:05d}.png")
            idx += 1
        t += seconds

    print(f"\n{idx} frames, {t:.0f}s — encoding…")
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-framerate", str(FPS), "-i", f"{OUT_DIR}/f%05d.png",
        "-c:v", "libx264", "-preset", "slow", "-crf", "20",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        FINAL,
    ], check=True)
    print("wrote", FINAL)


if __name__ == "__main__":
    main()
