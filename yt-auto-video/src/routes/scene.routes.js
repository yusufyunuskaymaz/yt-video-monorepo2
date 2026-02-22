const express = require("express");
const router = express.Router();
const sceneController = require("../controllers/scene.controller");

// GET /api/scenes/:id - Sahne detayı
router.get("/:id", sceneController.getScene);

// PATCH /api/scenes/:id - Sahne güncelle (vertex-veo3 buraya bildirir)
router.patch("/:id", sceneController.updateScene);

// PATCH /api/scenes/bulk - Toplu sahne güncelle
router.patch("/bulk", sceneController.bulkUpdateScenes);

module.exports = router;
