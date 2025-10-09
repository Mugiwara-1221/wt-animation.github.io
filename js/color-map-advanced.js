
// color-map-advanced.js
// Texture transfer via normalized 100x100 mapping + per-block bounding boxes.
// Produces RGBA PNG data URLs (works fully in-browser).

/* -------------------- IO helpers -------------------- */
export async function loadCSV(url) {
    const txt = await fetch(url).then(r => r.text());
    return txt
      .trim()
      .split(/\r?\n/)
      .filter(line => line.length)
      .map(line => line.split(',').map(v => Number.parseInt(v.trim(), 10)));
  }
  
  export function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
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
  
  /* -------------------- Utilities -------------------- */
  export function countMaskUsage(maskMatrix) {
    const counts = new Map();
    const H = maskMatrix.length;
    if (!H) return counts;
    const W = maskMatrix[0].length;
    for (let y = 0; y < H; y++) {
      const row = maskMatrix[y];
      for (let x = 0; x < W; x++) {
        const v = row[x];
        if (v === -1 || v == null) continue;
        counts.set(v, (counts.get(v) || 0) + 1);
      }
    }
    return counts;
  }
  
  export function irregularTo100(y, x, xmin, xmax, ymin, ymax) {
    const height = Math.max(ymax - ymin, 1);
    const width  = Math.max(xmax - xmin, 1);
    const yNorm = (y - ymin) / height;
    const xNorm = (x - xmin) / width;
    const ny = Math.max(0, Math.min(99, Math.round(yNorm * 99)));
    const nx = Math.max(0, Math.min(99, Math.round(xNorm * 99)));
    return [ny, nx];
  }
  
  export function grid100ToIrregular(ny, nx, xmin, xmax, ymin, ymax) {
    const height = Math.max(ymax - ymin, 1);
    const width  = Math.max(xmax - xmin, 1);
    const y = Math.round(ymin + (ny / 99) * height);
    const x = Math.round(xmin + (nx / 99) * width);
    return [y, x];
  }
  
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
    if (!Number.isFinite(xmin)) throw new Error(`No pixels found for blockID=${blockID}`);
    return { xmin, xmax, ymin, ymax };
  }
  
  // single definition (prevents redeclare)
  export function scaleMask(mask, srcW, srcH, targetW, targetH) {
    const scaled = new Array(targetH);
    for (let y = 0; y < targetH; y++) {
      const row = new Array(targetW);
      const sy = Math.min(srcH - 1, Math.floor(y * srcH / targetH));
      for (let x = 0; x < targetW; x++) {
        const sx = Math.min(srcW - 1, Math.floor(x * srcW / targetW));
        row[x] = mask[sy][sx];
      }
      scaled[y] = row;
    }
    return scaled;
  }
  
  /* -------------------- Trim (mask) outside-the-lines -------------------- */
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
  
  /* -------------------- Core: color a single target frame -------------------- */
  /**
   * colorAFrameAdvanced
   * Transfers color/texture from a *masked* source image (pose1) onto a target frame (poseN).
   * Accepts maps as CSV URLs **or** as in-memory 2D arrays.
   *
   * Map conventions:
   *  -1 => transparent
   *   0 => keep target pixel (outline/background)
   *  >0 => block id (sample from source block with same id)
   */
  export async function colorAFrameAdvanced({
    // kept for backward-compat:
    frame1URL, map1CSVURL,
    frame2URL, map2CSVURL,
  
    // optional newer names:
    sourceImageURL,
    sourceMap,          // 2D array (optional alternative to map1CSVURL)
    targetMap,          // 2D array (optional alternative to map2CSVURL)
  }) {
    const srcURL = sourceImageURL || frame1URL;
    const tgtURL = targetFrameURL  || frame2URL;
    if (!srcURL || !tgtURL) throw new Error('Source and target image URLs are required.');
      
    // now loads rest of body tag (load images, get/scale maps, transfer, return {dataURL, usage})
  
    const [srcImg, tgtImg] = await Promise.all([ loadImage(srcURL), loadImage(tgtURL) ]);
    const idSrc = imageToImageData(srcImg);
    const idTgt = imageToImageData(tgtImg);
  
    const { width, height } = idTgt; // target drives output size
    const out  = emptyImageDataLike(width, height);
    const o    = out.data;
    const base = idTgt.data;
    const s    = idSrc.data;
  
    // get maps (array or CSV)
    let map1 = sourceMap || (map1CSVURL ? await loadCSV(map1CSVURL) : null);
    let mapN = targetMap || (map2CSVURL ? await loadCSV(map2CSVURL) : null);
    if (!map1 || !mapN) throw new Error('colorAFrameAdvanced: both source and target maps are required.');
  
    // scale maps to target size if needed
    const sH = map1.length, sW = map1[0].length;
    const tH = mapN.length, tW = mapN[0].length;
    if (sW !== width || sH !== height) map1 = scaleMask(map1, sW, sH, width, height);
    if (tW !== width || tH !== height) mapN = scaleMask(mapN, tW, tH, width, height);
  
    const usageSource = countMaskUsage(map1);
    const usageTarget = countMaskUsage(mapN);
  
    // gather block ids used by target
    const blockIDs = new Set();
    for (let y = 0; y < height; y++) {
      const row = mapN[y];
      for (let x = 0; x < width; x++) {
        const bid = row[x];
        if (bid > 0) blockIDs.add(bid);
      }
    }
  
    // precompute bboxes
    const bbox1 = new Map();
    const bboxN = new Map();
    for (const bid of blockIDs) {
      try { bbox1.set(bid, getBlockBBox(map1, bid)); } catch {}
      try { bboxN.set(bid, getBlockBBox(mapN, bid)); } catch {}
    }
  
    // transfer
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const bid = mapN[y][x];
  
        if (bid === -1) { o[idx]=o[idx+1]=o[idx+2]=0; o[idx+3]=0; continue; }
        if (bid === 0)  { o[idx]=base[idx]; o[idx+1]=base[idx+1]; o[idx+2]=base[idx+2]; o[idx+3]=base[idx+3]; continue; }
  
        const b1 = bbox1.get(bid);
        const bN = bboxN.get(bid);
        if (!b1 || !bN) {
          o[idx]=base[idx]; o[idx+1]=base[idx+1]; o[idx+2]=base[idx+2]; o[idx+3]=base[idx+3];
          continue;
        }
  
        const [ny, nx] = irregularTo100(y, x, bN.xmin, bN.xmax, bN.ymin, bN.ymax);
        const [sy, sx] = grid100ToIrregular(ny, nx, b1.xmin, b1.xmax, b1.ymin, b1.ymax);
        if (sy >= 0 && sy < height && sx >= 0 && sx < width) {
          const sidx = (sy * width + sx) * 4;
          o[idx]   = s[sidx];
          o[idx+1] = s[sidx+1];
          o[idx+2] = s[sidx+2];
          o[idx+3] = 255;
        } else {
          o[idx]=base[idx]; o[idx+1]=base[idx+1]; o[idx+2]=base[idx+2]; o[idx+3]=base[idx+3];
        }
      }
    }
  
    return {
      dataURL: imageDataToPNGDataURL(out),
      usage: { source: usageSource, target: usageTarget }
    };
  }
  
  /* -------------------- loop over N frames -------------------- */
  export async function colorCharacterFrames({
    character,           // { frameCount, framesPath, maskCSVPrefix, sourceMaskIndex? }
    maskedBaseDataURL,   // data URL from maskColoredBase()
  }) {
    const results = [];
    const usageByMask = [];
    const sourceMapURL = `${character.maskCSVPrefix}1.csv`;
  
    for (let n = 1; n <= character.frameCount; n++) {
      try {  
        const targetFrameURL = `${character.framesPath}${n}.png`;
        const targetMapURL   = `${character.maskCSVPrefix}${n}.csv`;

        const { dataURL, usage } = await colorAFrameAdvanced({
          frame1URL: maskedBaseDataURL,                      //source png URL
          map1CSVURL: sourceMapURL,     // source mask URL
          frame2URL: targetFrameURL,     // target png URL
          map2CSVURL: targetMapURL   // target mask URL
        });
  
        results.push({ n, dataURL });
        usageByMask.push({ n, usage });
        console.log(`Processed frame ${n}`);
      } catch (err) {
        console.warn(`Skipping frame ${n}: ${err.message}`);
      }
    }
  
    return { frames: results, usageByMask };
  }
  
  /* -------------------- (Optional) quick mask→canvas visualizer -------------------- */
  // If you have your own matrixToMaskCanvas, you can keep this for debugging.
  // Left commented so it doesn't reference undefined functions.
  /*
  async function processMaskAndTrack(prefix, width, height) {
    const csvMatrix = await loadCSV(prefix + ".csv");
    const usage = countMaskUsage(csvMatrix);
    console.log("Mask usage counts:", usage);
    // const maskCanvas = await matrixToMaskCanvas(csvMatrix, csvMatrix[0].length, csvMatrix.length, width, height);
    // return { maskCanvas, usage };
  }
  */
  