---
description: ElevenLabs API entegrasyonu - Ses üretimi ve voice changer pipeline'ı
---

# 🎙️ ElevenLabs API Entegrasyon Planı

## 📌 Özet

Mevcut `yt-auto-video` projesindeki Fal.ai TTS (Chatterbox Multilingual) yerine **ElevenLabs API** kullanılacak.
Masaüstündeki `elevenlabs` klasöründeki Speech-to-Speech (voice changer) kodu referans alınacak.

### İki Ana Kullanım Senaryosu:

| Senaryo               | `isDialog`    | Açıklama                                                                                   | ElevenLabs Endpoint                    |
| --------------------- | ------------- | ------------------------------------------------------------------------------------------ | -------------------------------------- |
| **Diyalog sahneleri** | `true`        | Karakter konuşmaları. AI'ın ürettiği ses yerine ElevenLabs Speech-to-Speech ile doğal ses. | `POST /v1/speech-to-speech/{voice_id}` |
| **Anlatım sahneleri** | `false` / yok | Anlatıcı sesi. Direkt Text-to-Speech kullanılacak.                                         | `POST /v1/text-to-speech/{voice_id}`   |

---

## 📂 Mevcut Durum

### Proje Yapısı (`yt-auto-video`)

```
src/
├── config/
│   ├── db.config.js
│   └── fal.config.js          ← KALDIRILACAK (ElevenLabs ile değişecek)
├── controllers/
│   ├── project.controller.js  ← GÜNCELLENECEK (isDialog desteği)
│   └── scene.controller.js
├── routes/
│   └── project.routes.js      ← GÜNCELLENECEK (yeni endpoint'ler)
├── services/
│   ├── audio.service.js       ← TAMAMEN YENİDEN YAZILACAK
│   ├── video.service.js
│   └── ...
└── server.js
```

### ElevenLabs Projesi (`~/Desktop/elevenlabs`)

```
server.js       → Speech-to-Speech (voice changer) kodu
public/         → Frontend (kullanılmayacak)
.env            → API key: sk_c96c802c846177a2255d8bd8ce91beb93b7f274d6a906d67
```

### Mevcut Ses Akışı (ESKİ - Fal.ai)

```
narration text → Fal.ai Chatterbox Multilingual TTS → WAV → R2/Lokal
```

### Yeni Ses Akışı (YENİ - ElevenLabs)

```
Anlatım (isDialog: false):
  narration text → ElevenLabs TTS API → MP3 → R2/Lokal

Diyalog (isDialog: true):
  narration text → ElevenLabs TTS (geçici ses üret) → ElevenLabs STS (voice change) → MP3 → R2/Lokal
  VEYA
  narration text → ElevenLabs TTS (direkt karakter sesiyle) → MP3 → R2/Lokal
```

---

## 🗺️ Entegrasyon Adımları

### ADIM 1: `.env` Güncelleme

**Dosya:** `/Users/yusuf/Desktop/ortak-v2/.env`

```env
# ElevenLabs API
ELEVENLABS_API_KEY=sk_c96c802c846177a2255d8bd8ce91beb93b7f274d6a906d67
ELEVENLABS_DEFAULT_VOICE_ID=0DihkedLJYKoWg7H1u4d
ELEVENLABS_NARRATOR_VOICE_ID=<anlatıcı_voice_id>
```

---

### ADIM 2: DB Schema Güncelleme (Prisma)

**Dosya:** `prisma/schema.prisma`

Scene modeline yeni alanlar eklenmeli:

```prisma
model Scene {
  // ... mevcut alanlar ...

  isDialog         Boolean  @default(false)    // Dialog mu yoksa anlatım mı?
  dialogCharacter  String?                      // Dialog ise karakter adı
  voiceId          String?                      // Kullanılan ElevenLabs voice ID

  // ... diğer alanlar ...
}
```

**Migration komutu:**

```bash
cd /Users/yusuf/Desktop/ortak-v2/yt-auto-video
npx prisma migrate dev --name add-dialog-fields
```

---

### ADIM 3: ElevenLabs Config Oluşturma

**Yeni Dosya:** `src/config/elevenlabs.config.js`

```javascript
/**
 * ElevenLabs API Konfigürasyonu
 */
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";

// Varsayılan ses ayarları
const DEFAULT_VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.5,
  use_speaker_boost: true,
};

// Desteklenen modeller
const MODELS = {
  TTS_MULTILINGUAL: "eleven_multilingual_v2", // Çok dilli TTS
  TTS_TURBO: "eleven_turbo_v2_5", // Düşük gecikme TTS
  TTS_V3: "eleven_v3", // En yeni, en iyi kalite
  STS_MULTILINGUAL: "eleven_multilingual_sts_v2", // Çok dilli Speech-to-Speech
  STS_ENGLISH: "eleven_english_sts_v2", // İngilizce STS
};

// Desteklenen çıktı formatları
const OUTPUT_FORMATS = {
  MP3_HIGH: "mp3_44100_128",
  MP3_HIGHEST: "mp3_44100_192",
  MP3_LOW: "mp3_22050_32",
  PCM_16K: "pcm_16000",
  PCM_44K: "pcm_44100",
};

module.exports = {
  ELEVENLABS_API_KEY,
  ELEVENLABS_BASE_URL,
  DEFAULT_VOICE_SETTINGS,
  MODELS,
  OUTPUT_FORMATS,
};
```

---

### ADIM 4: `audio.service.js` Yeniden Yazma (EN KRİTİK)

**Dosya:** `src/services/audio.service.js`

Tamamen ElevenLabs tabanlı olacak. İki ana fonksiyon:

#### 4a. `generateTTS(text, voiceId, options)` — Text-to-Speech

- **Kullanım:** Anlatım sahneleri (`isDialog: false`)
- **Endpoint:** `POST /v1/text-to-speech/{voice_id}`
- **Request Body:**
  ```json
  {
    "text": "Anlatım metni...",
    "model_id": "eleven_multilingual_v2",
    "voice_settings": {
      "stability": 0.5,
      "similarity_boost": 0.75,
      "style": 0.5,
      "use_speaker_boost": true
    }
  }
  ```
- **Response:** Audio binary (MP3)

#### 4b. `generateSTS(audioBuffer, voiceId, options)` — Speech-to-Speech

- **Kullanım:** Dialog sahneleri (`isDialog: true`) — önce TTS ile geçici ses, sonra STS ile karakter sesine dönüştürme
- **Endpoint:** `POST /v1/speech-to-speech/{voice_id}`
- **Request:** FormData (audio file + model_id)
- **Response:** Audio binary (MP3)

#### 4c. `generateAudioForScene(scene, options)` — Ana Orkestrasyon

```javascript
async function generateAudioForScene(scene, options) {
  if (scene.isDialog) {
    // 1. Önce TTS ile metni sese çevir (geçici)
    const tempAudio = await generateTTS(scene.narration, NARRATOR_VOICE_ID);
    // 2. STS ile karakter sesine dönüştür
    const voiceId = scene.voiceId || DEFAULT_VOICE_ID;
    const finalAudio = await generateSTS(tempAudio, voiceId);
    return finalAudio;

    // ALTERNATİF: Direkt TTS ile karakter voice_id kullanılabilir
    // Bu durumda STS gerekmez
    // const finalAudio = await generateTTS(scene.narration, characterVoiceId);
  } else {
    // Anlatım: Direkt TTS
    const voiceId = scene.voiceId || NARRATOR_VOICE_ID;
    const audio = await generateTTS(scene.narration, voiceId);
    return audio;
  }
}
```

#### 4d. `getVoices()` — Ses Listesi

- **Endpoint:** `GET /v1/voices`
- Mevcut elevenlabs projesindeki `/api/voices` kodunun aynısı

---

### ADIM 5: `project.service.js` Güncelleme

**Dosya:** `src/services/project.service.js`

`createProject` fonksiyonuna `isDialog` ve `dialogCharacter` alanları eklenecek:

```javascript
scenes: {
  create: scenes.map((scene) => ({
    // ... mevcut alanlar ...
    isDialog: scene.is_dialog === true,
    dialogCharacter: scene.dialog_character || null,
    voiceId: scene.voice_id || null,
  })),
},
```

---

### ADIM 6: `project.controller.js` Güncelleme

**Dosya:** `src/controllers/project.controller.js`

- `generateAllAudio()` fonksiyonunda: Fal.ai yerine yeni ElevenLabs `audio.service.js` kullanılacak
- Sahne bazında `isDialog` kontrolü yapılacak
- Pipeline'da da aynı değişiklikler

---

### ADIM 7: Yeni API Route'ları

**Dosya:** `src/routes/project.routes.js`

```javascript
// ElevenLabs ses listesi
router.get('/voices', async (req, res) => { ... });

// Tek sahne için ses üret (preview)
router.post('/scenes/:id/generate-audio', async (req, res) => { ... });
```

---

### ADIM 8: JSON Sahne Yapısı Güncelleme

Proje oluşturulurken gönderilen JSON'a yeni alanlar:

```json
{
  "title": "Osmanlı Tarihi",
  "total_duration": 600,
  "scenes": [
    {
      "scene_number": 1,
      "timestamp": "0:00-0:30",
      "narration": "Osmanlı İmparatorluğu 1299 yılında...",
      "subject": "Ottoman Empire founding scene",
      "is_dialog": false,
      "voice_id": null
    },
    {
      "scene_number": 2,
      "timestamp": "0:30-1:00",
      "narration": "Sultan Osman Han, beyliğin kurucusu olarak...",
      "subject": "Sultan Osman speaking to his vizier",
      "is_dialog": true,
      "dialog_character": "Sultan Osman",
      "voice_id": "0DihkedLJYKoWg7H1u4d",
      "characters": ["Sultan Osman", "Vezir"]
    }
  ]
}
```

---

### ADIM 9: Frontend Güncelleme

**Dosya:** `public/index.html`

- Sahne tablosuna **"Dialog"** sütunu eklenmeli
- ElevenLabs ses seçim dropdownu (anlatıcı vs karakter sesleri)
- Her sahne için `isDialog` toggle'ı
- Sahne detayında voice_id seçimi

---

### ADIM 10: `package.json` Güncelleme

**Dosya:** `package.json`

Yeni bağımlılıklar:

```json
{
  "form-data": "^4.0.5",
  "node-fetch": "^2.7.0"
}
```

> Not: `@fal-ai/client` ve `fal.config.js` kaldırılabilir (artık kullanılmıyor).

---

## 📋 Uygulama Sırası (Öncelik)

| #   | Adım                             | Dosya(lar)                    | Önem      |
| --- | -------------------------------- | ----------------------------- | --------- |
| 1   | `.env` güncelle                  | `.env`                        | 🟢 Kolay  |
| 2   | Prisma schema güncelle + migrate | `schema.prisma`               | 🟡 Orta   |
| 3   | ElevenLabs config oluştur        | `elevenlabs.config.js` (yeni) | 🟢 Kolay  |
| 4   | `audio.service.js` yeniden yaz   | `audio.service.js`            | 🔴 Kritik |
| 5   | `project.service.js` güncelle    | `project.service.js`          | 🟡 Orta   |
| 6   | `project.controller.js` güncelle | `project.controller.js`       | 🟡 Orta   |
| 7   | Route'lar ekle                   | `project.routes.js`           | 🟢 Kolay  |
| 8   | Frontend güncelle                | `index.html`                  | 🟡 Orta   |
| 9   | `package.json` güncelle          | `package.json`                | 🟢 Kolay  |
| 10  | Test et                          | -                             | 🔴 Kritik |

---

## 🔑 ElevenLabs API Detayları

### Text-to-Speech (TTS)

```
POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
Headers:
  xi-api-key: {API_KEY}
  Content-Type: application/json
  Accept: audio/mpeg

Body:
{
  "text": "Metin...",
  "model_id": "eleven_multilingual_v2",
  "voice_settings": {
    "stability": 0.5,
    "similarity_boost": 0.75,
    "style": 0.5,
    "use_speaker_boost": true
  }
}

Response: audio/mpeg binary
```

### Speech-to-Speech (STS) — Voice Changer

```
POST https://api.elevenlabs.io/v1/speech-to-speech/{voice_id}?output_format=mp3_44100_128
Headers:
  xi-api-key: {API_KEY}
  Content-Type: multipart/form-data

Body (FormData):
  audio: <file buffer>
  model_id: eleven_multilingual_sts_v2

Response: audio/mpeg binary
```

### Ses Listesi

```
GET https://api.elevenlabs.io/v1/voices
Headers:
  xi-api-key: {API_KEY}

Response: { voices: [{ voice_id, name, category, labels }, ...] }
```

---

## ⚠️ Dikkat Edilecekler

1. **Rate Limiting:** ElevenLabs API'de rate limit var. Batch ses üretiminde her sahne arası 1-2 sn bekleme eklenebilir.
2. **Karakter Limiti:** TTS endpoint'inde metin uzunluğu sınırı var (model bazlı). Uzun metinler bölünmeli.
3. **Kredi Kullanımı:** Her API çağrısı kredi harcar. Gereksiz çağrılardan kaçınılmalı.
4. **Voice ID Yönetimi:** Projede kullanılacak seslerin voice_id'leri önceden belirlenmeli.
5. **Hata Yönetimi:** API hatalarında retry mekanizması eklenmeli.
6. **Dosya Formatı:** TTS çıktısı MP3 (eskiden WAV idi), pipeline'daki FFmpeg komutları kontrol edilmeli.
