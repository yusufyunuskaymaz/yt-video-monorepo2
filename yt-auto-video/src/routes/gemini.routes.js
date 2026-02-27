const express = require("express");
const router = express.Router();
const geminiController = require("../controllers/gemini.controller");

// GET /api/gemini/models — Model listesi
router.get("/models", geminiController.getModels);

// POST /api/gemini/generate-scene — Tek sahne resim üret
router.post("/generate-scene", geminiController.generateScene);

// POST /api/gemini/generate-project — Tüm proje resimlerini üret
router.post("/generate-project", geminiController.generateProject);

module.exports = router;
