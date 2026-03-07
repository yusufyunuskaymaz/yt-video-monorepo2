/**
 * ElevenLabs Service — Text-to-Speech & Speech-to-Speech (Voice Changer)
 */
const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const r2Service = require("./r2.service");

const API_KEY = process.env.ELEVENLABS_API_KEY;
const DEFAULT_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID || "0DihkedLJYKoWg7H1u4d";
const BASE_URL = "https://api.elevenlabs.io/v1";
const FFMPEG = process.env.FFMPEG_PATH || "/opt/homebrew/bin/ffmpeg";
const TEMP_DIR = path.join(process.cwd(), "temp", "elevenlabs");

/**
 * Text-to-Speech — metni sese çevir (anlatım sahneleri için)
 */
async function textToSpeech(text, options = {}) {
  const voiceId = options.voiceId || DEFAULT_VOICE_ID;
  const modelId = options.modelId || "eleven_multilingual_v2";
  const outputFormat = options.outputFormat || "mp3_44100_128";

  const url = `${BASE_URL}/text-to-speech/${voiceId}?output_format=${outputFormat}`;

  const body = JSON.stringify({
    text,
    model_id: modelId,
    speed: 1.05,
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.46,
      style: 0.58,
      use_speaker_boost: true,
    },
  });

  console.log(`\n🎙️ [ElevenLabs TTS] Ses üretiliyor...`);
  console.log(`   🌐 URL: ${url}`);
  console.log(`   Voice: ${voiceId}`);
  console.log(`   Model: ${modelId}`);
  console.log(`   Speed: 1.05`);
  console.log(`   Body: ${body.substring(0, 200)}...`);
  console.log(`   Text: ${text.substring(0, 80)}...`);

  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          "xi-api-key": API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const buffer = Buffer.concat(chunks);

          if (res.statusCode !== 200) {
            const errorText = buffer.toString();
            console.error(
              `   ❌ ElevenLabs API Hatası (${res.statusCode}):`,
              errorText
            );
            reject(
              new Error(
                `ElevenLabs API hatası (${res.statusCode}): ${errorText}`
              )
            );
            return;
          }

          console.log(
            `   ✅ Ses üretildi! (${(buffer.length / 1024).toFixed(1)} KB)`
          );
          resolve(buffer);
        });
      }
    );

    req.on("error", (err) => {
      console.error(`   ❌ İstek hatası:`, err.message);
      reject(err);
    });

    req.write(body);
    req.end();
  });
}

/**
 * Speech-to-Speech (Voice Changer) — ses dosyasını hedef sese dönüştür
 * @param {Buffer} audioBuffer - Kaynak ses (MP3)
 * @param {object} options
 * @returns {Promise<Buffer>} Dönüştürülmüş ses buffer
 */
async function speechToSpeech(audioBuffer, options = {}) {
  const voiceId = options.voiceId || DEFAULT_VOICE_ID;
  const modelId = options.modelId || "eleven_english_sts_v2";
  const outputFormat = options.outputFormat || "mp3_44100_128";

  const url = `${BASE_URL}/speech-to-speech/${voiceId}?output_format=${outputFormat}`;

  console.log(`\n🔄 [ElevenLabs STS] Voice Changer çalışıyor...`);
  console.log(`   🌐 URL: ${url}`);
  console.log(`   Voice: ${voiceId}`);
  console.log(`   Model: ${modelId}`);
  console.log(`   Format: ${outputFormat}`);
  console.log(`   Giriş boyutu: ${(audioBuffer.length / 1024).toFixed(1)} KB`);
  console.log(`   Content-Type: multipart/form-data`);

  // multipart/form-data elle oluştur (bağımlılık istemiyoruz)
  const boundary = `----ElevenLabsBoundary${Date.now()}`;
  const parts = [];

  // audio part
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="input.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`
    )
  );
  parts.push(audioBuffer);
  parts.push(Buffer.from(`\r\n`));

  // model_id part
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="model_id"\r\n\r\n${modelId}\r\n`
    )
  );

  // end boundary
  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const bodyBuffer = Buffer.concat(parts);

  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          "xi-api-key": API_KEY,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          Accept: "audio/mpeg",
          "Content-Length": bodyBuffer.length,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const buffer = Buffer.concat(chunks);

          if (res.statusCode !== 200) {
            const errorText = buffer.toString();
            console.error(
              `   ❌ ElevenLabs STS Hatası (${res.statusCode}):`,
              errorText
            );
            reject(
              new Error(
                `ElevenLabs STS hatası (${res.statusCode}): ${errorText}`
              )
            );
            return;
          }

          console.log(
            `   ✅ Voice Change tamamlandı! (${(buffer.length / 1024).toFixed(
              1
            )} KB)`
          );
          resolve(buffer);
        });
      }
    );

    req.on("error", (err) => {
      console.error(`   ❌ STS istek hatası:`, err.message);
      reject(err);
    });

    req.write(bodyBuffer);
    req.end();
  });
}

/**
 * URL'den dosya indir → Buffer
 */
function downloadToBuffer(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    protocol
      .get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          downloadToBuffer(response.headers.location)
            .then(resolve)
            .catch(reject);
          return;
        }
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

/**
 * Videodan sesi çıkar (FFmpeg) → MP3 buffer
 */
function extractAudioFromVideo(videoPathOrUrl) {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
  const ts = Date.now();
  const outputPath = path.join(TEMP_DIR, `extracted_${ts}.mp3`);

  console.log(`   🎵 Videodan ses çıkarılıyor...`);
  execSync(
    `${FFMPEG} -y -i "${videoPathOrUrl}" -vn -acodec libmp3lame -ar 44100 -ac 1 -b:a 128k "${outputPath}"`,
    { stdio: "pipe" }
  );

  const buffer = fs.readFileSync(outputPath);
  console.log(`   ✅ Ses çıkarıldı: ${(buffer.length / 1024).toFixed(1)} KB`);

  // Temizle
  try {
    fs.unlinkSync(outputPath);
  } catch {}
  return buffer;
}

/**
 * Sahne için ses üret, R2'ye yükle, URL döndür
 * - Dialog sahneleri: Video → ses çıkar → Speech-to-Speech (Voice Changer)
 * - Anlatım sahneleri: Text-to-Speech
 */
async function generateAudioForScene(scene, options = {}) {
  try {
    const startTime = Date.now();
    let audioBuffer;

    console.log(`\n${"=".repeat(60)}`);
    console.log(
      `🎯 [generateAudioForScene] Sahne ${scene.sceneNumber} (ID:${scene.id})`
    );
    console.log(`   isDialog: ${scene.isDialog}`);
    console.log(
      `   videoUrl: ${
        scene.videoUrl ? scene.videoUrl.substring(0, 60) + "..." : "YOK"
      }`
    );
    console.log(`   narration: ${(scene.narration || "").substring(0, 60)}...`);
    console.log(`   speechText: ${scene.speechText || "YOK"}`);
    console.log(`   voiceId: ${options.voiceId || DEFAULT_VOICE_ID}`);

    if (scene.isDialog && scene.videoUrl) {
      // ─── DIALOG: Voice Changer (Speech-to-Speech) ───
      console.log(`   🔀 MOD: SPEECH-TO-SPEECH (Voice Changer)`);
      console.log(
        `   📡 API: /v1/speech-to-speech/${options.voiceId || DEFAULT_VOICE_ID}`
      );

      // 1. Videoyu al (lokal veya remote)
      const videoUrl = scene.videoUrl;
      const videoTempPath = path.join(TEMP_DIR, `video_${Date.now()}.mp4`);
      if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

      if (videoUrl.startsWith("/") && !videoUrl.startsWith("//")) {
        // Lokal dosya
        const localPath = path.join(process.cwd(), "public", videoUrl);
        console.log(`   📁 Lokal video: ${localPath}`);
        fs.copyFileSync(localPath, videoTempPath);
      } else {
        console.log(`   ⬇️ Video indiriliyor: ${videoUrl}`);
        const videoBuffer = await downloadToBuffer(videoUrl);
        fs.writeFileSync(videoTempPath, videoBuffer);
      }
      const videoSize = fs.statSync(videoTempPath).size;
      console.log(`   ✅ Video: ${(videoSize / (1024 * 1024)).toFixed(1)} MB`);

      // 2. FFmpeg ile ses çıkar
      const sourceAudio = extractAudioFromVideo(videoTempPath);

      // 3. Speech-to-Speech (Voice Changer)
      audioBuffer = await speechToSpeech(sourceAudio, {
        voiceId: options.voiceId,
        modelId: options.modelId || "eleven_english_sts_v2",
      });

      // Temizle
      try {
        fs.unlinkSync(videoTempPath);
      } catch {}
    } else {
      // ─── ANLATIM: Text-to-Speech ───
      const ttsText =
        scene.isDialog && scene.speechText ? scene.speechText : scene.narration;
      console.log(`   � MOD: TEXT-TO-SPEECH`);
      console.log(
        `   📡 API: /v1/text-to-speech/${options.voiceId || DEFAULT_VOICE_ID}`
      );
      console.log(`   📝 Gönderilen metin: "${ttsText}"`);

      audioBuffer = await textToSpeech(ttsText, {
        voiceId: options.voiceId,
        modelId: options.modelId,
      });
    }

    // R2'ye yükle (timestamp ile unique key — CDN cache bypass)
    const ts = Date.now();
    const key = `elevenlabs-audio/${scene.projectId}/scene_${String(
      scene.sceneNumber
    ).padStart(3, "0")}_${ts}.mp3`;
    console.log(`   ☁️ R2'ye yükleniyor...`);
    const cdnUrl = await r2Service.uploadBuffer(audioBuffer, key, "audio/mpeg");

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`   🎉 Tamamlandı! (${elapsed}s) → ${cdnUrl}`);

    return {
      success: true,
      audioUrl: cdnUrl,
      duration: null,
      size: audioBuffer.length,
    };
  } catch (error) {
    console.error(`   ❌ generateAudioForScene hatası:`, error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Mevcut sesleri listele
 */
async function getVoices() {
  return new Promise((resolve, reject) => {
    https
      .get(
        `${BASE_URL}/voices`,
        {
          headers: { "xi-api-key": API_KEY },
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            try {
              const data = JSON.parse(Buffer.concat(chunks).toString());
              const voices = (data.voices || []).map((v) => ({
                voice_id: v.voice_id,
                name: v.name,
                category: v.category,
                labels: v.labels,
              }));
              resolve(voices);
            } catch (e) {
              reject(e);
            }
          });
        }
      )
      .on("error", reject);
  });
}

module.exports = {
  textToSpeech,
  speechToSpeech,
  generateAudioForScene,
  getVoices,
};
