
// color-map-advanced.js
// Texture transfer via normalized 100x100 mapping + per‑block bounding boxes.
// Produces RGBA PNG data URLs (works fully in-browser).

/* -------------------- IO helpers -------------------- */
export async function loadCSV(url) {
  const txt = await fetch(url).then(r => r.text());
  // Handle CRLF, skip blanks, parse safely
  return txt
    .trim()
    .split(/\r?\n/)
    .filter(line => line.length)
    .map(line =>
      line.split(',').map(v => Number.parseInt(v.trim(), 10))
    );
}

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Same-origin: no need for crossOrigin. If your images are on a CDN with CORS, keep this.
    // img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export function imageToImageData(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, w, h);
  return cx.getImageData(0, 0, w, h);
}

export function emptyImageDataLike(width, height) {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const cx = c.getContext('2d', { willReadFrequently: true });
  return cx.createImageData(width, height);
}

export function imageDataToPNGDataURL(imageData) {
  const c = document.createElement('canvas');
  c.width = imageData.width; c.height = imageData.height;
  const cx = c.getContext('2d');
  cx.putImageData(imageData, 0, 0);
  return c.toDataURL('image/png');
}

/* -------------------- Mapping helpers -------------------- */
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

// Map (ny,nx) back to irregular bbox coords (y,x)
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

/* -------------------- Color transfer core -------------------- */
/**
 * colorAFrameAdvanced
 * Transfers color/texture from frame1 (pose 1, masked) onto frame2 (target pose)
 * using map_1.csv and map_2.csv with block-wise normalized coordinates.
 *
 * Conventions in map2:
 *  -1  => transparent
 *   0  => keep frame2 base pixel (outline/background)
 *  >0  => block id (sample color from frame1 block with same id)
 *
 * NOTE: For best results pass a *masked* frame1 (see maskColoredBase()).
 */
export async function colorAFrameAdvanced({
  frame1URL, map1CSVURL,
  frame2URL, map2CSVURL,
}) {
  const [img1, img2, map1, map2] = await Promise.all([
    loadImage(frame1URL),
    loadImage(frame2URL),
    loadCSV(map1CSVURL),
    loadCSV(map2CSVURL),
  ]);

  const id1 = imageToImageData(img1); // source colors
  const id2 = imageToImageData(img2); // base (with outlines)
  const { width, height, data: base } = id2;

  if (map1.length !== height || map1[0].length !== width ||
      map2.length !== height || map2[0].length !== width) {
    throw new Error('Image and map sizes must match.');
  }

  const out = emptyImageDataLike(width, height);
  const o = out.data;
  const s = id1.data;

  // Collect block IDs used by map2
  const blockIDs = new Set();
  for (let y = 0; y < height; y++) {
    const row = map2[y];
    for (let x = 0; x < width; x++) {
      const bid = row[x];
      if (bid > 0) blockIDs.add(bid);
    }
  }

  // Precompute bboxes
  const bbox1 = new Map();
  const bbox2 = new Map();
  for (const bid of blockIDs) {
    try { bbox1.set(bid, getBlockBBox(map1, bid)); } catch {}
    try { bbox2.set(bid, getBlockBBox(map2, bid)); } catch {}
  }

  // Transfer
  for (let y = 0; y < height; y++) {
    const row = map2[y];
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const bid = row[x];

      if (bid === -1) { // fully transparent
        o[idx] = o[idx+1] = o[idx+2] = 0; o[idx+3] = 0; continue;
      }
      if (bid === 0) {  // keep base (outline)
        o[idx]   = base[idx];
        o[idx+1] = base[idx+1];
        o[idx+2] = base[idx+2];
        o[idx+3] = base[idx+3];
        continue;
      }

      const b1 = bbox1.get(bid);
      const b2 = bbox2.get(bid);
      if (!b1 || !b2) {
        o[idx]   = base[idx];
        o[idx+1] = base[idx+1];
        o[idx+2] = base[idx+2];
        o[idx+3] = base[idx+3];
        continue;
      }

      const [ny, nx] = irregularTo100(y, x, b2.xmin, b2.xmax, b2.ymin, b2.ymax);
      const [sy, sx] = grid100ToIrregular(ny, nx, b1.xmin, b1.xmax, b1.ymin, b1.ymax);

      if (sy >= 0 && sy < height && sx >= 0 && sx < width) {
        const sidx = (sy * width + sx) * 4;
        o[idx]   = s[sidx];
        o[idx+1] = s[sidx + 1];
        o[idx+2] = s[sidx + 2];
        o[idx+3] = 255;
      } else {
        o[idx]   = base[idx];
        o[idx+1] = base[idx+1];
        o[idx+2] = base[idx+2];
        o[idx+3] = base[idx+3];
      }
    }
  }

  return imageDataToPNGDataURL(out);
}

/* -------------------- Trim (mask) outside-the-lines -------------------- */
/** Keep only paint inside the character (by map). Optionally erode 1–2px. */
export async function maskColoredBase(
  coloredBaseDataURL,
  mapCSVURL,
  { keepIDs = (bid) => bid > 0, erode = 1 } = {}
) {
  const [img, map] = await Promise.all([ loadImage(coloredBaseDataURL), loadCSV(mapCSVURL) ]);
  const id = imageToImageData(img);
  const { width: W, height: H, data: px } = id;

  const inside = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const row = map[y];
    for (let x = 0; x < W; x++) inside[y * W + x] = keepIDs(row[x]) ? 1 : 0;
  }

  if (erode > 0) {
    const tmp = new Uint8Array(W * H);
    const passes = Math.min(erode, 3);
    for (let p = 0; p < passes; p++) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (!inside[y * W + x]) { tmp[y * W + x] = 0; continue; }
          let ok = 1;
          for (let yy = y - 1; yy <= y + 1 && ok; yy++) {
            for (let xx = x - 1; xx <= x + 1; xx++) {
              if (yy < 0 || yy >= H || xx < 0 || xx >= W) { ok = 0; break; }
              if (!inside[yy * W + xx]) { ok = 0; break; }
            }
          }
          tmp[y * W + x] = ok ? 1 : 0;
        }
      }
      inside.set(tmp);
    }
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (!inside[y * W + x]) {
        px[i] = px[i+1] = px[i+2] = 0; px[i+3] = 0;
      } else {
        px[i+3] = 255;
      }
    }
  }

  return imageDataToPNGDataURL(id);
}

/* -------------------- Convenience for 4 frames -------------------- */
export async function colorCharacterFrames({
  character,
  maskedBaseDataURL,                    // output of maskColoredBase()
  dir = `images/frames/${character}`,   // where your frames & masks live
  frames = [1, 2, 3, 4],
}) {
  let base = maskedBaseDataURL;
  const results = [];
  for (const n of frames) {
    const dataURL = await colorAFrameAdvanced({
      frame1URL: base,
      map1CSVURL: `${dir}/mask_${n}.csv`,
      frame2URL: `${dir}/${character}${n}.png`,
      map2CSVURL: `${dir}/mask_${n+1}.csv`,
    });
    results.push({ n, dataURL });
    base = dataURL;
  }
  return results;
}

/* Example:
const masked = await maskColoredBase(childPNG, 'images/frames/tortoise/mask_1.csv', { erode: 1 });
const out2 = await colorAFrameAdvanced({
  frame1URL: masked,
  map1CSVURL: 'images/frames/tortoise/mask_1.csv',
  frame2URL: 'images/frames/tortoise/tortoise2.png',
  map2CSVURL: 'images/frames/tortoise/mask_2.csv'
});
*/
