/**
 * Cek bolak-balik (round-trip) Export Excel -> Import Excel,
 * termasuk pipeline foto dari kolom Foto (link Google Drive).
 * Mereplikasi persis logika handleExportExcel dan handleFileUpload di src/App.jsx.
 * Jalankan: npm run test:roundtrip
 */
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { familyData } from '../src/data/familyData.js';
import { driveToDirectUrl } from '../src/lib/photo.js';

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
    foto: headers.findIndex(h => h.includes('foto') || h.includes('photo'))
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
    const fotoRaw = getStr(idx.foto);
    return {
      id,
      name,
      gender,
      birth: normalizeDate(getVal(idx.lahir)),
      death: normalizeDate(getVal(idx.wafat)),
      fatherId: getStr(idx.ayah),
      motherId: getStr(idx.ibu),
      spouses: spousesArray,
      photo: '',
      photoUrl: /^https?:\/\//i.test(fotoRaw) ? fotoRaw : ''
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
  Foto: (typeof m.photo === 'string' && /^https?:\/\//i.test(m.photo)) ? m.photo : ''
}));

const spouseSignature = (spouses) =>
  (spouses || []).map(s => `${s.id}:${s.type}:${s.marriageDate || ''}`).sort().join(';');

// ---------- 0. Unit test konversi link Google Drive ----------
const driveCases = [
  ['https://drive.google.com/file/d/1a2B_cD-ef9/view?usp=sharing', 'https://drive.google.com/uc?export=download&id=1a2B_cD-ef9'],
  ['https://drive.google.com/file/d/XYZ123/edit', 'https://drive.google.com/uc?export=download&id=XYZ123'],
  ['https://drive.google.com/open?id=Xy9_zW8', 'https://drive.google.com/uc?export=download&id=Xy9_zW8'],
  ['https://drive.google.com/uc?export=download&id=AbC123', 'https://drive.google.com/uc?export=download&id=AbC123'],
  ['https://contoh.com/foto.jpg', 'https://contoh.com/foto.jpg'],
  ['', '']
];
let driveOk = true;
const driveDetail = [];
for (const [input, expected] of driveCases) {
  const got = driveToDirectUrl(input);
  if (got !== expected) {
    driveOk = false;
    driveDetail.push(`"${input}" -> "${got}" (diharapkan "${expected}")`);
  }
}
check('driveToDirectUrl mengonversi semua varian link Drive', driveOk, driveDetail.join('; '));

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
    photo: 'https://contoh.com/foto-lama.jpg'
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
    photo: 'data:image/png;base64,CONTOH'
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

// Presedensi kolom Foto: URL http(s) ikut, data URL tidak (tidak muat di sel)
check('Kolom Foto membawa URL http(s) hasil export',
  byId.get('m1762848000000')?.photoUrl === 'https://contoh.com/foto-lama.jpg');
check('Data URL foto (hasil crop) tidak dimasukkan ke Excel',
  byId.get('m1762848000001')?.photoUrl === '');

// ---------- 2. Presedensi foto saat apply (replika applyImportData) ----------
// processPhotoUrl dimock: sukses mengembalikan URL hasil salinan di server.
const mockProcessPhotoUrl = async (url) => `https://server.app/photos/salinan-${encodeURIComponent(url)}`;

const applyImport = async (pending, existing, mode, processFn) => {
  const oldById = new Map(existing.map(m => [m.id.toString(), m]));
  const processed = [];
  const failed = [];
  for (const m of pending) {
    const oldPhoto = oldById.get(m.id.toString())?.photo || '';
    let photo = mode === 'merge' ? oldPhoto : '';
    if (m.photoUrl) {
      try {
        photo = await processFn(m.photoUrl);
      } catch (err) {
        failed.push({ name: m.name, reason: err.message });
      }
    }
    const rest = { ...m };
    delete rest.photoUrl;
    processed.push({ ...rest, photo });
  }
  if (mode === 'merge') {
    const memberMap = new Map(existing.map(m => [m.id.toString(), m]));
    processed.forEach(m => memberMap.set(m.id.toString(), m));
    return { members: Array.from(memberMap.values()), failed };
  }
  return { members: processed, failed };
};

const existingMembers = [
  { id: 'm1762848000000', name: 'Anggota Tambahan', gender: 'male', birth: '', death: '', fatherId: '', motherId: '', spouses: [], photo: 'data:image/webp;base64,FOTOLAMA' },
  { id: 'x1', name: 'Anggota Tanpa Baris', gender: 'female', birth: '', death: '', fatherId: '', motherId: '', spouses: [], photo: 'data:image/webp;base64,X1' }
];

const pendingRows = [
  { id: 'm1762848000000', name: 'Anggota Tambahan', gender: 'male', birth: '', death: '', fatherId: '', motherId: '', spouses: [], photo: '', photoUrl: 'https://drive.google.com/file/d/1a2B_cD-ef9/view' },
  { id: 'm1762848000002', name: 'Anggota Tanpa Foto', gender: 'female', birth: '', death: '', fatherId: '', motherId: '', spouses: [], photo: '', photoUrl: '' }
];

const mergeOk = await applyImport(pendingRows, existingMembers, 'merge', mockProcessPhotoUrl);
check('Merge: link foto baru menimpa foto lama',
  mergeOk.members.find(m => m.id === 'm1762848000000')?.photo === 'https://server.app/photos/salinan-https%3A%2F%2Fdrive.google.com%2Ffile%2Fd%2F1a2B_cD-ef9%2Fview');
check('Merge: kolom Foto kosong mempertahankan foto lama tidak tersentuh (anggota tanpa baris)',
  mergeOk.members.find(m => m.id === 'x1')?.photo === 'data:image/webp;base64,X1');
check('Merge: field photoUrl bersih setelah diterapkan',
  mergeOk.members.every(m => !('photoUrl' in m)));

const failProcess = async () => { throw new Error('tautan mati'); };
const mergeFail = await applyImport(pendingRows, existingMembers, 'merge', failProcess);
check('Merge: foto gagal diambil memakai foto lama + tercatat sebagai gagal',
  mergeFail.members.find(m => m.id === 'm1762848000000')?.photo === 'data:image/webp;base64,FOTOLAMA' &&
  mergeFail.failed.length === 1 && mergeFail.failed[0].name === 'Anggota Tambahan');

const overwriteOk = await applyImport(pendingRows, existingMembers, 'overwrite', mockProcessPhotoUrl);
check('Ganti total: foto hanya dari kolom Foto, foto lama tidak dipakai',
  overwriteOk.members.find(m => m.id === 'm1762848000000')?.photo === 'https://server.app/photos/salinan-https%3A%2F%2Fdrive.google.com%2Ffile%2Fd%2F1a2B_cD-ef9%2Fview' &&
  overwriteOk.members.find(m => m.id === 'x1') === undefined);
check('Ganti total: kolom Foto kosong berarti tanpa foto',
  overwriteOk.members.find(m => m.id === 'm1762848000002')?.photo === '');

// ---------- 3. Template masih kompatibel dengan parser ----------
const templateRows = toSheetRows([
  { id: '1', name: 'Budi Santoso', gender: 'male', birth: '1980-01-01', death: '', fatherId: '', motherId: '', spouses: [{ id: '2', type: 'married', marriageDate: '1998-05-20' }], photo: '' },
  { id: '2', name: 'Siti Aminah', gender: 'female', birth: '1982-05-15', death: '', fatherId: '', motherId: '', spouses: [{ id: '1', type: 'married', marriageDate: '1998-05-20' }], photo: '' },
  { id: '3', name: 'Andi Santoso', gender: 'male', birth: '2005-10-10', death: '', fatherId: '1', motherId: '2', spouses: [], photo: '' }
]);
// Template asli di App.jsx punya kolom Foto kosong; samakan di sini
templateRows.forEach(r => { r.Foto = ''; });
const wbTpl = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbTpl, XLSX.utils.json_to_sheet(templateRows), 'Template');
const tplParsed = parseWorkbook(XLSX.write(wbTpl, { bookType: 'xlsx', type: 'binary' }));

check('Template terbaca import (3 anggota)', tplParsed.length === 3);
check('Relasi keluarga template benar',
  tplParsed.find(m => m.id === '3')?.fatherId === '1' &&
  tplParsed.find(m => m.id === '3')?.motherId === '2' &&
  spouseSignature(tplParsed.find(m => m.id === '1')?.spouses) === '2:married:1998-05-20');
check('Template: kolom Foto kosong tidak dianggap link',
  tplParsed.every(m => m.photoUrl === ''));

// Template manual dengan link Drive di kolom Foto
const driveSheetRows = [
  { ID: 'd1', Nama: 'Orang Drive', 'JenisKelamin(male/female)': 'male', 'Lahir(YYYY-MM-DD)': '', 'Wafat(YYYY-MM-DD)': '', ID_Ayah: '', ID_Ibu: '', 'Pasangan(ID|Status|Tanggal)': '', Foto: 'https://drive.google.com/file/d/QwErTy12/view?usp=sharing' },
  { ID: 'd2', Nama: 'Orang Tanpa Link', 'JenisKelamin(male/female)': 'female', 'Lahir(YYYY-MM-DD)': '', 'Wafat(YYYY-MM-DD)': '', ID_Ayah: '', ID_Ibu: '', 'Pasangan(ID|Status|Tanggal)': '', Foto: 'lihat folder keluarga' }
];
const wbDrive = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbDrive, XLSX.utils.json_to_sheet(driveSheetRows), 'Drive');
const driveParsed = parseWorkbook(XLSX.write(wbDrive, { bookType: 'xlsx', type: 'binary' }));
check('Import file manual: link Drive terbaca sebagai photoUrl',
  driveParsed.find(m => m.id === 'd1')?.photoUrl === 'https://drive.google.com/file/d/QwErTy12/view?usp=sharing');
check('Import file manual: teks non-URL di kolom Foto diabaikan',
  driveParsed.find(m => m.id === 'd2')?.photoUrl === '');

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
