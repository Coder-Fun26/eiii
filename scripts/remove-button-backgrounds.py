#!/usr/bin/env python3
"""Create transparent PNG copies of the five glossy button JPEGs."""
from collections import deque
from pathlib import Path
import statistics
import argparse
from PIL import Image, ImageFilter

COLORS = ("blue", "green", "orange", "purple", "red")

def median_rgb(values):
    return tuple(int(statistics.median(c[i] for c in values)) for i in range(3))

def remove_background(source: Path, destination: Path) -> None:
    image = Image.open(source).convert("RGB")
    width, height = image.size
    pixels = list(image.getdata())
    border = []
    for x in range(width):
        border.extend((pixels[x], pixels[(height - 1) * width + x]))
    for y in range(1, height - 1):
        border.extend((pixels[y * width], pixels[y * width + width - 1]))
    bg = median_rgb(border)
    deviations = sorted(sum((p[i] - bg[i]) ** 2 for i in range(3)) ** 0.5 for p in border)
    p90 = deviations[int((len(deviations) - 1) * .90)]
    tolerance = max(30.0, min(58.0, p90 * 2.5 + 14.0))

    total = width * height
    background = bytearray(total)
    visited = bytearray(total)
    queue = deque()
    for x in range(width):
        queue.append(x)
        queue.append((height - 1) * width + x)
    for y in range(1, height - 1):
        queue.append(y * width)
        queue.append(y * width + width - 1)

    while queue:
        idx = queue.popleft()
        if visited[idx]:
            continue
        visited[idx] = 1
        p = pixels[idx]
        dist = sum((p[i] - bg[i]) ** 2 for i in range(3)) ** .5
        if dist > tolerance:
            continue
        background[idx] = 1
        x, y = idx % width, idx // width
        if x: queue.append(idx - 1)
        if x + 1 < width: queue.append(idx + 1)
        if y: queue.append(idx - width)
        if y + 1 < height: queue.append(idx + width)

    alpha = bytearray(total)
    low, span = tolerance * .58, max(1.0, tolerance * .42)
    for idx, p in enumerate(pixels):
        if not background[idx]:
            alpha[idx] = 255
        else:
            dist = sum((p[i] - bg[i]) ** 2 for i in range(3)) ** .5
            alpha[idx] = int(max(0, min(255, (dist - low) / span * 255)))

    mask = Image.frombytes("L", (width, height), bytes(alpha)).filter(ImageFilter.GaussianBlur(.55))
    result = image.convert("RGBA")
    result.putalpha(mask)
    destination.parent.mkdir(parents=True, exist_ok=True)
    result.save(destination, "PNG", optimize=True)
    transparent = sum(1 for a in alpha if a < 8)
    print(f"{source.name} -> {destination} ({width}x{height}), removed pixels={transparent}, tolerance={tolerance:.1f}")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("dist/assets/buttons"))
    out = parser.parse_args().output
    for color in COLORS:
        src = Path(color + ".jpeg")
        if not src.is_file():
            raise SystemExit("Missing source image: " + str(src))
        remove_background(src, out / (color + ".png"))

if __name__ == "__main__":
    main()
