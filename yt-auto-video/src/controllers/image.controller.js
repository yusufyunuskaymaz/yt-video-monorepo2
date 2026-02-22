const imageService = require("../services/image.service");

/**
 * Mevcut modelleri listele
 * GET /api/models
 */
function getModels(req, res) {
  const models = imageService.getAvailableModels();
  res.json({
    success: true,
    models,
  });
}

module.exports = {
  getModels,
};
