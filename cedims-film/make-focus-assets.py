from pathlib import Path
from PIL import Image

root = Path(__file__).parent
src = root / 'public' / 'launch'
Image.open(src / 'school-overview-light-safe.jpg').crop((240, 0, 1520, 706)).save(src / 'school-focus-safe.jpg', quality=95)
Image.open(src / 'district-trends-light-safe.jpg').crop((260, 0, 1450, 706)).save(src / 'district-priority-safe.jpg', quality=95)
Image.open(root / 'out' / 'mobile-55-debug.png').save(src / 'mobile-scanner.png')
