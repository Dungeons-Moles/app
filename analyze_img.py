import numpy as np
from PIL import Image

def analyze_image():
    img_fast = Image.open('assets/icons/ui/fast-speed.webp').convert("RGBA")
    arr = np.array(img_fast)
    
    # print non-transparent pixels vertically to find x bounds
    alpha = arr[:, :, 3]
    vert_sum = alpha.sum(axis=0)
    
    x_bounds = np.where(vert_sum > 0)[0]
    if len(x_bounds) > 0:
        print("X coords with non-transparent pixels:")
        print("Min X:", x_bounds[0], "Max X:", x_bounds[-1])
        
        # let's look for gaps to see if there are two distinct arrows
        gaps = np.where(vert_sum == 0)[0]
        gaps_inside = gaps[(gaps > x_bounds[0]) & (gaps < x_bounds[-1])]
        print("Gaps (X coords):", gaps_inside)
    else:
        print("Image is fully transparent")

if __name__ == "__main__":
    analyze_image()
