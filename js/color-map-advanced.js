
// color_map_advanced.js
// Port of get_color2.py — texture transfer via normalized 100x100 mapping with block bboxes.
// Produces an RGBA PNG data URL for in-browser use.

export async function loadCSV(url) {
  const txt = await fetch(url).then(r => r.text());
  return txt.trim().split('\n').map(line =>
    line.split(',').map(n => parseInt(n.trim(), 10))
  );
}

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
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

/** ----- Mapping helpers (normalized 100x100 grid) ----- **/

// Map irregular (y,x) inside bbox to 100x100 grid coords (ny,nx)
export function irregularTo100(y, x, xmin, xmax, ymin, ymax) {
  const height = Math.max(ymax - ymin, 1);
  const width  = Math.max(xmax - xmin, 1);
  const yNorm = (y - ymin) / height;
  const xNorm = (x - xmin) / width;
  const ny = Math.max(0, Math.min(99, Math.round(yNorm * 99)));
  const nx = Math.max(0, Math.min(99, Math.round(xNorm * 99)));
  return [ny, nx];
}

// Map (ny,nx) on 100x100 grid back into irregular bbox coords (y,x)
export function grid100ToIrregular(ny, nx, xmin, xmax, ymin, ymax) {
  const height = Math.max(ymax - ymin, 1);
  const width  = Math.max(xmax - xmin, 1);
  const y = Math.round(ymin + (ny / 99) * height);
  const x = Math.round(xmin + (nx / 99) * width);
  return [y, x];
}

// Compute bbox for a blockID in a 2D mask
export function getBlockBBox(mask2D, blockID) {
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  const h = mask2D.length;
  const w = mask2D[0].length;

  for (let y = 0; y < h; y++) {
    const row = mask2D[y];
    for (let x = 0; x < w; x++) {
      if (row[x] === blockID) {
        if (x < xmin) xmin = x;
        if (x > xmax) xmax = x;
        if (y < ymin) ymin = y;
        if (y > ymax) ymax = y;
      }
    }
  }
  if (!Number.isFinite(xmin)) {
    throw new Error(`No pixels found for blockID=${blockID}`);
  }
  return { xmin, xmax, ymin, ymax };
}

/**
 * colorAFrameAdvanced
 * Transfers texture/colors from frame1 using map1 onto frame2 layout using map2
 * via normalized 100x100 mapping + block bounding boxes.
 *
 * - map2 == -1 → transparent
 * - map2 == 0  → keep original frame2 pixel (outline)
 * - map2  > 0  → sample color from frame1 using block-normalized coordinates
 *
 * Returns: PNG data URL of the RGBA result.
 */
export async function colorAFrameAdvanced({
  frame1URL, map1CSVURL,     // "child" colored frame 1 + mask_1.csv
  frame2URL, map2CSVURL,     // target template frame + mask_2.csv
}) {
  // Load assets
  const [img1, img2, map1, map2] = await Promise.all([
    loadImage(frame1URL),
    loadImage(frame2URL),
    loadCSV(map1CSVURL),
    loadCSV(map2CSVURL),
  ]);

  const id1 = imageToImageData(img1); // RGB source
  const id2 = imageToImageData(img2); // RGBA base (with outlines)
  const { width, height, data: base } = id2;

  if (map1.length !== height || map1[0].length !== width ||
      map2.length !== height || map2[0].length !== width) {
    throw new Error('Image and map sizes must match.');
  }

  const out = emptyImageDataLike(width, height);
  const o = out.data;
  const s = id1.data;

  // Precompute block sets
  const blockIDs = new Set();
  for (let y = 0; y < height; y++) {
    const row = map2[y];
    for (let x = 0; x < width; x++) {
      const bid = row[x];
      if (bid > 0) blockIDs.add(bid);
    }
  }

  // Precompute bboxes
  const bbox1 = new Map(); // on map1
  const bbox2 = new Map(); // on map2

  for (const bid of blockIDs) {
    try {
      bbox1.set(bid, getBlockBBox(map1, bid));
      bbox2.set(bid, getBlockBBox(map2, bid));
    } catch {
      // If missing on either map, just skip this block
    }
  }

  // Iterate all pixels of map2; sample from id1 using normalized coords
  for (let y = 0; y < height; y++) {
    const row = map2[y];
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const bid = row[x];

      if (bid === -1) {
        // transparent
        o[idx] = 0; o[idx+1] = 0; o[idx+2] = 0; o[idx+3] = 0;
        continue;
      }

      if (bid === 0) {
        // keep outline (from frame2 base)
        o[idx]   = base[idx];
        o[idx+1] = base[idx+1];
        o[idx+2] = base[idx+2];
        o[idx+3] = base[idx+3];
        continue;
      }

      const b1 = bbox1.get(bid);
      const b2 = bbox2.get(bid);

      if (!b1 || !b2) {
        // fallback to base pixel if something's missing
        o[idx]   = base[idx];
        o[idx+1] = base[idx+1];
        o[idx+2] = base[idx+2];
        o[idx+3] = base[idx+3];
        continue;
      }

      // map target (x,y) -> (ny,nx) on 100x100 grid using target bbox
      const [ny, nx] = irregularTo100(y, x, b2.xmin, b2.xmax, b2.ymin, b2.ymax);
      // then map (ny,nx) -> (sy,sx) in source bbox
      const [sy, sx] = grid100ToIrregular(ny, nx, b1.xmin, b1.xmax, b1.ymin, b1.ymax);

      const inside =
        sy >= 0 && sy < height &&
        sx >= 0 && sx < width;

      if (inside) {
        const sidx = (sy * width + sx) * 4;
        o[idx]   = s[sidx];
        o[idx+1] = s[sidx + 1];
        o[idx+2] = s[sidx + 2];
        o[idx+3] = 255;
      } else {
        // safety fallback
        o[idx]   = base[idx];
        o[idx+1] = base[idx+1];
        o[idx+2] = base[idx+2];
        o[idx+3] = base[idx+3];
      }
    }
  }

  return imageDataToPNGDataURL(out);
}

/** Example:
 * const dataURL = await colorAFrameAdvanced({
 *   frame1URL: 'images/frames/tortoise/frame_1_child.png',
 *   map1CSVURL: 'images/frames/tortoise/mask_1.csv',
 *   frame2URL: 'images/frames/tortoise/frame_2_template.png',
 *   map2CSVURL: 'images/frames/tortoise/mask_2.csv'
 * });
 */
