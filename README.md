# Mokopi Kitchen Display System

Perusahaan: Mokopi

Kelompok: K03 - G01

Anggota:
- (13523131) Ahmad Wafi Idzharulhaqq
- (13523132) Jonathan Levi
- (13523139) Jonathan Kenan Budianto
- (13523145) Andri Nurdianto
- (13523161) Arlow Emmanuel Hergara

## Deskripsi Sistem

Mokopi Kitchen Display System (KDS) adalah sistem yang diharapkan dapat menjadi sarana komunikasi yang lebih terstruktur bagi Mokopi cabang Jatinangor. Sistem ini menjembatani komunikasi antara divisi Kitchen dan Bar yang sebelumnya masih menggunakan media komunikasi manual (catatan tertulis atau omongan lisan) dalam proses bisnis Mokopi. Implementasi sistem ini di perusahaan Mokopi Jatinangor diharapkan mampu menurunkan jumlah terjadinya *human error* dalam komunikasi antar divisi yang sekarang menjadi salah satu masalah terbesar yang dialami oleh Mokopi Jatinangor. Selain itu, implementasi sistem ini juga diharapkan dapat mempermudah tugas *supervisor* dalam mengawasi kinerja karyawan-karyawan.

Sistem Mokopi KDS dilengkapi dengan 4 layar utama: KDS, Bar Dashboard, Daftar Menu, dan Riwayat Sistem. KDS adalah layar yang diakses oleh divisi kitchen dan memungkinkan mereka untuk mengalokasikan stok untuk makanan serta mengatur status pesanan makanan. Bar Dashboard adalah layar yang diakses oleh divisi bar dan memungkinkan mereka untuk mengirimkan pesanan kepada divisi kitchen serta mengatur status pesanan makanan dan juga minuman. Daftar Menu adalah layar yang diakses oleh *supervisor* untuk mengelola menu yang tersedia di Mokopi Jatinangor. Layar Riwayat Sistem adalah layar tang diakses oleh *supervisor* untuk melihat perubahan yang dibuat oleh karyawan selama bekerja.

## Cara Menjalankan

1. Jalankan docker compose yang ada di *repository root*
2. Buka sistem odoo pada localhost:8069
3. Masuk sebagai admin
4. Nyalakan module Mokopi
5. Pindah ke settings > manage users
6. Tambahkan akun untuk supervisor, kitchen, dan kasir serta berikan role yang sesuai
7. Pilih ketiga akun yang sudah dibuat dan lakukan aksi "Change Password"
8. Ubah password untuk masing-masing akun
9. Logout dari admin dan gunakan akun yang sudah dibuat sebelumnya
10. Layar-layar Mokopi dapat diakses pada tab Mokopi di dropdown sebelah kiri atas

## Kredensial

Implementasi kami tidak menyediakan user yang sudah terhubung dengan sistem. Pengguna diekspektasi untuk menambahkan user baru dengan role yang sesuai untuk mengakses sistem. Kredensial bawaan yang ada dalam repository ini hanyalah kredensial admin untuk membuat akun.

Username Admin: admin

Password Admin: admin

## Kesimpulan dan Saran

Dengan membuat sistem ini, kelompok kami berhasil dalam memberikan solusi untuk salah satu masalah yang menghambat perkembangan Mokopi Jatinangor. Melalui analisis bertahap dan proses desain yang terstruktur, kami mampu menyediakan suatu solusi yang cocok untuk diimplementsikan di perusahaan dalam bentuk KDS khsusus untuk Mokopi. Apabila sistem ini akan diimplementasikan langsung di Mokopi, maka disarankan untuk melakukan instalasi secara lokal untuk meminimalisir dampak dari gangguan koneksi ke internet publik. Apabila sistem ini akan diadaptasi untuk perusahaan lain, disarankan untuk melakukan analisis mendalam untuk membandingkan perusahaan target dengan perusahaan Mokopi cabang Jatinangor.
