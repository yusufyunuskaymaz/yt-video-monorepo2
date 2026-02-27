const express = require("express");
const multer = require("multer");
const router = express.Router();
const characterController = require("../controllers/character.controller");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// GET /api/projects/:id/characters
router.get("/projects/:id/characters", characterController.getCharacters);

// POST /api/projects/:id/characters (multipart: name, description, image)
router.post(
  "/projects/:id/characters",
  upload.single("image"),
  characterController.createCharacter
);

// PUT /api/characters/:id
router.put("/characters/:id", characterController.updateCharacter);

// DELETE /api/characters/:id
router.delete("/characters/:id", characterController.deleteCharacter);

module.exports = router;
