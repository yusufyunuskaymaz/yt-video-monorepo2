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
 * Tek sahne için resim üret (tekrar üretim dahil)
 * POST /api/gemini/generate-scene
 * Body: { projectId, sceneId, model?, characterNames?, referenceSceneId?, customPrompt? }
 */
async function generateScene(req, res) {
  try {
    const {
      projectId,
      sceneId,
      model,
      characterNames,
      referenceSceneId,
      customPrompt,
    } = req.body;

    if (!projectId || !sceneId) {
      return res.status(400).json({ error: "projectId ve sceneId gerekli" });
    }

    const opts = { model };

    // Karakter referansları yükle
    if (characterNames && characterNames.length > 0) {
      const characterService = require("../services/character.service");
      const charRefs = await characterService.getCharacterImagesAsBase64ByNames(
        characterNames
      );
      if (charRefs.length > 0) {
        opts.referenceImages = charRefs.map((c) => ({
          base64: c.base64,
          mimeType: c.mimeType,
        }));
        console.log(
          `[Regen] ${characterNames.join(", ")} karakter referansları yüklendi`
        );
      }
    }

    // Referans sahne yükle
    if (referenceSceneId) {
      const projectService = require("../services/project.service");
      const refScene = await projectService.getSceneById(
        parseInt(referenceSceneId)
      );
      if (refScene && refScene.imageUrl) {
        const characterService = require("../services/character.service");
        // downloadToBuffer'ı character service'den kullan
        const https = require("https");
        const http = require("http");
        const buffer = await new Promise((resolve, reject) => {
          const protocol = refScene.imageUrl.startsWith("https") ? https : http;
          protocol
            .get(refScene.imageUrl, (response) => {
              if (response.statusCode === 301 || response.statusCode === 302) {
                protocol.get(response.headers.location, (r2) => {
                  const chunks = [];
                  r2.on("data", (c) => chunks.push(c));
                  r2.on("end", () => resolve(Buffer.concat(chunks)));
                });
                return;
              }
              const chunks = [];
              response.on("data", (c) => chunks.push(c));
              response.on("end", () => resolve(Buffer.concat(chunks)));
              response.on("error", reject);
            })
            .on("error", reject);
        });
        opts.previousSceneBuffer = buffer;
        opts.previousSceneUrl = refScene.imageUrl;
        // Sahneyi prev ref kullanacak gibi işaretle
        opts.forceUsePrevRef = true;
      }
    }

    // Custom prompt
    if (customPrompt) {
      opts.customPrompt = customPrompt;
    }

    // Default stil yükle
    const projectService = require("../services/project.service");
    const project = await projectService.getProject(parseInt(projectId));
    if (project && project.defaultStyle) {
      opts.defaultStyle = project.defaultStyle;
    }

    const result = await geminiImageService.generateAndUploadForScene(
      parseInt(projectId),
      parseInt(sceneId),
      opts
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

/**
 * Üretimi iptal et
 * POST /api/gemini/cancel/:projectId
 */
async function cancelGeneration(req, res) {
  try {
    const { projectId } = req.params;
    geminiImageService.cancelGeneration(projectId);

    const projectService = require("../services/project.service");
    await projectService.updateProject(projectId, {
      status: "generation_cancelled",
    });

    res.json({ success: true, message: "Üretim iptal edildi" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getModels,
  generateScene,
  generateProject,
  cancelGeneration,
};
