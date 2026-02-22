const express = require("express");
const router = express.Router();
const imageController = require("../controllers/image.controller");

// GET /api/models - Modelleri listele
router.get("/models", imageController.getModels);

module.exports = router;
