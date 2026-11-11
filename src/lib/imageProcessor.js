/**
 * Ekstraksi ID file dari berbagai format URL Google Drive
 */
export function extractGoogleDriveId(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();

  // Format: drive.google.com/file/d/<id>/...
  const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];

  // Format: drive.google.com/open?id=<id> atau drive.google.com/uc?id=<id>
  const queryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (queryMatch) return queryMatch[1];

  // Format: lh3.googleusercontent.com/d/<id>
  const lh3Match = trimmed.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
  if (lh3Match) return lh3Match[1];

  return null;
}

/**
 * Mengubah URL Google Drive menjadi direct streaming endpoint
 */
export function resolveImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const driveId = extractGoogleDriveId(url);
  if (driveId) {
    return `https://lh3.googleusercontent.com/d/${driveId}`;
  }
  return url.trim();
}

/**
 * Memuat gambar HTMLImageElement dengan timeout dan crossOrigin
 */
export function loadImage(src, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const timer = setTimeout(() => {
      img.src = '';
      reject(new Error(`Timeout memuat gambar: ${src}`));
    }, timeoutMs);

    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };

    img.onerror = (err) => {
      clearTimeout(timer);
      reject(err);
    };

    img.src = src;
  });
}

/**
 * Mengubah canvas menjadi Blob WebP dengan fallback JPEG jika WebP tidak didukung
 */
function canvasToWebpBlob(canvas, quality = 0.8) {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          // Fallback jika browser lawas tidak mendukung image/webp di toBlob
          canvas.toBlob((fallbackBlob) => resolve(fallbackBlob), 'image/jpeg', quality);
        }
      },
      'image/webp',
      quality
    );
  });
}

/**
 * Helper mengonversi Blob menjadi dataURL Base64 (untuk fallback offline)
 */
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Menghasilkan 2 tier gambar:
 * 1. HD (max 1400px, aspect ratio asli, quality 0.82) untuk preview lightbox jernih
 * 2. Thumbnail (square 300x300px center crop, quality 0.78) untuk pohon silsilah
 */
export async function generateAvatarTiers(img) {
  const naturalWidth = img.naturalWidth || img.width;
  const naturalHeight = img.naturalHeight || img.height;

  // 1. Tier Full / HD (Max 1400px)
  const maxHdDim = 1400;
  let hdWidth = naturalWidth;
  let hdHeight = naturalHeight;

  if (naturalWidth > maxHdDim || naturalHeight > maxHdDim) {
    if (naturalWidth >= naturalHeight) {
      hdWidth = maxHdDim;
      hdHeight = Math.round((naturalHeight * maxHdDim) / naturalWidth);
    } else {
      hdHeight = maxHdDim;
      hdWidth = Math.round((naturalWidth * maxHdDim) / naturalHeight);
    }
  }

  const hdCanvas = document.createElement('canvas');
  hdCanvas.width = hdWidth;
  hdCanvas.height = hdHeight;
  const hdCtx = hdCanvas.getContext('2d');
  hdCtx.imageSmoothingEnabled = true;
  hdCtx.imageSmoothingQuality = 'high';
  hdCtx.drawImage(img, 0, 0, hdWidth, hdHeight);
  const hdBlob = await canvasToWebpBlob(hdCanvas, 0.82);

  // 2. Tier Thumbnail (Square 300x300px center crop)
  const thumbDim = 300;
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = thumbDim;
  thumbCanvas.height = thumbDim;
  const thumbCtx = thumbCanvas.getContext('2d');
  thumbCtx.imageSmoothingEnabled = true;
  thumbCtx.imageSmoothingQuality = 'high';

  const minSide = Math.min(naturalWidth, naturalHeight);
  const cropX = (naturalWidth - minSide) / 2;
  const cropY = (naturalHeight - minSide) / 2;

  thumbCtx.drawImage(
    img,
    cropX, cropY, minSide, minSide,
    0, 0, thumbDim, thumbDim
  );
  const thumbBlob = await canvasToWebpBlob(thumbCanvas, 0.78);

  return { hdBlob, thumbBlob };
}

/**
 * Mengunggah 2 tier foto ke Supabase Storage bucket 'family-photos'
 * Jika Supabase tidak tersedia, mengembalikan representasi dataURL terkompresi.
 */
export async function uploadTieredPhotos({ memberId, hdBlob, thumbBlob, supabaseClient }) {
  const safeId = (memberId || `temp_${Date.now()}`).toString().replace(/[^a-zA-Z0-9_-]/g, '_');
  const timestamp = Date.now();

  if (supabaseClient) {
    try {
      const bucketName = 'family-photos';
      const fullPath = `members/${safeId}_${timestamp}_full.webp`;
      const thumbPath = `members/${safeId}_${timestamp}_thumb.webp`;

      // Upload Full HD
      const { error: fullErr } = await supabaseClient.storage
        .from(bucketName)
        .upload(fullPath, hdBlob, {
          contentType: 'image/webp',
          upsert: true
        });

      // Upload Thumbnail
      const { error: thumbErr } = await supabaseClient.storage
        .from(bucketName)
        .upload(thumbPath, thumbBlob, {
          contentType: 'image/webp',
          upsert: true
        });

      if (!fullErr && !thumbErr) {
        const { data: fullPublic } = supabaseClient.storage
          .from(bucketName)
          .getPublicUrl(fullPath);
        const { data: thumbPublic } = supabaseClient.storage
          .from(bucketName)
          .getPublicUrl(thumbPath);

        return {
          photo: fullPublic?.publicUrl || '',
          thumbnail: thumbPublic?.publicUrl || ''
        };
      }
      console.warn('Gagal upload ke Supabase Storage, beralih ke format lokal:', fullErr || thumbErr);
    } catch (e) {
      console.warn('Supabase storage error:', e);
    }
  }

  // Fallback offline / local: dataURL WebP (tetap jauh lebih hemat dibanding raw camera file)
  const photo = await blobToDataUrl(hdBlob);
  const thumbnail = await blobToDataUrl(thumbBlob);
  return { photo, thumbnail };
}

/**
 * Memproses satu URL foto (Google Drive atau URL langsung),
 * mengunduh, mengompres 2-tier, dan mengunggah ke storage.
 */
export async function processAndDuplicatePhoto({ url, memberId, supabaseClient }) {
  const directUrl = resolveImageUrl(url);
  if (!directUrl) return null;

  try {
    const img = await loadImage(directUrl);
    const { hdBlob, thumbBlob } = await generateAvatarTiers(img);
    const result = await uploadTieredPhotos({
      memberId,
      hdBlob,
      thumbBlob,
      supabaseClient
    });

    return {
      photo: result.photo,
      thumbnail: result.thumbnail,
      driveSourceUrl: url
    };
  } catch (err) {
    console.warn(`Gagal memproses foto untuk ${memberId} dari ${url}:`, err);
    return null;
  }
}
