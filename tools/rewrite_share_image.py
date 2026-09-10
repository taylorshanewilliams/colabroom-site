# -*- coding: utf-8 -*-
"""Put new words on share.png without rebuilding the picture.

share.png is what every shared colabroom.com link renders as — in iMessage,
Discord, Slack, on every social post. It had the old tagline baked into it,
which made it the most-seen copy on the site and the one place a find-and-
replace could not reach.

**Why it edits rather than regenerates.** The original was made by hand and
committed; there is no source file. Redrawing the logo, the gradient and the
waveform from scratch to change two sentences would risk a worse image than
the one we have, to no purpose. So this repaints only the rows the old text
sat on and draws the new text back.

That works because the background is a pure vertical gradient — every row is
one flat colour, verified across the width — so a row can be restored exactly
by sampling its own colour at x=20, where nothing is ever drawn.

Both tagline lines are re-rendered even though the second one did not change.
A font that is one notch off is invisible next to a logo and glaring between
two lines of the same sentence.

Font size and weight were not guessed: they were fitted by rendering the
unchanged line at every plausible combination and keeping the one whose width
matched the pixels already in the file to within half a percent.

    python tools/rewrite_share_image.py path/to/Archivo[wght,wdth].ttf
"""
import sys
from PIL import Image, ImageDraw, ImageFont

FONT = sys.argv[1] if len(sys.argv) > 1 else 'archivo.ttf'

TEXT = '#F8FBFF'
MUTED = '#91A0BB'

# (text, weight, size, left edge, top of the ink) — the last two measured off
# the original so the new words land exactly where the old ones were.
LINES = [
    ('Songwriting for musicians',      600, 36, 119, 310, TEXT),
    ("who aren't in the same room.",   600, 36, 118, 361, TEXT),
    ('Record a riff. Somebody else sings over it from anywhere.',
                                       400, 30, 120, 440, MUTED),
]

# Rows to clear before drawing. Generous, and clear of the divider at y=508.
BANDS = [(300, 400), (430, 480)]
X0, X1 = 110, 960


def main():
    im = Image.open('share.png').convert('RGB')
    px = im.load()
    draw = ImageDraw.Draw(im)

    for top, bottom in BANDS:
        for y in range(top, bottom + 1):
            draw.rectangle([X0, y, X1, y], fill=px[20, y])

    for text, weight, size, left, ink_top, colour in LINES:
        font = ImageFont.truetype(FONT, size)
        font.set_variation_by_axes([float(weight), 100.0])
        box = font.getbbox(text)
        draw.text((left - box[0], ink_top - box[1]), text, font=font, fill=colour)

    im.save('share.png')
    print('share.png rewritten')


main()
