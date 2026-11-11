#!/usr/bin/env python3
"""Remove edge-connected checkerboard/flat backgrounds from button JPEGs."""
from collections import Counter, deque
from pathlib import Path
import math
import argparse
from PIL import Image, ImageFilter

COLORS = ("blue", "green", "orange", "purple", "red")

def distance(a, b):
    return math.sqrt(sum((int(a[i]) - float(b[i])) ** 2 for i in range(3)))

def background_palette(border):
    # Two dominant border tones support the common transparency checkerboard.
    counts = Counter(tuple((channel // 8) * 8 for channel in pixel) for pixel in border)
    candidates = [color for color, _ in counts.most_common(24)]
    centers = [
        tuple(float(v) for v in min(border, key=lambda p: sum(p) / 3)),
        tuple(float(v) for v in max(border, key=lambda p: sum(p) / 3)),
    ]
    for _ in range(12):
        groups = [[], []]
        for p in border:
            groups[0 if distance(p, centers[0]) <= distance(p, centers[1]) else 1].append(p)
        new = []
        for i, group in enumerate(groups):
            if not group:
                new.append(centers[i])
            else:
                new.append(tuple(sum(p[c] for p in group) / len(group) for c in range(3)))
        if max(distance(new[i], centers[i]) for i in range(2)) < .2:
            centers = new
            break
        centers = new
    # If the border is a single flat color, collapse duplicate centers.
    if distance(centers[0], centers[1]) < 12:
        centers = [tuple((centers[0][i] + centers[1][i]) / 2 for i in range(3))]
    return centers

def remove_background(source: Path, destination: Path) -> None:
    image = Image.open(source).convert("RGB")
    width, height = image.size
    pixels = list(image.getdata())
    border = []
    for x in range(width):
        border.extend((pixels[x], pixels[(height - 1) * width + x]))
    for y in range(1, height - 1):
        border.extend((pixels[y * width], pixels[y * width + width - 1]))

    centers = background_palette(border)
    border_distances = sorted(min(distance(p, center) for center in centers) for p in border)
    p95 = border_distances[int((len(border_distances) - 1) * .95)]
    tolerance = max(34.0, min(55.0, p95 * 2.4 + 12.0))

    total = width * height
    background = bytearray(total)
    queued = bytearray(total)
    queue = deque()

    def add(index):
        if not queued[index]:
            queued[index] = 1
            queue.append(index)

    for x in range(width):
        add(x)
        add((height - 1) * width + x)
    for y in range(1, height - 1):
        add(y * width)
        add(y * width + width - 1)

    while queue:
        idx = queue.popleft()
        p = pixels[idx]
        d = min(distance(p, center) for center in centers)
        if d > tolerance:
            continue
        background[idx] = 1
        x, y = idx % width, idx // width
        if x: add(idx - 1)
        if x + 1 < width: add(idx + 1)
        if y: add(idx - width)
        if y + 1 < height: add(idx + width)

    alpha = bytearray(total)
    low = tolerance * .62
    span = max(1.0, tolerance - low)
    for idx, p in enumerate(pixels):
        if not background[idx]:
            alpha[idx] = 255
        else:
            d = min(distance(p, center) for center in centers)
            alpha[idx] = int(max(0, min(255, (d - low) / span * 255)))

    mask = Image.frombytes("L", (width, height), bytes(alpha))
    mask = mask.filter(ImageFilter.GaussianBlur(.45))
    result = image.convert("RGBA")
    result.putalpha(mask)
    destination.parent.mkdir(parents=True, exist_ok=True)
    result.save(destination, "PNG", optimize=True)
    transparent = sum(1 for a in alpha if a < 8)
    print(
        f"{source.name} -> {destination} ({width}x{height}); "
        f"transparent={transparent}; bg-colors={centers}; tolerance={tolerance:.1f}"
    )

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("dist/assets/buttons"))
    output = parser.parse_args().output
    for color in COLORS:
        source = Path(color + ".jpeg")
        if not source.is_file():
            raise SystemExit("Missing source image: " + str(source))
        remove_background(source, output / (color + ".png"))

if __name__ == "__main__":
    main()
