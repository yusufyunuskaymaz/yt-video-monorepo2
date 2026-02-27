const geminiImageService = require("../services/gemini-image.service");

/**
 * Gemini modelleri listele
 * GET /api/gemini/models
 */
async function getModels(req, res) {
  try {
    const models = await geminiImageService.getModels();
    res.json({ success: true, models });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Tek sahne için resim üret
 * POST /api/gemini/generate-scene
 * Body: { projectId, sceneId, model?, aspectRatio?, referenceImages? }
 */
async function generateScene(req, res) {
  try {
    const { projectId, sceneId, model, aspectRatio, referenceImages } =
      req.body;

    if (!projectId || !sceneId) {
      return res.status(400).json({ error: "projectId ve sceneId gerekli" });
    }

    const result = await geminiImageService.generateAndUploadForScene(
      parseInt(projectId),
      parseInt(sceneId),
      { model, aspectRatio, referenceImages }
    );

    res.json({ success: true, ...result });
  } catch (err) {
    console.error("[Gemini Controller] generateScene hatası:", err.message);
    res.status(500).json({ error: err.message });
  }
}

/**
 * Proje için tüm sahnelerin resimlerini üret
 * POST /api/gemini/generate-project
 * Body: { projectId, model?, aspectRatio?, referenceImages? }
 */
async function generateProject(req, res) {
  try {
    const { projectId, model, aspectRatio, referenceImages } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: "projectId gerekli" });
    }

    // Async başlat — hemen cevap dön
    res.json({ success: true, message: "Resim üretimi başlatıldı" });

    // Arka planda üret
    geminiImageService
      .generateAllForProject(parseInt(projectId), {
        model,
        aspectRatio,
        referenceImages,
      })
      .catch((err) => {
        console.error(
          "[Gemini Controller] generateProject hatası:",
          err.message
        );
      });
  } catch (err) {
    console.error("[Gemini Controller] generateProject hatası:", err.message);
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getModels,
  generateScene,
  generateProject,
};
