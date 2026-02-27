const characterService = require("../services/character.service");

/**
 * GET /api/projects/:id/characters
 */
async function getCharacters(req, res) {
  try {
    const characters = await characterService.getCharactersByProject(
      req.params.id
    );
    res.json({ success: true, characters });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /api/projects/:id/characters
 * multipart: name, description, image (file)
 */
async function createCharacter(req, res) {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: "name gerekli" });
    if (!req.file) return res.status(400).json({ error: "image gerekli" });

    const character = await characterService.createCharacter(
      req.params.id,
      name,
      description || "",
      req.file.buffer,
      req.file.mimetype
    );

    res.json({ success: true, character });
  } catch (err) {
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
  getCharacters,
  createCharacter,
  updateCharacter,
  deleteCharacter,
};
