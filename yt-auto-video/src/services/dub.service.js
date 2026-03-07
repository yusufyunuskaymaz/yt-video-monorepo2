/**
 * Dubbing Service — Video'dan sesi kaldır, yeni MP3 ekle
 * FFmpeg kullanarak video + yeni ses = dublajlı video
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const r2Service = require("./r2.service");

const TEMP_DIR = path.join(process.cwd(), "temp", "dub");
const FFMPEG = process.env.FFMPEG_PATH || "/opt/homebrew/bin/ffmpeg";

/**
 * URL'den dosya indir
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith("https") ? https : http;
    protocol
      .get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          downloadFile(response.headers.location, dest)
            .then(resolve)
            .catch(reject);
          return;
        }
        response.pipe(file);
        file.on("finish", () => file.close(resolve));
      })
      .on("error", (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}

/**
 * Video + yeni ses = dublajlı video
 * @param {string} videoUrl - Orijinal video URL
 * @param {string} audioUrl - Yeni ses URL (ElevenLabs MP3)
 * @param {object} options - { projectId, sceneNumber }
 * @returns {Promise<string>} Dublajlı video URL (R2)
 */
async function dubScene(videoUrl, audioUrl, options = {}) {
  const { projectId, sceneNumber } = options;
  const sceneLabel = `Sahne ${sceneNumber || "?"}`;

  console.log(`\n🎬 [DUB] ${sceneLabel} — Dublaj başlıyor...`);
  console.log(`   📹 Video: ${videoUrl.substring(0, 60)}...`);
  console.log(`   🔊 Ses: ${audioUrl.substring(0, 60)}...`);

  // Temp klasörü oluştur
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  const ts = Date.now();
  const videoPath = path.join(TEMP_DIR, `video_${ts}.mp4`);
  const audioPath = path.join(TEMP_DIR, `audio_${ts}.mp3`);
  const outputPath = path.join(TEMP_DIR, `dubbed_${ts}.mp4`);

  try {
    // 1. Video ve ses dosyalarını al (lokal veya remote)
    if (videoUrl.startsWith("/") && !videoUrl.startsWith("//")) {
      // Lokal dosya — diskten kopyala
      const localPath = path.join(process.cwd(), "public", videoUrl);
      console.log(`   📁 Lokal video: ${localPath}`);
      fs.copyFileSync(localPath, videoPath);
    } else {
      console.log(`   ⬇️ Video indiriliyor...`);
      await downloadFile(videoUrl, videoPath);
    }
    const videoSize = fs.statSync(videoPath).size;
    console.log(`   ✅ Video: ${(videoSize / (1024 * 1024)).toFixed(1)} MB`);

    if (audioUrl.startsWith("/") && !audioUrl.startsWith("//")) {
      const localPath = path.join(process.cwd(), "public", audioUrl);
      console.log(`   📁 Lokal ses: ${localPath}`);
      fs.copyFileSync(localPath, audioPath);
    } else {
      console.log(`   ⬇️ Ses indiriliyor...`);
      await downloadFile(audioUrl, audioPath);
    }
    const audioSize = fs.statSync(audioPath).size;
    console.log(`   ✅ Ses: ${(audioSize / 1024).toFixed(1)} KB`);

    // 2. FFmpeg: orijinal video (sessiz) + yeni ses → dublajlı video
    // -shortest: kısa olan bitince dur
    console.log(`   🔧 FFmpeg ile birleştiriliyor...`);
    execSync(
      `${FFMPEG} -y -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -ar 44100 -ac 2 -map 0:v:0 -map 1:a:0 -shortest -movflags +faststart "${outputPath}"`,
      { stdio: "pipe" }
    );

    const outputSize = fs.statSync(outputPath).size;
    console.log(
      `   ✅ Dublajlı video: ${(outputSize / (1024 * 1024)).toFixed(1)} MB`
    );

    // 3. R2'ye yükle
    console.log(`   ☁️ R2'ye yükleniyor...`);
    const outputBuffer = fs.readFileSync(outputPath);
    const r2Key = `dubbed-videos/${projectId}/scene_${String(
      sceneNumber
    ).padStart(3, "0")}_dubbed_${ts}.mp4`;
    const cdnUrl = await r2Service.uploadBuffer(
      outputBuffer,
      r2Key,
      "video/mp4"
    );

    console.log(`   🎉 Tamamlandı! → ${cdnUrl}`);

    // 4. Temp temizle
    [videoPath, audioPath, outputPath].forEach((f) => {
      try {
        fs.unlinkSync(f);
      } catch {}
    });

    return cdnUrl;
  } catch (error) {
    console.error(`   ❌ Dublaj hatası:`, error.message);
    // Temp temizle
    [videoPath, audioPath, outputPath].forEach((f) => {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {}
    });
    throw error;
  }
}

/**
 * Lokal mod: önceden indirilmiş video + yeni ses → lokal dublajlı video (upload yok)
 */
async function dubSceneLocal(localVideoPath, localAudioPath, outputPath) {
  console.log(`   🔧 FFmpeg lokal dublaj...`);
  execSync(
    `${FFMPEG} -y -i "${localVideoPath}" -i "${localAudioPath}" -c:v copy -c:a aac -ar 44100 -ac 2 -map 0:v:0 -map 1:a:0 -shortest -movflags +faststart "${outputPath}"`,
    { stdio: "pipe" }
  );
  const size = fs.statSync(outputPath).size;
  console.log(`   ✅ Lokal dublaj: ${(size / (1024 * 1024)).toFixed(1)} MB`);
  return outputPath;
}

module.exports = { dubScene, dubSceneLocal };
