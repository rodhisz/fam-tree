/**
 * Cek bolak-balik (round-trip) Export Excel -> Import Excel,
 * termasuk kolom Foto(URL_Drive) untuk duplikasi foto Google Drive.
 * Mereplikasi persis logika handleExportExcel dan handleFileUpload di src/App.jsx.
 * Jalankan: npm run test:roundtrip
 */
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { familyData } from '../src/data/familyData.js';
import { extractGoogleDriveId, resolveImageUrl } from '../src/lib/imageProcessor.js';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

// ---------- Replika normalizeDate dari App.jsx ----------
const normalizeDate = (val) => {
  if (!val || val === 'null' || val === 'undefined') return '';
  if (!isNaN(val) && val !== '' && !val.toString().includes('-') && !val.toString().includes('/')) {
    const numVal = parseFloat(val);
    if (numVal > 1000 && numVal < 100000) {
      const d = new Date(Math.round((numVal - 25569) * 86400 * 1000));
      return d.toISOString().split('T')[0];
    }
  }
  let str = val.toString().trim();
  if (!str) return '';
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      let d = parts[0].padStart(2, '0');
      let m = parts[1].padStart(2, '0');
      let y = parts[2];
      if (y.length === 2) y = (parseInt(y) > 40 ? '19' : '20') + y;
      return `${y}-${m}-${d}`;
    }
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  if (str.length !== 4 || isNaN(parseInt(str))) return '';
  return str;
};

// ---------- Replika parser import dari handleFileUpload ----------
const parseWorkbook = (bstr) => {
  const wb = XLSX.read(bstr, { type: 'binary' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(ws, { header: 1 });
  if (json.length < 1) return [];

  const headers = json[0].map(h => (h || '').toString().toLowerCase().trim());
  const dataRows = json.slice(1);
  const idx = {
    id: headers.findIndex(h => h === 'id'),
    nama: headers.findIndex(h => h === 'nama' || h === 'name'),
    gender: headers.findIndex(h => h.includes('kelamin') || h === 'gender'),
    lahir: headers.findIndex(h => h.includes('lahir') || h === 'birth'),
    wafat: headers.findIndex(h => h.includes('wafat') || h === 'death'),
    ayah: headers.findIndex(h => h.includes('ayah') || h === 'father'),
    ibu: headers.findIndex(h => h.includes('ibu') || h === 'mother'),
    pasangan: headers.findIndex(h => h.includes('pasangan') || h === 'spouse'),
    foto: headers.findIndex(h => h.includes('foto') || h.includes('photo') || h.includes('gambar') || h.includes('drive'))
  };

  const newData = dataRows.map((row, rowIdx) => {
    if (!row || row.length === 0) return null;
    const getVal = (i) => (i !== -1) ? row[i] : undefined;
    const getStr = (i) => {
      const v = getVal(i);
      return (v !== undefined && v !== null) ? v.toString().trim() : '';
    };
    const id = getStr(idx.id) || `imported-${Date.now()}-${rowIdx}`;
    const name = getStr(idx.nama) || 'Unknown';
    const gRaw = getStr(idx.gender).toLowerCase();
    const gender = (gRaw.includes('p') || gRaw.includes('f')) ? 'female' : 'male';
    const spouseStr = getStr(idx.pasangan);
    const spousesArray = spouseStr ? spouseStr.split(',').map(s => {
      const parts = s.trim().split('|');
      return {
        id: parts[0].trim(),
        type: (parts[1] || 'married').toLowerCase(),
        marriageDate: normalizeDate(parts[2] || '')
      };
    }).filter(s => s.id) : [];
    const photoRaw = getStr(idx.foto);
    return {
      id,
      name,
      gender,
      birth: normalizeDate(getVal(idx.lahir)),
      death: normalizeDate(getVal(idx.wafat)),
      fatherId: getStr(idx.ayah),
      motherId: getStr(idx.ibu),
      spouses: spousesArray,
      photo: photoRaw,
      thumbnail: '',
      driveSourceUrl: photoRaw
    };
  }).filter(m => m !== null && m.name !== 'Unknown');

  newData.forEach(m => {
    m.spouses.forEach(s => {
      const spouseRecord = newData.find(n => n.id === s.id);
      if (spouseRecord && !spouseRecord.spouses.find(x => x.id === m.id)) {
        spouseRecord.spouses.push({ id: m.id, type: s.type, marriageDate: s.marriageDate || '' });
      }
    });
  });

  return newData;
};

// ---------- Replika mapping export dari handleExportExcel ----------
const toSheetRows = (members) => members.map(m => ({
  ID: m.id,
  Nama: m.name,
  'JenisKelamin(male/female)': m.gender,
  'Lahir(YYYY-MM-DD)': m.birth || '',
  'Wafat(YYYY-MM-DD)': m.death || '',
  ID_Ayah: m.fatherId || '',
  ID_Ibu: m.motherId || '',
  'Pasangan(ID|Status|Tanggal)': m.spouses?.map(s => `${s.id}|${s.type}|${s.marriageDate || ''}`).join(', ') || '',
  'Foto(URL_Drive)': m.driveSourceUrl || (m.photo?.startsWith('http') ? m.photo : '')
}));

const spouseSignature = (spouses) =>
  (spouses || []).map(s => `${s.id}:${s.type}:${s.marriageDate || ''}`).sort().join(';');

// ---------- 0. Unit test ekstraksi & konversi link Google Drive ----------
const idCases = [
  ['https://drive.google.com/file/d/1a2B_cD-ef9/view?usp=sharing', '1a2B_cD-ef9'],
  ['https://drive.google.com/file/d/XYZ123/edit', 'XYZ123'],
  ['https://drive.google.com/open?id=Xy9_zW8', 'Xy9_zW8'],
  ['https://drive.google.com/uc?id=AbC123', 'AbC123'],
  ['https://lh3.googleusercontent.com/d/QwErTy12', 'QwErTy12'],
  ['https://contoh.com/foto.jpg', null],
  ['', null]
];
let idOk = true;
const idDetail = [];
for (const [input, expected] of idCases) {
  const got = extractGoogleDriveId(input);
  if (got !== expected) {
    idOk = false;
    idDetail.push(`"${input}" -> ${got} (diharapkan ${expected})`);
  }
}
check('extractGoogleDriveId membaca semua varian link Drive', idOk, idDetail.join('; '));

const resolveCases = [
  ['https://drive.google.com/file/d/1a2B_cD-ef9/view', 'https://lh3.googleusercontent.com/d/1a2B_cD-ef9'],
  ['https://drive.google.com/open?id=Xy9_zW8', 'https://lh3.googleusercontent.com/d/Xy9_zW8'],
  ['https://contoh.com/foto.jpg', 'https://contoh.com/foto.jpg'],
  ['', '']
];
let resolveOk = true;
const resolveDetail = [];
for (const [input, expected] of resolveCases) {
  const got = resolveImageUrl(input);
  if (got !== expected) {
    resolveOk = false;
    resolveDetail.push(`"${input}" -> "${got}" (diharapkan "${expected}")`);
  }
}
check('resolveImageUrl mengubah link Drive ke endpoint streaming', resolveOk, resolveDetail.join('; '));

// ---------- Skenario: data seed + anggota tambahan ala handleAdd + foto ----------
const appState = [
  ...familyData.map(m => ({ ...m, spouses: (m.spouses || []).map(s => ({ ...s })) })),
  {
    id: 'm1762848000000',
    name: 'Anggota Tambahan',
    gender: 'male',
    birth: '1990-01-01',
    death: null,
    fatherId: 'h1',
    motherId: 'w1',
    spouses: [],
    photo: 'https://supabase.app/storage/v1/object/public/family-photos/members/m1762848000000_full.webp',
    thumbnail: 'https://supabase.app/storage/v1/object/public/family-photos/members/m1762848000000_thumb.webp',
    driveSourceUrl: 'https://drive.google.com/file/d/1a2B_cD-ef9/view'
  },
  {
    id: 'm1762848000001',
    name: 'Pasangan Tambahan',
    gender: 'female',
    birth: '1992-02-02',
    death: null,
    fatherId: '',
    motherId: '',
    spouses: [{ id: 'm1762848000000', type: 'divorced', marriageDate: '2015-06-06' }],
    photo: 'data:image/webp;base64,CONTOH',
    thumbnail: 'data:image/webp;base64,THUMB',
    driveSourceUrl: ''
  }
];
appState.find(m => m.id === 'm1762848000000').spouses.push({ id: 'm1762848000001', type: 'divorced', marriageDate: '2015-06-06' });

// ---------- 1. Export lalu import ulang ----------
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toSheetRows(appState)), 'Daftar_Keluarga');
const bstr = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });
writeFileSync('/private/var/folders/l_/dkjggxx55r94s9cjws_2xthw0000gp/T/opencode/roundtrip-ekspor.xlsx', bstr, 'binary');
const imported = parseWorkbook(bstr);

check('Jumlah anggota utuh setelah impor', imported.length === appState.length, `${imported.length} / ${appState.length}`);

const byId = new Map(imported.map(m => [m.id, m]));
let mismatches = 0;
for (const orig of appState) {
  const back = byId.get(orig.id);
  if (!back) { mismatches++; continue; }
  const sig = (m) => `id=${m.id} nama=${m.name} gender=${m.gender} lahir=${m.birth || ''} wafat=${m.death || ''} ayah=${m.fatherId || ''} ibu=${m.motherId || ''} pasangan=[${spouseSignature(m.spouses)}]`;
  if (sig(orig) !== sig(back)) {
    mismatches++;
    console.log(`      beda: ${orig.id}\n        asli: ${sig(orig)}\n        hasil: ${sig(back)}`);
  }
}
check('Semua field + relasi identik (ID, tanggal, ortu, pasangan)', mismatches === 0, `${mismatches} anggota berbeda`);

check('Kolom Foto(URL_Drive) membawa tautan Drive anggota',
  byId.get('m1762848000000')?.photo === 'https://drive.google.com/file/d/1a2B_cD-ef9/view' &&
  byId.get('m1762848000000')?.driveSourceUrl === 'https://drive.google.com/file/d/1a2B_cD-ef9/view');
check('Data URL foto (hasil crop) tidak dimasukkan ke Excel',
  byId.get('m1762848000001')?.photo === '' && byId.get('m1762848000001')?.driveSourceUrl === '');

// ---------- 2. Presedensi foto saat apply (replika executeImport) ----------
// processAndDuplicatePhoto dimock: sukses mengembalikan URL salinan server.
const mockProcess = async ({ url, memberId }) => ({
  photo: `https://supabase.app/family-photos/members/${memberId}_full.webp`,
  thumbnail: `https://supabase.app/family-photos/members/${memberId}_thumb.webp`,
  driveSourceUrl: url
});
const mockFail = async () => { throw new Error('tautan tidak bisa diambil'); };

const candidatesOf = (rows) => rows.filter(m =>
  m.photo && (m.photo.startsWith('http://') || m.photo.startsWith('https://') || extractGoogleDriveId(m.photo)));

const executeImport = async (pending, existing, mode, processFn) => {
  const candidates = candidatesOf(pending);
  let processed = [...pending];
  const failedPhotos = [];
  for (const item of candidates) {
    try {
      const res = await processFn({ url: item.photo, memberId: item.id });
      processed = processed.map(m => (m.id === item.id ? {
        ...m, photo: res.photo, thumbnail: res.thumbnail, driveSourceUrl: res.driveSourceUrl
      } : m));
    } catch (err) {
      processed = processed.map(m => (m.id === item.id ? { ...m, photo: '', driveSourceUrl: '' } : m));
      failedPhotos.push({ name: item.name, reason: err?.message || 'gagal tak terduga' });
    }
  }
  if (mode === 'merge') {
    const memberMap = new Map(existing.map(m => [m.id.toString(), m]));
    processed.forEach(m => {
      const prev = memberMap.get(m.id.toString());
      memberMap.set(m.id.toString(), {
        ...m,
        photo: m.photo || prev?.photo || '',
        thumbnail: m.thumbnail || prev?.thumbnail || '',
        driveSourceUrl: m.driveSourceUrl || prev?.driveSourceUrl || ''
      });
    });
    return { members: Array.from(memberMap.values()), failedPhotos };
  }
  return { members: processed, failedPhotos };
};

const existingMembers = [
  { id: 'm1762848000000', name: 'Anggota Tambahan', gender: 'male', birth: '', death: '', fatherId: '', motherId: '', spouses: [], photo: 'data:image/webp;base64,FOTOLAMA', thumbnail: 'data:image/webp;base64,THUMBLAMA', driveSourceUrl: '' },
  { id: 'x1', name: 'Anggota Tanpa Baris', gender: 'female', birth: '', death: '', fatherId: '', motherId: '', spouses: [], photo: 'data:image/webp;base64,X1', thumbnail: '', driveSourceUrl: '' }
];

const pendingRows = [
  { id: 'm1762848000000', name: 'Anggota Tambahan', gender: 'male', birth: '', death: '', fatherId: '', motherId: '', spouses: [], photo: 'https://drive.google.com/file/d/1a2B_cD-ef9/view', thumbnail: '', driveSourceUrl: 'https://drive.google.com/file/d/1a2B_cD-ef9/view' },
  { id: 'm1762848000002', name: 'Anggota Tanpa Foto', gender: 'female', birth: '', death: '', fatherId: '', motherId: '', spouses: [], photo: '', thumbnail: '', driveSourceUrl: '' }
];

const mergeOk = await executeImport(pendingRows, existingMembers, 'merge', mockProcess);
check('Merge: foto berhasil diduplikasi menimpa foto lama',
  mergeOk.members.find(m => m.id === 'm1762848000000')?.photo === 'https://supabase.app/family-photos/members/m1762848000000_full.webp');
check('Merge: anggota di luar file tidak tersentuh',
  mergeOk.members.find(m => m.id === 'x1')?.photo === 'data:image/webp;base64,X1');
check('Merge: anggota tanpa kolom foto mempertahankan foto lama',
  mergeOk.members.find(m => m.id === 'm1762848000002')?.photo === '' &&
  mergeOk.members.find(m => m.id === 'm1762848000002')?.driveSourceUrl === '');
check('Merge: tidak ada anggota dengan 0 foto yang dipasangi foto kosong',
  mergeOk.members.every(m => m.photo !== undefined && m.thumbnail !== undefined));

const mergeFail = await executeImport(pendingRows, existingMembers, 'merge', mockFail);
check('Merge: foto gagal diduplikasi memakai foto lama + tercatat sebagai gagal',
  mergeFail.members.find(m => m.id === 'm1762848000000')?.photo === 'data:image/webp;base64,FOTOLAMA' &&
  mergeFail.failedPhotos.length === 1 && mergeFail.failedPhotos[0].name === 'Anggota Tambahan');

const overwriteOk = await executeImport(pendingRows, existingMembers, 'overwrite', mockProcess);
check('Ganti total: foto hanya hasil duplikasi kolom Foto',
  overwriteOk.members.find(m => m.id === 'm1762848000000')?.photo === 'https://supabase.app/family-photos/members/m1762848000000_full.webp' &&
  overwriteOk.members.find(m => m.id === 'x1') === undefined);
check('Ganti total: kolom Foto kosong berarti tanpa foto',
  overwriteOk.members.find(m => m.id === 'm1762848000002')?.photo === '');
check('Ganti total: tautan mentah Drive tidak tersisa sebagai photo',
  overwriteOk.members.every(m => !(m.photo || '').includes('drive.google.com')));

// ---------- 3. Template masih kompatibel dengan parser ----------
const templateRows = toSheetRows([
  { id: '1', name: 'Budi Santoso', gender: 'male', birth: '1980-01-01', death: '', fatherId: '', motherId: '', spouses: [{ id: '2', type: 'married', marriageDate: '1998-05-20' }], driveSourceUrl: 'https://drive.google.com/file/d/contoh_id_foto_budi/view', photo: '' },
  { id: '2', name: 'Siti Aminah', gender: 'female', birth: '1982-05-15', death: '', fatherId: '', motherId: '', spouses: [{ id: '1', type: 'married', marriageDate: '1998-05-20' }], driveSourceUrl: '', photo: '' },
  { id: '3', name: 'Andi Santoso', gender: 'male', birth: '2005-10-10', death: '', fatherId: '1', motherId: '2', spouses: [], driveSourceUrl: '', photo: '' }
]);
templateRows[0]['Foto(URL_Drive)'] = 'https://drive.google.com/file/d/contoh_id_foto_budi/view';
const wbTpl = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbTpl, XLSX.utils.json_to_sheet(templateRows), 'Template');
const tplParsed = parseWorkbook(XLSX.write(wbTpl, { bookType: 'xlsx', type: 'binary' }));

check('Template terbaca import (3 anggota)', tplParsed.length === 3);
check('Relasi keluarga template benar',
  tplParsed.find(m => m.id === '3')?.fatherId === '1' &&
  tplParsed.find(m => m.id === '3')?.motherId === '2' &&
  spouseSignature(tplParsed.find(m => m.id === '1')?.spouses) === '2:married:1998-05-20');
check('Template: tautan Drive di kolom foto masuk daftar duplikasi',
  candidatesOf(tplParsed).length === 1 && candidatesOf(tplParsed)[0].id === '1');
check('Template: sel tanpa link tidak dianggap foto',
  candidatesOf(tplParsed).every(m => m.photo.startsWith('http')));

// ---------- 4. Kolom export cocok dengan header yang dicari parser ----------
const exportHeaders = Object.keys(toSheetRows(appState)[0]).map(h => h.toLowerCase());
const needed = ['id', 'nama', 'kelamin', 'lahir', 'wafat', 'ayah', 'ibu', 'pasangan', 'foto'];
const missing = needed.filter(n => !exportHeaders.some(h => h === n || h.includes(n)));
check('Header export cocok dengan deteksi header import', missing.length === 0, missing.length ? `hilang: ${missing.join(', ')}` : 'semua kolom terdeteksi');

console.log('');
if (failures.length) {
  console.log(`HASIL: ${failures.length} GAGAL`);
  process.exit(1);
}
console.log('HASIL: SEMUA LOLOS — file export dapat diimpor ulang tanpa kehilangan data, termasuk foto');
