# RBXM → Asset ID Studio

Web tool untuk mengupload file `.rbxm` / `.rbxmx` ke Roblox dan mendapatkan Asset ID secara instan — cocok untuk developer Roblox yang bekerja dari HP menggunakan Studio Lite.

---

## Cara Deploy (dari HP)

### Langkah 1 — Buat Repository GitHub

1. Buka [github.com](https://github.com) → klik **New repository**
2. Nama repo: `rbxm-uploader`
3. Visibility: **Public**
4. Klik **Create repository**
5. Upload semua file dari folder ini ke repo tersebut

---

### Langkah 2 — Connect ke Vercel

1. Buka [vercel.com](https://vercel.com) → login dengan GitHub
2. Klik **Add New → Project**
3. Pilih repo `rbxm-uploader`
4. Di bagian **Framework Preset** → pilih **Other**
5. Biarkan semua setting default
6. Klik **Deploy**

Vercel akan otomatis build dan deploy. URL akan muncul seperti:
```
https://rbxm-uploader.vercel.app
```

Setiap kali kamu push ke GitHub, Vercel auto-deploy ulang.

---

### Langkah 3 — Buat Roblox API Key

1. Buka [create.roblox.com/credentials](https://create.roblox.com/credentials)
2. Klik **Create API Key**
3. Beri nama: misalnya `RBXM Uploader`
4. Di bagian **Access Permissions**:
   - Pilih **Assets API**
   - Tambahkan **Write** permission
5. Di bagian **IP Access**:
   - Pilih **Allow All** (untuk personal use)
6. Klik **Save**
7. Salin API Key yang muncul — simpan baik-baik, hanya muncul sekali

---

### Langkah 4 — Pakai Tool

1. Buka URL Vercel kamu di browser HP
2. Paste API Key di field yang tersedia
3. Pilih file `.rbxm` dari storage HP
4. Isi nama asset
5. Klik **Upload ke Roblox**
6. Tunggu 10–30 detik
7. Asset ID muncul — copy dan pakai di Studio Lite lewat Toolbox

---

## Cara Pakai Asset ID di Studio Lite

Setelah dapat Asset ID:
1. Buka **Studio Lite**
2. Pergi ke **Toolbox** → **My Models** atau **Inventory**
3. Model yang baru diupload akan muncul di sana
4. Atau pakai via script:
```lua
local model = game:GetService("InsertService"):LoadAsset(ASSET_ID_DISINI)
model.Parent = workspace
```

---

## Struktur File

```
rbxm-uploader/
├── frontend/
│   ├── index.html     ← UI utama
│   ├── style.css      ← Styling dark theme
│   └── script.js      ← Logic frontend
├── api/
│   └── upload.js      ← Vercel Serverless Function
├── vercel.json        ← Config routing
└── README.md
```

---

## Keamanan

- **API Key** hanya tersimpan di `sessionStorage` browser — hilang saat tab ditutup
- API Key **tidak pernah disimpan** di database atau server
- File `.rbxm` langsung diteruskan ke Roblox — tidak disimpan di server kami
- Backend hanya berfungsi sebagai proxy karena Roblox Open Cloud tidak mengizinkan request langsung dari browser (CORS)

---

## Batasan

- Ukuran file maksimal **20 MB** per upload
- Format yang didukung: `.rbxm` dan `.rbxmx`
- Proses upload bisa memakan 10–30 detik tergantung ukuran file dan kecepatan server Roblox
- API Key harus memiliki permission **Assets: write**

---

## Troubleshooting

| Error | Solusi |
|-------|--------|
| `Roblox menolak upload: 401` | API Key salah atau tidak punya permission write |
| `File terlalu besar` | Compress atau split model di Studio |
| `Upload timeout` | Roblox sedang lambat, coba lagi |
| `Operation ID tidak ditemukan` | Format response Roblox berubah, hubungi developer |

---

Dibuat untuk dev Roblox mobile 🎮
