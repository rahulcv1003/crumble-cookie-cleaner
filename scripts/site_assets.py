# Regenerates the landing site's images (committed in site/): popup.webp from the real
# popup screenshot, and og.png (1200 x 630) for link previews. Needs Pillow.
from PIL import Image, ImageDraw, ImageFont
import os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
shot = Image.open(os.path.join(root, "docs/screenshots/popup-will-be-cleaned-light.png")).convert("RGB")
w = 680; h = round(shot.height * w / shot.width)
shot.resize((w, h), Image.LANCZOS).save(os.path.join(root, "site/popup.webp"), "WEBP", quality=88)
print("popup.webp", w, h)

og = Image.new("RGB", (1200, 630), (0xF3, 0xF4, 0xF1))
d = ImageDraw.Draw(og)
def font(size, bold=False):
    for name in (["DejaVuSans-Bold.ttf"] if bold else ["DejaVuSans.ttf"]):
        for base in ["/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/dejavu"]:
            p = os.path.join(base, name)
            if os.path.exists(p): return ImageFont.truetype(p, size)
    return ImageFont.load_default()
ink = (0x1D, 0x21, 0x26); muted = (0x5B, 0x61, 0x68); rule = (0xC8, 0xCD, 0xD0)
# status mark
d.rounded_rectangle((90, 110, 170, 190), radius=8, outline=muted, width=8, fill=(0xF3, 0xF4, 0xF1))
d.line((105, 175, 155, 125), fill=muted, width=8)
d.text((200, 118), "Crumble", font=font(56, True), fill=ink)
d.text((90, 250), "Delete cookies when", font=font(68, True), fill=ink)
d.text((90, 335), "you close the tab", font=font(68, True), fill=ink)
d.line((90, 450, 1110, 450), fill=rule, width=2)
d.text((90, 480), "Keep the sites you trust. Imports Cookie AutoDelete lists.", font=font(32), fill=muted)
d.text((90, 530), "No account, no analytics, nothing leaves your browser.", font=font(32), fill=muted)
og.save(os.path.join(root, "site/og.png"), optimize=True)
print("og.png ok")
