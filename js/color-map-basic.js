
// color_map_basic.js
// Port of get_color.py — block-average color transfer using CSV masks.
// Works fully in-browser with <canvas>.

/** --------- CSV + Image helpers --------- **/

export async function loadCSV(url) {
  const txt = await fetch(url).then(r => r.text());
  // Parse to 2D array of integers
  return txt.trim().split('\n').map(line =>
    line.split(',').map(n => parseInt(n.trim(), 10))
  );
}

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // needed if images are hosted elsewhere
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export function imageToImageData(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0);
  return cx.getImageData(0, 0, c.width, c.height);
}

export function emptyImageDataLike(width, height) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const cx = c.getContext('2d');
  return cx.createImageData(width, height);
}

export function imageDataToPNGDataURL(imageData) {
  const c = document.createElement('canvas');
  c.width = imageData.width;
  c.height = imageData.height;
  const cx = c.getContext('2d');
  cx.putImageData(imageData, 0, 0);
  return c.toDataURL('image/png');
}

/** --------- Core: average color for a block --------- **/

export function getAverageColorForBlock(map2D, frameImageData, blockID) {
  const { data, width, height } = frameImageData;
  // Validate map dimensions
  if (map2D.length !== height || map2D[0].length !== width) {
    throw new Error('Image and map size do not match.');
  }
  let rSum = 0, gSum = 0, bSum = 0, count = 0;

  for (let y = 0; y < height; y++) {
    const row = map2D[y];
    for (let x = 0; x < width; x++) {
      if (row[x] === blockID) {
        const idx = (y * width + x) * 4;
        rSum += data[idx];
        gSum += data[idx + 1];
        bSum += data[idx + 2];
        count++;
      }
    }
  }
  if (!count) return null;
  return [
    Math.floor(rSum / count),
    Math.floor(gSum / count),
    Math.floor(bSum / count),
  ];
}

/**
 * colorAFrameBasic
 * map1PNG + frame1PNG define the palette; map2CSV + frame2PNG define the output layout.
 * Rules:
 *  - map2 == -1 -> fully transparent
 *  - map2 == 0  -> keep original pixel from frame2 (for outlines)
 *  - map2 > 0   -> fill with average color from the corresponding block in map1/frame1
 *
 * Returns: Data URL (PNG) of result.
 */
export async function colorAFrameBasic({
  frame1URL, map1CSVURL,
  frame2URL, map2CSVURL,
}) {
  // Load everything in parallel
  const [img1, img2, map1, map2] = await Promise.all([
    loadImage(frame1URL),
    loadImage(frame2URL),
    loadCSV(map1CSVURL),
    loadCSV(map2CSVURL),
  ]);

  const id1 = imageToImageData(img1); // RGB
  const id2 = imageToImageData(img2); // RGBA base (outlines, etc.)

  const width = id2.width;
  const height = id2.height;

  // Build color lookup for all positive block IDs in map2
  const blockIDs = new Set();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const bid = map2[y][x];
      if (bid > 0) blockIDs.add(bid);
    }
  }

  const lut = new Map();
  for (const bid of blockIDs) {
    lut.set(bid, getAverageColorForBlock(map1, id1, bid));
  }

  // Create output
  const out = emptyImageDataLike(width, height);
  const o = out.data;
  const b = id2.data; // base pixels (for outlines/zeros)

  for (let y = 0; y < height; y++) {
    const m2row = map2[y];
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const bid = m2row[x];

      if (bid === -1) {
        // transparent
        o[idx] = 0; o[idx+1] = 0; o[idx+2] = 0; o[idx+3] = 0;
      } else if (bid === 0) {
        // keep original pixel (e.g., outline)
        o[idx]   = b[idx];
        o[idx+1] = b[idx+1];
        o[idx+2] = b[idx+2];
        o[idx+3] = b[idx+3];
      } else {
        const col = lut.get(bid);
        if (col) {
          o[idx] = col[0];
          o[idx+1] = col[1];
          o[idx+2] = col[2];
          o[idx+3] = 255;
        } else {
          // fallback to base pixel if missing
          o[idx]   = b[idx];
          o[idx+1] = b[idx+1];
          o[idx+2] = b[idx+2];
          o[idx+3] = b[idx+3];
        }
      }
    }
  }

  return imageDataToPNGDataURL(out);
}

/** Example:
 * const dataURL = await colorAFrameBasic({
 *   frame1URL: 'images/frames/tortoise/frame_1_child.png',
 *   map1CSVURL: 'images/frames/tortoise/mask_1.csv',
 *   frame2URL: 'images/frames/tortoise/frame_2_template.png',
 *   map2CSVURL: 'images/frames/tortoise/mask_2.csv'
 * });
 */
