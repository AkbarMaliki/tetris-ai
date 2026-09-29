# tetris-ai

Tetris 3D (Three.js) dengan mode solo dan **Versus Online** (Firebase Realtime Database).

## Versus Online

- **Cari Lawan**: matchmaking otomatis dengan pemain lain yang juga sedang mencari.
- **Buat Room**: dapat kode 5 huruf + link undangan (`?room=KODE`), bisa disalin atau dibagikan. Teman bisa masuk lewat link atau dengan mengetik kodenya di **Gabung**.
- Kedua pemain mendapat urutan balok yang sama (seed bersama), dan ronde dimulai serentak lewat hitung mundur berbasis waktu server.
- **Serangan (garbage)**: Double 1, Triple 2, Tetris 4, T-Spin 2/4/6, Mini T-Spin Double 1, Back-to-Back +1, combo +1…5, Perfect Clear +10. Serangan lebih dulu menetralkan garbage yang sedang antre; sisanya dikirim ke lawan. Garbage yang antre terlihat sebagai meter merah di kiri papan, dan naik saat balok terkunci tanpa clear (maksimal 8 baris sekali naik).
- Kecepatan naik seiring waktu (level +1 tiap 40 detik) supaya ronde tidak berlarut.
- Papan, skor, dan baris lawan tampil secara live. Skor menang dihitung per room, dan ada tombol rematch.
- Lawan yang terputus lebih dari 12 detik dianggap kalah. Tombol **Menyerah** (menu ⏸) berarti kalah.

## Setup Firebase

Config ada di [`firebase-config.js`](firebase-config.js). Di Firebase Console → **Realtime Database** → **Rules**, tambahkan node `tetris` tanpa menghapus rules lain (misalnya `chess`):

```json
{
  "rules": {
    "tetris": {
      ".read": true,
      ".write": true,
      "rooms": { ".indexOn": ["status", "created"] }
    }
  }
}
```

## Menjalankan

```bash
npx serve .        # atau: python -m http.server
```

Untuk tes online, buka di dua browser/tab (atau HP + laptop), lalu tekan **Versus Online → Cari Lawan** di keduanya.

## Struktur data (`/tetris`)

- `presence/{uid}`: pemain yang sedang online.
- `rooms/{KODE}`: `status` (`waiting`/`playing`/`finished`), `p` (pemain), `round`, `seed`, `start`, `s/{uid}` (papan & skor), `g/{uid}` (antrean garbage masuk), `win`, `wins`, `rm` (rematch), `conn`.
- Room yang lebih tua dari 3 jam dibersihkan otomatis saat ada yang membuka lobby.
