const express = require("express");
const router = express.Router();
const projectController = require("../controllers/project.controller");

// POST /api/projects - Yeni proje oluştur
router.post("/", projectController.createProject);

// GET /api/projects - Tüm projeleri listele
router.get("/", projectController.getAllProjects);

// GET /api/projects/:id - Proje detayları
router.get("/:id", projectController.getProject);

// GET /api/projects/:id/stats - Proje istatistikleri
router.get("/:id/stats", projectController.getProjectStats);

// POST /api/projects/:id/generate-all - Tüm görselleri oluştur
router.post("/:id/generate-all", projectController.generateAllImages);

// POST /api/projects/:id/generate-audio - Tüm sesleri oluştur
router.post("/:id/generate-audio", projectController.generateAllAudio);

// POST /api/projects/:id/generate-videos - Tüm videoları oluştur
// Query: ?sync=true ile senkron çalıştırılabilir
router.post("/:id/generate-videos", projectController.generateAllVideos);

// POST /api/projects/:id/merge-videos - Video + Ses birleştir
router.post("/:id/merge-videos", projectController.mergeAllVideos);

// POST /api/projects/:id/generate-pipeline - Tam akış (Resim→Ses→Video→Birleştir)
router.post("/:id/generate-pipeline", projectController.generateFullPipeline);

// POST /api/projects/:id/concatenate-final - Sadece final video birleştirme
router.post("/:id/concatenate-final", projectController.concatenateFinalVideo);

// PATCH /api/projects/:id - Proje güncelle (status vb.)
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const projectService = require("../services/project.service");
    const updated = await projectService.updateProject(id, req.body);
    res.json({ success: true, project: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/projects/:id/request-generation - Resim/Video üretimi talep et
// vertex-veo3 watcher bu durumu izler
router.post("/:id/request-generation", async (req, res) => {
  try {
    const { id } = req.params;
    const projectService = require("../services/project.service");
    await projectService.updateProjectStatus(id, "generation_requested");
    console.log(`🎬 Proje ${id} için resim/video üretimi talep edildi`);
    res.json({
      success: true,
      message:
        "Üretim talebi gönderildi. vertex-veo3 (Mac) otomatik başlayacak.",
      status: "generation_requested",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/projects/:id - Projeyi sil
router.delete("/:id", projectController.deleteProject);

// ====== Performance Timing Endpoints ======
const timing = require("../utils/timing");

// GET /api/projects/performance/summary - Performance özeti
router.get("/performance/summary", (req, res) => {
  const summary = timing.getSummary();
  res.json({
    success: true,
    summary,
    logFile: timing.LOG_FILE,
  });
});

// GET /api/projects/performance/project/:id - Proje bazlı detaylı rapor
router.get("/performance/project/:id", (req, res) => {
  const stats = timing.getProjectStats(req.params.id);
  res.json({
    success: true,
    projectId: req.params.id,
    stats,
  });
});

// POST /api/projects/performance/clear - Logları temizle
router.post("/performance/clear", (req, res) => {
  timing.clearLog();
  res.json({ success: true, message: "Performance log temizlendi" });
});

module.exports = router;
