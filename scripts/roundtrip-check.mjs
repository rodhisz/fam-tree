/**
 * Cek bolak-balik (round-trip) Export Excel -> Import Excel.
 * Mereplikasi persis logika handleExportExcel dan handleFileUpload di src/App.jsx.
 * Jalankan: npm run test:roundtrip
 */
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { familyData } from '../src/data/familyData.js';

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
    pasangan: headers.findIndex(h => h.includes('pasangan') || h === 'spouse')
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
    return {
      id,
      name,
      gender,
      birth: normalizeDate(getVal(idx.lahir)),
      death: normalizeDate(getVal(idx.wafat)),
      fatherId: getStr(idx.ayah),
      motherId: getStr(idx.ibu),
      spouses: spousesArray,
      photo: ''
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
  'Pasangan(ID|Status|Tanggal)': m.spouses?.map(s => `${s.id}|${s.type}|${s.marriageDate || ''}`).join(', ') || ''
}));

const spouseSignature = (spouses) =>
  (spouses || []).map(s => `${s.id}:${s.type}:${s.marriageDate || ''}`).sort().join(';');

const memberSignature = (m) =>
  `id=${m.id} nama=${m.name} gender=${m.gender} lahir=${m.birth || ''} wafat=${m.death || ''} ayah=${m.fatherId || ''} ibu=${m.motherId || ''} pasangan=[${spouseSignature(m.spouses)}]`;

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
    photo: 'data:image/png;base64,CONTOH'
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
    photo: ''
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
let sigMismatches = 0;
for (const orig of appState) {
  const back = byId.get(orig.id);
  if (!back) { sigMismatches++; continue; }
  if (memberSignature(orig) !== memberSignature(back)) {
    sigMismatches++;
    console.log(`      beda: ${orig.id}\n        asli: ${memberSignature(orig)}\n        hasil: ${memberSignature(back)}`);
  }
}
check('Semua field + relasi identik (ID, tanggal, ortu, pasangan)', sigMismatches === 0, `${sigMismatches} anggota berbeda`);

const mAdded = byId.get('m1762848000000');
check('ID berprefix m (hasil tombol Tambah Anggota) tidak berubah', !!mAdded && mAdded.fatherId === 'h1' && mAdded.motherId === 'w1');
check('Relasi bercerai + tanggal menikah ikut kembali', !!byId.get('m1762848000001') && spouseSignature(byId.get('m1762848000001').spouses) === 'm1762848000000:divorced:2015-06-06');

// ---------- 2. Merge mempertahankan foto ----------
const merged = new Map(appState.map(m => [m.id.toString(), m]));
imported.forEach(m => {
  const existing = merged.get(m.id.toString());
  merged.set(m.id.toString(), (existing && !m.photo) ? { ...m, photo: existing.photo } : m);
});
const mergedPhoto = merged.get('m1762848000000')?.photo;
check('Mode gabung mempertahankan foto lama', mergedPhoto === 'data:image/png;base64,CONTOH');

// ---------- 3. Template masih kompatibel dengan parser ----------
const templateRows = toSheetRows([
  { id: '1', name: 'Budi Santoso', gender: 'male', birth: '1980-01-01', death: '', fatherId: '', motherId: '', spouses: [{ id: '2', type: 'married', marriageDate: '1998-05-20' }] },
  { id: '2', name: 'Siti Aminah', gender: 'female', birth: '1982-05-15', death: '', fatherId: '', motherId: '', spouses: [{ id: '1', type: 'married', marriageDate: '1998-05-20' }] },
  { id: '3', name: 'Andi Santoso', gender: 'male', birth: '2005-10-10', death: '', fatherId: '1', motherId: '2', spouses: [] }
]);
const wbTpl = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbTpl, XLSX.utils.json_to_sheet(templateRows), 'Template');
const tplParsed = parseWorkbook(XLSX.write(wbTpl, { bookType: 'xlsx', type: 'binary' }));

check('Template terbaca import (3 anggota)', tplParsed.length === 3);
check('Relasi keluarga template benar',
  tplParsed.find(m => m.id === '3')?.fatherId === '1' &&
  tplParsed.find(m => m.id === '3')?.motherId === '2' &&
  spouseSignature(tplParsed.find(m => m.id === '1')?.spouses) === '2:married:1998-05-20');

// ---------- 4. Kolom export cocok dengan header yang dicari parser ----------
const exportHeaders = Object.keys(toSheetRows(appState)[0]).map(h => h.toLowerCase());
const needed = ['id', 'nama', 'kelamin', 'lahir', 'wafat', 'ayah', 'ibu', 'pasangan'];
const missing = needed.filter(n => !exportHeaders.some(h => h === n || h.includes(n)));
check('Header export cocok dengan deteksi header import', missing.length === 0, missing.length ? `hilang: ${missing.join(', ')}` : 'semua kolom terdeteksi');

console.log('');
if (failures.length) {
  console.log(`HASIL: ${failures.length} GAGAL`);
  process.exit(1);
}
console.log('HASIL: SEMUA LOLOS — file export dapat diimpor ulang tanpa kehilangan data');
