/**
 * Pipeline foto untuk import Excel: ambil dari URL (termasuk link Google Drive),
 * kompres, lalu simpan ke storage Supabase (atau data URL di mode lokal).
 */

// Link berbagi Drive → URL unduhan langsung
export const driveToDirectUrl = (rawUrl) => {
  const url = (rawUrl || '').toString().trim();
  if (!url) return '';
  const fileD = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileD) return `https://drive.google.com/uc?export=download&id=${fileD[1]}`;
  const openId = url.match(/drive\.google\.com\/[^\s]*[?&]id=([a-zA-Z0-9_-]+)/);
  if (openId) return `https://drive.google.com/uc?export=download&id=${openId[1]}`;
  return url;
};

const MAX_DIM = 512;
const QUALITY = 0.82;
const MAX_FETCH_BYTES = 20 * 1024 * 1024;

// Kompres gambar: maksimal sisi panjang 512px (avatar ditampilkan maksimal 100px,
// 512px cukup untuk retina), WebP bila didukung, fallback JPEG.
export const compressImageBlob = async (blob, maxDim = MAX_DIM, quality = QUALITY) => {
  const bitmap = await createImageBitmap(blob).catch(() => null);
  if (!bitmap) throw new Error('berkas tidak dapat dibaca sebagai gambar');

  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const type = canvas.toDataURL('image/webp').startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
  const out = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  if (!out) throw new Error('kompresi gagal');
  return { blob: out, type };
};

// Ambil foto dari URL. Coba fetch langsung; jika diblokir CORS, pakai
// edge function proxy Supabase (supabase/functions/fetch-photo).
const fetchImageResponse = async (targetUrl, supabase) => {
  try {
    return await fetch(targetUrl, { mode: 'cors' });
  } catch {
    if (!supabase) throw new Error('tidak dapat mengambil gambar dari tautan ini (diblokir CORS, mode lokal)');
    const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-photo`;
    const res = await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ url: targetUrl })
    });
    if (!res.ok) throw new Error(`proxy gagal (HTTP ${res.status})`);
    return res;
  }
};

// Proses satu foto: unduh, validasi, kompres, simpan.
// Return: URL publik bucket (mode Supabase) atau data URL (mode lokal).
export const processPhotoUrl = async (rawUrl, memberId, supabase) => {
  const targetUrl = driveToDirectUrl(rawUrl);
  if (!/^https?:\/\//.test(targetUrl)) throw new Error('bukan URL gambar');

  const res = await fetchImageResponse(targetUrl, supabase);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const contentType = (res.headers.get('content-type') || '').toLowerCase().split(';')[0];
  if (!contentType.startsWith('image/')) throw new Error('berkas bukan gambar');

  const blob = await res.blob();
  if (blob.size > MAX_FETCH_BYTES) throw new Error('gambar terlalu besar');

  const { blob: compressed, type } = await compressImageBlob(blob);

  if (supabase) {
    const ext = type === 'image/webp' ? 'webp' : 'jpg';
    const path = `members/${memberId}.${ext}`;
    const { error } = await supabase.storage
      .from('photos')
      .upload(path, compressed, { contentType: type, upsert: true });
    if (error) throw new Error('gagal unggah ke penyimpanan');
    const { data } = supabase.storage.from('photos').getPublicUrl(path);
    return data.publicUrl;
  }

  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('gagal membaca gambar'));
    reader.readAsDataURL(compressed);
  });
};
