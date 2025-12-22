from PIL import Image, ImageDraw
import os

FG=(230,230,230,255)

def save_icon(path, draw_fn, s=24):
    img = Image.new('RGBA', (s,s), (0,0,0,0))
    d = ImageDraw.Draw(img)
    draw_fn(d, s)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)


def icon_unknown(d,s):
    pad=3
    d.rounded_rectangle([pad,pad,s-pad,s-pad], radius=3, outline=FG, width=2)
    # crude question mark made of lines
    # top hook
    d.line([(9,8),(12,6),(15,8)], fill=FG, width=2)
    d.line([(15,8),(15,11),(12,12)], fill=FG, width=2)
    d.line([(12,12),(12,14)], fill=FG, width=2)
    d.ellipse([11,16,13,18], fill=FG)


def icon_rest(d,s):
    # bed: base + headboard + pillow
    d.rectangle([4,13,20,18], outline=FG, width=2)
    d.rectangle([4,9,8,18], outline=FG, width=2)
    d.rectangle([9,11,13,13], fill=FG)


def icon_work(d,s):
    # crossed tools (simple X with caps)
    d.line([(6,18),(18,6)], fill=FG, width=3)
    d.line([(6,6),(18,18)], fill=FG, width=3)
    d.rectangle([5,17,8,20], fill=FG)
    d.rectangle([17,5,20,8], fill=FG)


def icon_drive(d,s):
    # steering wheel: outer circle + center + spokes
    d.ellipse([4,4,20,20], outline=FG, width=2)
    d.ellipse([10,10,14,14], outline=FG, width=2)
    d.line([(12,12),(12,6)], fill=FG, width=2)
    d.line([(12,12),(6,14)], fill=FG, width=2)
    d.line([(12,12),(18,14)], fill=FG, width=2)


OUT = '/mnt/data/work/v3/src/renderer/src/assets/event-icons'

save_icon(os.path.join(OUT,'unknown.png'), icon_unknown)
save_icon(os.path.join(OUT,'rest.png'), icon_rest)
save_icon(os.path.join(OUT,'work.png'), icon_work)
save_icon(os.path.join(OUT,'drive.png'), icon_drive)

print('generated icons in', OUT)
