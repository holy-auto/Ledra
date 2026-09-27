# Synthetic "camera capture" sources carrying the metadata a phone photo has:
# Make/Model/DateTimeOriginal, Orientation=6 (rotate 90) and a GPS fix.
# The pipeline must bake in the orientation and drop EXIF/GPS.
import sys
from PIL import Image, ImageDraw
import pillow_heif

out = sys.argv[1]
W, H = 960, 640
img = Image.new("RGB", (W, H))
d = ImageDraw.Draw(img)
for y in range(H):
    d.line([(0, y), (W, y)], fill=(30 + y // 6, 60 + y // 8, 110 + y // 10))
d.rectangle([120, 300, 840, 520], fill=(200, 200, 205))  # vehicle body stand-in
d.ellipse([200, 470, 330, 600], fill=(25, 25, 25))
d.ellipse([630, 470, 760, 600], fill=(25, 25, 25))
d.text((130, 40), "Ledra C2PA conformance sample - synthetic test capture", fill=(255, 255, 255))

exif = Image.Exif()
exif[0x010F] = "LedraTest"       # Make
exif[0x0110] = "SampleCam 1"     # Model
exif[0x0112] = 6                  # Orientation: rotate 90 CW
exif[0x0132] = "2026:09:27 10:00:00"
ifd = exif.get_ifd(0x8769)
ifd[0x9003] = "2026:09:27 10:00:00"  # DateTimeOriginal
gps = exif.get_ifd(0x8825)
gps[1] = "N"; gps[2] = (35.0, 0.0, 0.0)
gps[3] = "E"; gps[4] = (139.0, 0.0, 0.0)
raw = exif.tobytes()

img.save(f"{out}/src.jpg", quality=92, exif=raw)
img.save(f"{out}/src.png", exif=raw)
img.save(f"{out}/src.webp", quality=90, exif=raw)
pillow_heif.from_pillow(img).save(f"{out}/src.heic", quality=90, exif=raw)
