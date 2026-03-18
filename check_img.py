from PIL import Image

try:
    img_normal = Image.open('assets/icons/ui/normal-speed.webp')
    img_fast = Image.open('assets/icons/ui/fast-speed.webp')

    print('Normal format, size, mode:', img_normal.format, img_normal.size, img_normal.mode)
    print('Fast format, size, mode:', img_fast.format, img_fast.size, img_fast.mode)
except Exception as e:
    print("Error:", e)
