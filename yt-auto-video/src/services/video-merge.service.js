/**
 * Video Merge Service — FFmpeg ile sahne videolarını birleştir
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const prisma = require("../config/db.config");
const r2Service = require("./r2.service");
const https = require("https");
const http = require("http");

const TEMP_DIR = path.join(process.cwd(), "temp", "merge");
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
        file.on("finish", () => {
          file.close(resolve);
        });
      })
      .on("error", (err) => {
        fs.unlinkSync(dest);
        reject(err);
      });
  });
}

/**
 * Projedeki tüm sahne videolarını birleştir (orijinal)
 */
async function mergeProjectVideos(projectId) {
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  🎬 Proje ${projectId} — Video Birleştirme`);
  console.log(`═══════════════════════════════════════════\n`);

  const scenes = await prisma.scene.findMany({
    where: {
      projectId: parseInt(projectId),
      videoUrl: { not: null },
    },
    orderBy: { sceneNumber: "asc" },
  });

  if (scenes.length === 0) {
    throw new Error("Hiç video bulunamadı");
  }

  console.log(`📋 ${scenes.length} sahne videosu birleştirilecek\n`);

  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  const oldFiles = fs.readdirSync(TEMP_DIR);
  oldFiles.forEach((f) => fs.unlinkSync(path.join(TEMP_DIR, f)));

  console.log("⬇️ Videolar indiriliyor...\n");
  const videoFiles = [];

  for (const scene of scenes) {
    const num = String(scene.sceneNumber).padStart(2, "0");
    const localPath = path.join(TEMP_DIR, `${num}_scene.mp4`);

    console.log(
      `   ⬇️ Sahne ${scene.sceneNumber}: ${scene.videoUrl.substring(0, 60)}...`
    );

    try {
      await downloadFile(scene.videoUrl, localPath);
      const stats = fs.statSync(localPath);
      if (stats.size < 1000) {
        console.log(`   ⚠️ Sahne ${scene.sceneNumber} çok küçük, atlanıyor`);
        fs.unlinkSync(localPath);
        continue;
      }
      videoFiles.push(localPath);
      console.log(`   ✅ ${(stats.size / (1024 * 1024)).toFixed(1)} MB`);
    } catch (err) {
      console.error(
        `   ❌ Sahne ${scene.sceneNumber} indirilemedi: ${err.message}`
      );
    }
  }

  if (videoFiles.length === 0) throw new Error("İndirilebilen video yok");
  return await concatAndUpload(videoFiles, projectId);
}

/**
 * Dublajlı videoları birleştir (lokal dosyalardan)
 */
async function mergeDubbedVideos(projectId) {
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  🎬 Proje ${projectId} — DUBLAJLI Video Birleştirme`);
  console.log(`═══════════════════════════════════════════\n`);

  const scenes = await prisma.scene.findMany({
    where: {
      projectId: parseInt(projectId),
      dubbedVideoUrl: { not: null },
    },
    orderBy: { sceneNumber: "asc" },
  });

  if (scenes.length === 0) throw new Error("Hiç dublajlı video bulunamadı");
  console.log(`📋 ${scenes.length} dublajlı video birleştirilecek\n`);

  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
  const oldFiles = fs.readdirSync(TEMP_DIR);
  oldFiles.forEach((f) => fs.unlinkSync(path.join(TEMP_DIR, f)));

  const videoFiles = [];

  for (const scene of scenes) {
    const num = String(scene.sceneNumber).padStart(2, "0");
    let localPath;

    // Lokal dosya mı yoksa URL mi?
    if (scene.dubbedVideoUrl.startsWith("/local-dubbed/") || scene.dubbedVideoUrl.startsWith("/local-videos/")) {
      localPath = path.join(process.cwd(), "public", scene.dubbedVideoUrl);
    } else {
      // URL'den indir
      localPath = path.join(TEMP_DIR, `${num}_dubbed.mp4`);
      console.log(`   ⬇️ Sahne ${scene.sceneNumber}: indiriliyor...`);
      try {
        await downloadFile(scene.dubbedVideoUrl, localPath);
      } catch (err) {
        console.error(`   ❌ Sahne ${scene.sceneNumber}: ${err.message}`);
        continue;
      }
    }

    if (fs.existsSync(localPath) && fs.statSync(localPath).size > 1000) {
      videoFiles.push(localPath);
      console.log(
        `   ✅ Sahne ${scene.sceneNumber}: ${(
          fs.statSync(localPath).size /
          (1024 * 1024)
        ).toFixed(1)} MB`
      );
    } else {
      console.log(`   ⚠️ Sahne ${scene.sceneNumber} bulunamadı veya çok küçük`);
    }
  }

  if (videoFiles.length === 0) throw new Error("Birleştirilebilecek video yok");
  return await concatAndUpload(videoFiles, projectId, "dubbed");
}

/**
 * Ortak: normalize + concat + R2 upload
 */
async function concatAndUpload(videoFiles, projectId, suffix = "final") {
  console.log(`\n📁 ${videoFiles.length} video birleştirilecek\n`);

  const concatListPath = path.join(TEMP_DIR, "concat.txt");
  const outputPath = path.join(
    TEMP_DIR,
    `proje_${projectId}_${suffix}_${Date.now()}.mp4`
  );

  console.log("🔧 FFmpeg ile birleştiriliyor...\n");

  try {
    const normalizedFiles = [];
    for (let i = 0; i < videoFiles.length; i++) {
      const normalized = path.join(
        TEMP_DIR,
        `norm_${String(i).padStart(3, "0")}.mp4`
      );
      console.log(`   🔄 Normalize: ${path.basename(videoFiles[i])}`);
      execSync(
        `${FFMPEG} -y -i "${videoFiles[i]}" -c:v libx264 -preset medium -crf 18 -c:a aac -ar 44100 -ac 2 -b:a 192k -r 24 -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black" -movflags +faststart "${normalized}"`,
        { stdio: "pipe" }
      );
      normalizedFiles.push(normalized);
    }

    const normConcatContent = normalizedFiles
      .map((f) => `file '${f}'`)
      .join("\n");
    fs.writeFileSync(concatListPath, normConcatContent);

    console.log("\n   🎬 Final video oluşturuluyor...");
    execSync(
      `${FFMPEG} -y -f concat -safe 0 -i "${concatListPath}" -c copy -movflags +faststart "${outputPath}"`,
      { stdio: "pipe" }
    );

    const finalStats = fs.statSync(outputPath);
    console.log(
      `   ✅ Final video: ${(finalStats.size / (1024 * 1024)).toFixed(1)} MB\n`
    );

    console.log("☁️ R2'ye yükleniyor...");
    const videoBuffer = fs.readFileSync(outputPath);
    const r2Key = `final-videos/${projectId}/${suffix}_${Date.now()}.mp4`;
    const finalUrl = await r2Service.uploadBuffer(
      videoBuffer,
      r2Key,
      "video/mp4"
    );

    console.log(`🔗 ${finalUrl}\n`);

    await prisma.project.update({
      where: { id: parseInt(projectId) },
      data: { finalVideoUrl: finalUrl },
    });

    // Temp temizle
    const allTempFiles = fs.readdirSync(TEMP_DIR);
    allTempFiles.forEach((f) => {
      try {
        fs.unlinkSync(path.join(TEMP_DIR, f));
      } catch {}
    });

    console.log(`\n═══════════════════════════════════════════`);
    console.log(`  ✅ Birleştirme tamamlandı!`);
    console.log(`  📎 ${finalUrl}`);
    console.log(`═══════════════════════════════════════════\n`);

    return {
      success: true,
      url: finalUrl,
      totalScenes: videoFiles.length,
      fileSize: `${(finalStats.size / (1024 * 1024)).toFixed(1)} MB`,
    };
  } catch (error) {
    console.error("❌ FFmpeg hatası:", error.message);
    throw error;
  }
}

module.exports = {
  mergeProjectVideos,
  mergeDubbedVideos,
};
