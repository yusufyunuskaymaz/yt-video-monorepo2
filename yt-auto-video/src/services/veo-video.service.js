/**
 * Grok Video Service — xAI Grok API ile image-to-video üretimi
 * Sahne resmini alır, video üretir, R2'ye yükler, DB günceller
 */

const prisma = require("../config/db.config");
const r2Service = require("./r2.service");
const https = require("https");
const http = require("http");

const XAI_API_KEY = process.env.XAI_API_KEY;
const GROK_MODEL = "grok-imagine-video";
const API_BASE = "https://api.x.ai/v1";
const POLL_INTERVAL = 10000; // 10 saniye
const MAX_POLL_TIME = 600000; // 10 dakika timeout

/**
 * URL'den resmi Buffer olarak indir
 */
function downloadImageAsBuffer(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    protocol
      .get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          downloadImageAsBuffer(response.headers.location)
            .then(resolve)
            .catch(reject);
          return;
        }
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks)));
        response.on("error", reject);
      })
      .on("error", reject);
  });
}

/**
 * Grok API'ye POST isteği gönder
 */
async function grokPost(endpoint, body) {
  const url = `${API_BASE}${endpoint}`;
  const data = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${XAI_API_KEY}`,
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString();
          try {
            resolve(JSON.parse(text));
          } catch {
            reject(
              new Error(`API yanıt parse hatası: ${text.substring(0, 200)}`)
            );
          }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

/**
 * Grok API'den GET isteği
 */
async function grokGet(endpoint) {
  const url = `${API_BASE}${endpoint}`;

  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            Authorization: `Bearer ${XAI_API_KEY}`,
          },
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString();
            try {
              resolve(JSON.parse(text));
            } catch {
              reject(
                new Error(`API yanıt parse hatası: ${text.substring(0, 200)}`)
              );
            }
          });
        }
      )
      .on("error", reject);
  });
}

/**
 * URL'den video indir
 */
function downloadVideo(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    protocol
      .get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          downloadVideo(response.headers.location).then(resolve).catch(reject);
          return;
        }
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks)));
        response.on("error", reject);
      })
      .on("error", reject);
  });
}

/**
 * Tek sahne için video üret
 */
async function generateVideoForScene(scene, projectId) {
  const videoPrompt = scene.videoPrompt || scene.subject || "";

  console.log(
    `\n🎬 [Grok] Sahne ${scene.sceneNumber} video üretimi başlıyor...`
  );
  console.log(`   Prompt: "${videoPrompt.substring(0, 80)}..."`);
  console.log(`   Resim: ${scene.imageUrl}`);

  // 1. Sahne durumunu güncelle
  await prisma.scene.update({
    where: { id: scene.id },
    data: { status: "video_generating" },
  });

  try {
    // 2. Video üretim isteği gönder (image-to-video)
    console.log(`   🚀 Grok API'ye istek gönderiliyor...`);

    const requestBody = {
      model: GROK_MODEL,
      prompt: videoPrompt,
      image: { url: scene.imageUrl },
      duration: 5,
      aspect_ratio: "16:9",
      resolution: "720p",
    };

    const startResponse = await grokPost("/videos/generations", requestBody);

    if (startResponse.error) {
      throw new Error(
        `API hatası: ${
          startResponse.error.message || JSON.stringify(startResponse.error)
        }`
      );
    }

    const requestId = startResponse.request_id;
    if (!requestId) {
      throw new Error(`request_id alınamadı: ${JSON.stringify(startResponse)}`);
    }

    console.log(`   📦 Request ID: ${requestId}`);

    // 3. Poll — video hazır olana kadar bekle
    const startTime = Date.now();
    let result = null;

    while (Date.now() - startTime < MAX_POLL_TIME) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`   ⏳ Bekleniyor... (${elapsed}s)`);

      await new Promise((r) => setTimeout(r, POLL_INTERVAL));

      const pollResult = await grokGet(`/videos/${requestId}`);

      // API "done" olunca video.url döner (status alanı her zaman olmayabilir)
      if (pollResult.video?.url || pollResult.status === "done") {
        result = pollResult;
        break;
      } else if (pollResult.status === "expired" || pollResult.error) {
        throw new Error(
          `Video üretim hatası: ${
            pollResult.error?.message || pollResult.status
          }`
        );
      }
      // status === "pending" veya henüz video yok → devam et
    }

    if (!result) {
      throw new Error("Video üretim timeout (10 dk)");
    }

    // 4. Video URL'sini al
    const videoUrl = result.video?.url;
    if (!videoUrl) {
      throw new Error("Video URL alınamadı");
    }

    console.log(`   ✅ Video hazır! İndiriliyor...`);
    console.log(`   📎 Geçici URL: ${videoUrl}`);

    // 5. Videoyu indir
    const videoBuffer = await downloadVideo(videoUrl);
    console.log(
      `   💾 Video indirildi (${(videoBuffer.length / (1024 * 1024)).toFixed(
        1
      )} MB)`
    );

    // 6. R2'ye yükle
    console.log(`   ☁️ R2'ye yükleniyor...`);
    const r2Key = `grok-videos/${projectId}/${String(
      scene.sceneNumber
    ).padStart(2, "0")}_scene.mp4`;
    const r2Url = await r2Service.uploadBuffer(videoBuffer, r2Key, "video/mp4");

    // 7. DB güncelle
    await prisma.scene.update({
      where: { id: scene.id },
      data: {
        videoUrl: r2Url,
        status: "video_done",
      },
    });

    console.log(`   ✅ Sahne ${scene.sceneNumber} video tamamlandı!`);
    console.log(`   🔗 ${r2Url}\n`);

    return r2Url;
  } catch (error) {
    console.error(
      `   ❌ Sahne ${scene.sceneNumber} video hatası: ${error.message}`
    );

    await prisma.scene.update({
      where: { id: scene.id },
      data: { status: "video_failed" },
    });

    throw error;
  }
}

/**
 * Projedeki tüm sahneler için video üret (sıralı)
 */
async function generateAllVideos(projectId) {
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  🎬 Proje ${projectId} — Grok Video Üretimi`);
  console.log(`═══════════════════════════════════════════\n`);

  const scenes = await prisma.scene.findMany({
    where: {
      projectId: parseInt(projectId),
      imageUrl: { not: null },
      OR: [{ videoUrl: null }, { videoUrl: "" }, { status: "video_failed" }],
    },
    orderBy: { sceneNumber: "asc" },
  });

  if (scenes.length === 0) {
    console.log("✅ Tüm sahnelerin videosu mevcut.");
    return { processed: 0, failed: 0, total: 0 };
  }

  console.log(`📋 ${scenes.length} sahne videosu üretilecek\n`);

  await prisma.project.update({
    where: { id: parseInt(projectId) },
    data: { status: "generating_videos" },
  });

  let processed = 0;
  let failed = 0;

  for (const scene of scenes) {
    try {
      await generateVideoForScene(scene, projectId);
      processed++;
    } catch (err) {
      console.error(`❌ Sahne ${scene.sceneNumber}: ${err.message}`);
      failed++;

      if (failed >= 3) {
        console.error("❌ 3 art arda hata, durduruluyor!");
        break;
      }
    }

    // Rate limit
    if (processed + failed < scenes.length) {
      console.log("⏳ 5s bekleniyor (rate limit)...\n");
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  const finalStatus = failed === scenes.length ? "video_failed" : "videos_done";
  await prisma.project.update({
    where: { id: parseInt(projectId) },
    data: { status: finalStatus },
  });

  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  ✅ Tamamlandı: ${processed} başarılı, ${failed} hatalı`);
  console.log(`═══════════════════════════════════════════\n`);

  return { processed, failed, total: scenes.length };
}

module.exports = {
  generateVideoForScene,
  generateAllVideos,
};
