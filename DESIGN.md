# DESIGN.md — Fam Tree

Arah desain aplikasi silsilah keluarga. Setiap keputusan di bawah punya alasan satu baris (aturan R-31 antislop). Filter antislop diterapkan di atas file ini, bukan sebaliknya.

**Design Read:** aplikasi silsilah keluarga untuk keluarga Indonesia yang merawat nasab, dalam bahasa visual arsip kertas hangat (buku catatan keluarga yang dirawat).

**Dial:** ENERGY 1 / RHYTHM 2 / MOTION 1.

## Identitas

Buku catatan keluarga: kertas hangat, tinta pekat, satu hijau pinus sebagai penanda aksi, serif untuk judul. Bukan dashboard SaaS, bukan tema gelap "tech", bukan kaca buram.

## Palet

| Token | Light | Dark | Alasan |
|---|---|---|---|
| bg-main | #f5f1e8 | #211d17 | Kertas arsip hangat; gelapnya arang hangat, bukan navy bawaan |
| bg-card | #fdfbf6 | #2a251d | Permukaan kartu solid, satu tingkat di atas kertas |
| bg-inset | #ede7d9 | #1c1813 | Sumur visual: tab, thead, hover baris |
| text-main | #29241d | #ece5d8 | Tinta |
| text-muted | #6d6455 | #a89e8b | Tinta pudar |
| primary | #3d6b50 | #40684f | Hijau pinus: tumbuh, keluarga, resonan budaya nasab |
| male / female | #3e6b8f / #a14d62 | #8fb3d4 / #d397a6 | Warna data gender, hanya di avatar dan label kecil |
| ok / danger | #3f7d4e / #a83c2a | #8fc79b / #e2968a | Status hidup/wafat dan aksi destruktif, semantik murni |

Semua pasangan teks-latar sudah dihitung dan lolos WCAG AA (4.5:1) pada kedua tema. Garis diagram memakai #8b7f68 / #8a8070 (di atas 3:1 untuk objek grafis).

Satu aksen: hijau pinus hanya di momen kunci (tombol utama, hasil kalkulator nasab, keadaan aktif). Tidak ada aksen kedua yang berkeliaran.

## Tipografi

- **Helvetica Neue / Helvetica / Arial** (stack font sistem) untuk seluruh UI: judul, tabel, dan hasil kalkulator. Alasan: netral, khas dokumen keluarga yang diketik, tanpa webfont eksternal (first paint lebih cepat, tidak ada permintaan pihak ketiga).
- Hirarki judul memakai ukuran dan ketebalan (600), bukan pergantian font.
- Tidak ada label uppercase ber letter-spacing lebar. Label memakai huruf normal berukuran kecil.

## Bentuk dan elevasi

- Radius: 6px kontrol (tombol, input), 10px kartu/node, 14px modal. Alasan: kontrol lebih kecil dari wadahnya, hirarki terbaca.
- Bayangan hanya untuk elemen yang benar-benar melayang di atas kanvas: modal dan tombol pengaturan mengambang. Semua permukaan lain flat dengan border. Alasan: elevasi harus berarti sesuatu.
- Tidak ada glassmorphism/blur, tidak ada glow, tidak ada gradien. Alasan: arsip kertas tidak transparan.

## Garis diagram pohon

- Keturunan (orang tua ke anak): garis tipis 1.5px solid tinta.
- Pernikahan: garis 2.5px solid; bercerai: putus-putus. Alasan: hubungan dibedakan lewat bobot dan pola garis, bukan warna tambahan.
- Tanpa animasi marching-ants dan tanpa mata panah. Alasan: arah silsilah sudah tersirat dari atas ke bawah; gerak terus-menerus hanya menambah derau.
- Grid titik samar di kanvas tetap dipakai. Alasan: affordance pan/zoom, bukan dekorasi.

## Kebijakan gerak (MOTION 1)

- Hanya hover state, transisi masuk/keluar modal, dan pergantian view; semuanya terpicu aksi pengguna, tidak ada loop.
- Satu gerak berkelanjutan yang diizinkan: spinner loading (feedback status esensial).
- Semua transisi menghormati `prefers-reduced-motion: reduce`.

## Aksesibilitas

- Fokus keyboard: outline 2px hijau pinus pada `:focus-visible`; semua modal dapat ditutup dengan Escape.
- Tombol ikon tanpa teks wajib `aria-label`; setiap input punya label terlihat.
- Target sentuh mobile minimal 44px.

## Warna data (semantik, bukan dekorasi)

- Laki-laki / perempuan: hanya pada lingkar avatar dan teks kecil.
- Hidup / Wafat: chip status kecil.
- Merah hanya untuk bahaya (hapus, reset total). Tidak ada merah dekoratif.

## Yang dihapus dari versi lama, beserta alasan

- Blur di semua permukaan, glow tombol, bayangan di setiap kartu. Alasan: pelanggaran dosis R-10/R-12/R-13.
- Animasi goyang avatar `repeat: Infinity` dan marching-ants garis keturunan. Alasan: gerak tanpa pemicu, menyaingi konten.
- Emoji di tab dan status (cake, cincin, pesta, peringatan). Alasan: dekorasi yang bersaing dengan teks.
- Palet indigo/sky/pink/yellow bawaan Tailwind. Alasan: default AI, bukan identitas.
- Strip warna di kiri kartu pasangan. Alasan: dekorasi tanpa makna; gender sudah terbaca dari lingkar avatar.
- Salinan copy berlebihan ("APOCALYPSE WARNING", "YAKIN HAPUS TOTAL", "HARI INI! 🎉"). Alasan: alarmisme; copy diganti versi faktual.
- File mati: `fix_layout.js`, `fix_union_nodes.js` (patch sekali-pakai yang sudah diterapkan di kode), `src/App.css` (boilerplate Vite yang tidak pernah diimpor), `src/components/FamilyNode.jsx` (komponen lama tanpa importer).
