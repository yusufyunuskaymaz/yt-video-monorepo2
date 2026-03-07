/**
 * Scene Controller - Dış servislerden sahne güncelleme
 *
 * vertex-veo3 (Mac) buraya API çağrısı yaparak
 * üretilen resim/video URL'lerini bildirir.
 */
const projectService = require("../services/project.service");

/**
 * Sahne güncelle (resim, video, ses URL'leri)
 * PATCH /api/scenes/:id
 *
 * Body: { imageUrl?, videoUrl?, audioUrl?, mergedVideoUrl?, status? }
 */
async function updateScene(req, res) {
  try {
    const { id } = req.params;
    const {
      imageUrl,
      videoUrl,
      audioUrl,
      mergedVideoUrl,
      dubbedVideoUrl,
      audioDuration,
      isDialog,
      status,
    } = req.body;

    const scene = await projectService.getSceneById(id);
    if (!scene) {
      return res
        .status(404)
        .json({ success: false, error: "Sahne bulunamadı" });
    }

    // Güncelleme verisi oluştur
    const updateData = {};
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
    if (videoUrl !== undefined) updateData.videoUrl = videoUrl;
    if (audioUrl !== undefined) updateData.audioUrl = audioUrl;
    if (mergedVideoUrl !== undefined)
      updateData.mergedVideoUrl = mergedVideoUrl;
    if (dubbedVideoUrl !== undefined)
      updateData.dubbedVideoUrl = dubbedVideoUrl;
    if (audioDuration !== undefined) updateData.audioDuration = audioDuration;
    if (isDialog !== undefined) updateData.isDialog = isDialog;
    if (status !== undefined) updateData.status = status;

    // Otomatik status belirleme
    if (!status) {
      if (imageUrl) updateData.status = "image_done";
      if (videoUrl) updateData.status = "video_done";
      if (mergedVideoUrl) updateData.status = "completed";
    }

    const updated = await projectService.updateScene(id, updateData);

    console.log(
      `✅ Sahne ${id} güncellendi:`,
      Object.keys(updateData).join(", ")
    );

    res.json({
      success: true,
      scene: updated,
    });
  } catch (error) {
    console.error("❌ Sahne güncelleme hatası:", error);
    res.status(500).json({
      success: false,
      error: "Sahne güncellenirken hata oluştu",
      details: error.message,
    });
  }
}

/**
 * Toplu sahne güncelle (birden fazla sahneyi tek istekte)
 * PATCH /api/scenes/bulk
 *
 * Body: { updates: [{ sceneId, imageUrl?, videoUrl?, status? }, ...] }
 */
async function bulkUpdateScenes(req, res) {
  try {
    const { updates } = req.body;

    if (!updates || !Array.isArray(updates)) {
      return res
        .status(400)
        .json({ success: false, error: "updates array gerekli" });
    }

    const results = [];
    for (const update of updates) {
      const { sceneId, ...data } = update;
      try {
        const updated = await projectService.updateScene(sceneId, data);
        results.push({ sceneId, success: true });
      } catch (err) {
        results.push({ sceneId, success: false, error: err.message });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    console.log(`✅ Toplu güncelleme: ${succeeded}/${results.length} başarılı`);

    res.json({
      success: true,
      total: results.length,
      succeeded,
      failed: results.length - succeeded,
      results,
    });
  } catch (error) {
    console.error("❌ Toplu güncelleme hatası:", error);
    res.status(500).json({
      success: false,
      error: "Toplu güncelleme sırasında hata oluştu",
      details: error.message,
    });
  }
}

/**
 * Sahne detayını getir
 * GET /api/scenes/:id
 */
async function getScene(req, res) {
  try {
    const { id } = req.params;
    const scene = await projectService.getSceneById(id);

    if (!scene) {
      return res
        .status(404)
        .json({ success: false, error: "Sahne bulunamadı" });
    }

    res.json({ success: true, scene });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  updateScene,
  bulkUpdateScenes,
  getScene,
};
