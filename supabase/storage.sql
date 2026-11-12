-- Bucket penyimpanan foto anggota keluarga.
-- Foto disimpan publik supaya pohon keluarga bisa menampilkan foto tamu
-- tanpa login, tetapi hanya pengguna terautentikasi (admin) yang bisa
-- menambah, mengubah, atau menghapus berkas.
-- Jalankan di Supabase Dashboard -> SQL Editor.

insert into storage.buckets (id, name, public)
values ('family-photos', 'family-photos', true)
on conflict (id) do nothing;

-- Foto bisa dilihat siapa pun (pohon keluarga adalah konten publik).
drop policy if exists "family-photos dapat dilihat publik" on storage.objects;
create policy "family-photos dapat dilihat publik"
  on storage.objects for select
  using (bucket_id = 'family-photos');

-- Hanya admin (pengguna login) yang boleh menulis dan menghapus.
drop policy if exists "family-photos insert admin" on storage.objects;
create policy "family-photos insert admin"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'family-photos');

drop policy if exists "family-photos update admin" on storage.objects;
create policy "family-photos update admin"
  on storage.objects for update to authenticated
  using (bucket_id = 'family-photos');

drop policy if exists "family-photos delete admin" on storage.objects;
create policy "family-photos delete admin"
  on storage.objects for delete to authenticated
  using (bucket_id = 'family-photos');
