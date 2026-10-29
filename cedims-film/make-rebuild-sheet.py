from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).parent / 'out' / 'rebuilt-frames'
files = sorted(root.glob('element-*.png'))
cell_w, cell_h, label_h = 384, 216, 34
sheet = Image.new('RGB', (cell_w*5, (cell_h+label_h)*5), '#08172d')
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 22)
except OSError:
    font = ImageFont.load_default()
for i, path in enumerate(files):
    frame = int(path.stem.split('-')[-1])
    im = Image.open(path).convert('RGB').resize((cell_w, cell_h))
    x, y = (i%5)*cell_w, (i//5)*(cell_h+label_h)
    sheet.paste(im, (x,y))
    draw.text((x+10,y+cell_h+4), f'{frame/30:05.1f}s', fill='white', font=font)
sheet.save(Path(__file__).parent / 'out' / 'rebuilt-contact-sheet.jpg', quality=90)
