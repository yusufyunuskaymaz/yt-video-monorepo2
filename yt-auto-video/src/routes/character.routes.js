const express = require("express");
const multer = require("multer");
const router = express.Router();
const characterController = require("../controllers/character.controller");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// GET /api/characters — Tüm karakterleri listele (global)
router.get("/characters", characterController.getAllCharacters);

// POST /api/characters — Yeni karakter oluştur (global)
router.post(
  "/characters",
  upload.single("image"),
  characterController.createCharacter
);

// PUT /api/characters/:id
router.put("/characters/:id", characterController.updateCharacter);

// DELETE /api/characters/:id
router.delete("/characters/:id", characterController.deleteCharacter);

module.exports = router;
