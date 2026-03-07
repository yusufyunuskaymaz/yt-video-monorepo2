const characterService = require("../services/character.service");

/**
 * GET /api/characters — Tüm karakterleri listele (global)
 */
async function getAllCharacters(req, res) {
  try {
    const { projectId } = req.query;
    const characters = await characterService.getAllCharacters(projectId);
    res.json({ success: true, characters });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /api/characters — Yeni karakter oluştur (global)
 * multipart: name, image (file)
 */
async function createCharacter(req, res) {
  try {
    const { name, projectId } = req.body;
    if (!name) return res.status(400).json({ error: "name gerekli" });
    if (!req.file) return res.status(400).json({ error: "image gerekli" });

    const character = await characterService.createCharacter(
      name,
      req.file.buffer,
      req.file.mimetype,
      projectId
    );

    res.json({ success: true, character });
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(400).json({ error: `"${req.body.name}" zaten mevcut` });
    }
    res.status(500).json({ error: err.message });
  }
}

/**
 * PUT /api/characters/:id
 */
async function updateCharacter(req, res) {
  try {
    const { name, description } = req.body;
    const character = await characterService.updateCharacter(req.params.id, {
      ...(name && { name }),
      ...(description !== undefined && { description }),
    });
    res.json({ success: true, character });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * DELETE /api/characters/:id
 */
async function deleteCharacter(req, res) {
  try {
    await characterService.deleteCharacter(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getAllCharacters,
  createCharacter,
  updateCharacter,
  deleteCharacter,
};
