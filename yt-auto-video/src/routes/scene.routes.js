const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sceneController = require("../controllers/scene.controller");

// Multer — video upload (memory)
const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype.startsWith("video/") ||
      file.originalname.match(/\.(mp4|webm|mov)$/i)
    ) {
      cb(null, true);
    } else {
      cb(new Error("Sadece video dosyaları desteklenir (mp4, webm, mov)"));
    }
  },
});

// POST /api/scenes/:id/upload-video — Video yükle ve mevcut ile değiştir
router.post(
  "/:id/upload-video",
  videoUpload.single("video"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: "Video dosyası gerekli." });
      }

      const { id } = req.params;
      const prisma = require("../config/db.config");

      const scene = await prisma.scene.findUnique({
        where: { id: parseInt(id) },
      });
      if (!scene) {
        return res
          .status(404)
          .json({ success: false, error: "Sahne bulunamadı." });
      }

      // Lokal klasöre kaydet
      const localVideoDir = path.join(
        process.cwd(),
        "public",
        "local-videos",
        String(scene.projectId)
      );
      if (!fs.existsSync(localVideoDir))
        fs.mkdirSync(localVideoDir, { recursive: true });

      const num = String(scene.sceneNumber).padStart(3, "0");
      const ext = path.extname(req.file.originalname) || ".mp4";
      const fileName = `${num}${ext}`;
      const filePath = path.join(localVideoDir, fileName);

      fs.writeFileSync(filePath, req.file.buffer);
      console.log(
        `✅ Video yüklendi: ${filePath} (${(
          req.file.size /
          (1024 * 1024)
        ).toFixed(1)} MB)`
      );

      // DB güncelle — lokal URL
      const videoUrl = `/local-videos/${scene.projectId}/${fileName}`;
      await prisma.scene.update({
        where: { id: parseInt(id) },
        data: {
          videoUrl,
          dubbedVideoUrl: null, // eski dublajı sil
          mergedVideoUrl: null, // eski birleştirilmişi sil
        },
      });

      console.log(
        `✅ Sahne ${scene.sceneNumber} videoUrl güncellendi: ${videoUrl}`
      );
      res.json({ success: true, videoUrl, size: req.file.size });
    } catch (error) {
      console.error("Video upload hatası:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Multer — image upload
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Sadece resim dosyaları desteklenir (jpg, png, webp)"));
    }
  },
});

// POST /api/scenes/:id/upload-image — Resim yükle ve mevcut ile değiştir
router.post(
  "/:id/upload-image",
  imageUpload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: "Resim dosyası gerekli." });
      }

      const { id } = req.params;
      const prisma = require("../config/db.config");

      const scene = await prisma.scene.findUnique({
        where: { id: parseInt(id) },
      });
      if (!scene) {
        return res
          .status(404)
          .json({ success: false, error: "Sahne bulunamadı." });
      }

      // Lokal klasöre kaydet
      const localImageDir = path.join(
        process.cwd(),
        "public",
        "local-images",
        String(scene.projectId)
      );
      if (!fs.existsSync(localImageDir))
        fs.mkdirSync(localImageDir, { recursive: true });

      const num = String(scene.sceneNumber).padStart(3, "0");
      const ext = path.extname(req.file.originalname) || ".jpg";
      const fileName = `${num}${ext}`;
      const filePath = path.join(localImageDir, fileName);

      fs.writeFileSync(filePath, req.file.buffer);
      console.log(
        `✅ Resim yüklendi: ${filePath} (${(req.file.size / 1024).toFixed(
          1
        )} KB)`
      );

      // DB güncelle
      const imageUrl = `/local-images/${scene.projectId}/${fileName}`;
      await prisma.scene.update({
        where: { id: parseInt(id) },
        data: { imageUrl },
      });

      console.log(
        `✅ Sahne ${scene.sceneNumber} imageUrl güncellendi: ${imageUrl}`
      );
      res.json({ success: true, imageUrl, size: req.file.size });
    } catch (error) {
      console.error("Resim upload hatası:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// GET /api/scenes/:id - Sahne detayı
router.get("/:id", sceneController.getScene);

// PATCH /api/scenes/:id - Sahne güncelle (vertex-veo3 buraya bildirir)
router.patch("/:id", sceneController.updateScene);

// PATCH /api/scenes/bulk - Toplu sahne güncelle
router.patch("/bulk", sceneController.bulkUpdateScenes);

// POST /api/scenes/:id/generate-video - Tekil sahne video üretimi (Veo)
router.post("/:id/generate-video", async (req, res) => {
  try {
    const { id } = req.params;
    const prisma = require("../config/db.config");

    const scene = await prisma.scene.findUnique({
      where: { id: parseInt(id) },
    });

    if (!scene) {
      return res
        .status(404)
        .json({ success: false, error: "Sahne bulunamadı" });
    }

    if (!scene.imageUrl) {
      return res
        .status(400)
        .json({ success: false, error: "Sahnenin resmi yok" });
    }

    if (!scene.videoPrompt) {
      return res
        .status(400)
        .json({ success: false, error: "Video prompt yok" });
    }

    // Hemen yanıt dön
    res.json({ success: true, message: "Video üretimi başlatıldı" });

    // Arka planda üret
    const veoService = require("../services/veo-video.service");
    try {
      await veoService.generateVideoForScene(scene, scene.projectId);
      console.log(`✅ Sahne ${scene.sceneNumber} video tamamlandı!`);
    } catch (err) {
      console.error(`❌ Sahne ${scene.sceneNumber} video hatası:`, err.message);
    }
  } catch (error) {
    console.error("❌ Tekil video hatası:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});
// POST /api/scenes/:id/generate-elevenlabs - Tek sahne ElevenLabs TTS
router.post("/:id/generate-elevenlabs", async (req, res) => {
  try {
    const { id } = req.params;
    const { voiceId, modelId } = req.body || {};
    const prisma = require("../config/db.config");
    const elevenlabs = require("../services/elevenlabs.service");
    const projectService = require("../services/project.service");

    const scene = await prisma.scene.findUnique({
      where: { id: parseInt(id) },
    });

    if (!scene) {
      return res
        .status(404)
        .json({ success: false, error: "Sahne bulunamadı" });
    }

    if (!scene.narration) {
      return res
        .status(400)
        .json({ success: false, error: "Sahnenin narration metni yok" });
    }

    console.log(
      `\n🎙️ Sahne ${scene.sceneNumber} ElevenLabs TTS başlatılıyor...`
    );

    // Ses üret
    const result = await elevenlabs.generateAudioForScene(scene, {
      voiceId: voiceId || undefined,
      modelId: modelId || undefined,
    });

    if (result.success) {
      // DB'yi güncelle
      await projectService.updateScene(scene.id, {
        audioUrl: result.audioUrl,
        status: "audio_done",
      });

      let dubbedVideoUrl = null;

      // Video varsa otomatik dublaj yap
      if (scene.videoUrl) {
        try {
          console.log(`\n🎬 Otomatik dublaj başlatılıyor...`);
          const dubService = require("../services/dub.service");
          dubbedVideoUrl = await dubService.dubScene(
            scene.videoUrl,
            result.audioUrl,
            {
              projectId: scene.projectId,
              sceneNumber: scene.sceneNumber,
            }
          );
          // DB'ye kaydet
          await projectService.updateScene(scene.id, {
            dubbedVideoUrl,
          });
          console.log(`✅ Dublaj tamamlandı: ${dubbedVideoUrl}`);
        } catch (dubErr) {
          console.error(
            `⚠️ Dublaj hatası (ses yine de kaydedildi):`,
            dubErr.message
          );
        }
      }

      return res.json({
        success: true,
        audioUrl: result.audioUrl,
        dubbedVideoUrl,
        sceneNumber: scene.sceneNumber,
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("❌ ElevenLabs TTS hatası:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/scenes/generate-all-audio/:projectId - Tüm sahneler — LOKAL MOD (hızlı)
router.post("/generate-all-audio/:projectId", async (req, res) => {
  const { projectId } = req.params;
  const prisma = require("../config/db.config");
  const elevenlabs = require("../services/elevenlabs.service");
  const projectService = require("../services/project.service");
  const dubService = require("../services/dub.service");
  const fs = require("fs");
  const path = require("path");

  // Ses atamaları
  const VOICE_MAP = {
    narrator: "LCHGt3rsPMP50Vs28amI", // 🎙️ Anlatım
    Sultan: "7VqWGAWwo2HMrylfKrcm", // 👑 Padişah
    Vezir: "0DihkedLJYKoWg7H1u4d", // 📿 Vezir
  };

  const LOCAL_VIDEO_DIR = path.join(
    process.cwd(),
    "public",
    "local-videos",
    String(projectId)
  );
  const LOCAL_AUDIO_DIR = path.join(
    process.cwd(),
    "public",
    "local-audio",
    String(projectId)
  );
  const LOCAL_DUBBED_DIR = path.join(
    process.cwd(),
    "public",
    "local-dubbed",
    String(projectId)
  );

  // Klasörleri oluştur
  [LOCAL_AUDIO_DIR, LOCAL_DUBBED_DIR].forEach((d) => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });

  try {
    const scenes = await prisma.scene.findMany({
      where: { projectId: parseInt(projectId) },
      orderBy: { sceneNumber: "asc" },
    });

    // Hemen yanıt dön
    res.json({
      success: true,
      message: `${scenes.length} sahne LOKAL MOD — ses+dublaj başlatıldı`,
      totalScenes: scenes.length,
    });

    let done = 0;
    let errors = 0;
    const startTime = Date.now();

    for (const scene of scenes) {
      try {
        // Ses atamasını belirle
        let voiceId = VOICE_MAP.narrator;

        if (scene.isDialog) {
          const narr = scene.narration.toLowerCase();
          // Dialog sahnelerinde konuşanı tahmin et
          if (
            narr.includes("padişah") ||
            narr.includes("senin yüzünden") ||
            narr.includes("atın bu") ||
            narr.includes("elimi kes") ||
            narr.includes("peki senin") ||
            narr.includes("vezir haklıymış")
          ) {
            voiceId = VOICE_MAP.Sultan;
          } else {
            voiceId = VOICE_MAP.Vezir;
          }
        }

        const voiceName =
          voiceId === VOICE_MAP.Sultan
            ? "👑 Padişah"
            : voiceId === VOICE_MAP.Vezir
            ? "📿 Vezir"
            : "🎙️ Anlatım";

        const num = String(scene.sceneNumber).padStart(3, "0");
        console.log(
          `[${done + 1}/${scenes.length}] Sahne ${
            scene.sceneNumber
          } → ${voiceName}`
        );

        // 1. TTS → lokal MP3
        const result = await elevenlabs.generateAudioForScene(scene, {
          voiceId,
        });

        if (result.success) {
          // Audio URL'den lokal dosya yolu
          const audioLocalPath = path.join(LOCAL_AUDIO_DIR, `${num}.mp3`);
          // ElevenLabs servisi zaten R2'ye yüklüyor, biz ayrıca lokale kaydedelim
          await projectService.updateScene(scene.id, {
            audioUrl: result.audioUrl,
            status: "audio_done",
          });

          // 2. Lokal dublaj (video lokal + TTS'den gelen ses URL'inden indir)
          const videoLocalPath = path.join(LOCAL_VIDEO_DIR, `${num}.mp4`);
          if (fs.existsSync(videoLocalPath)) {
            try {
              // Ses dosyasını lokale indir (küçük, hızlı)
              const https = require("https");
              const http = require("http");
              await new Promise((resolve, reject) => {
                const file = fs.createWriteStream(audioLocalPath);
                const prot = result.audioUrl.startsWith("https") ? https : http;
                prot
                  .get(result.audioUrl, (r) => {
                    if (r.statusCode === 301 || r.statusCode === 302) {
                      prot.get(r.headers.location, (r2) => {
                        r2.pipe(file);
                        file.on("finish", () => file.close(resolve));
                      });
                      return;
                    }
                    r.pipe(file);
                    file.on("finish", () => file.close(resolve));
                  })
                  .on("error", reject);
              });

              const dubbedPath = path.join(LOCAL_DUBBED_DIR, `${num}.mp4`);
              await dubService.dubSceneLocal(
                videoLocalPath,
                audioLocalPath,
                dubbedPath
              );

              // Lokal URL olarak kaydet (browser'dan erişilebilir)
              const dubbedLocalUrl = `/local-dubbed/${projectId}/${num}.mp4`;
              await projectService.updateScene(scene.id, {
                dubbedVideoUrl: dubbedLocalUrl,
              });
            } catch (dubErr) {
              console.error(`   ⚠️ Dublaj hatası: ${dubErr.message}`);
            }
          }

          done++;
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
          const perScene = (elapsed / done).toFixed(1);
          const eta = ((scenes.length - done) * perScene).toFixed(0);
          console.log(
            `   ✅ ${elapsed}s geçti | ~${perScene}s/sahne | ETA: ${eta}s\n`
          );
        } else {
          console.error(`   ❌ TTS hatası: ${result.error}`);
          errors++;
        }
      } catch (sceneErr) {
        console.error(
          `   ❌ Sahne ${scene.sceneNumber} hatası: ${sceneErr.message}`
        );
        errors++;
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`\n══════════════════════════════════`);
    console.log(`✅ LOKAL MOD tamamlandı: ${done} başarılı, ${errors} hata`);
    console.log(
      `⏱️ Toplam: ${totalTime}s | Ortalama: ${(totalTime / done).toFixed(
        1
      )}s/sahne`
    );
    console.log(`══════════════════════════════════\n`);
  } catch (error) {
    console.error("❌ Toplu ses üretim hatası:", error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

// GET /api/elevenlabs/voices - ElevenLabs ses listesi
router.get("/elevenlabs-voices", async (req, res) => {
  try {
    const elevenlabs = require("../services/elevenlabs.service");
    const voices = await elevenlabs.getVoices();
    res.json({ success: true, voices });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
