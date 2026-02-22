const express = require("express");
const router = express.Router();

const imageRoutes = require("./image.routes");
const projectRoutes = require("./project.routes");
const sceneRoutes = require("./scene.routes");
const videoService = require("../services/video.service");

// API Routes
router.use("/", imageRoutes);
router.use("/projects", projectRoutes);
router.use("/scenes", sceneRoutes);

// GPU Test Route
router.post("/gpu-test", async (req, res) => {
  try {
    const { video_urls, target_duration_seconds, test_name } = req.body;

    if (!video_urls || video_urls.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "video_urls gerekli" });
    }

    const result = await videoService.gpuTest({
      videoUrls: video_urls,
      targetDurationSeconds: target_duration_seconds || 900,
      testName: test_name || "gpu_test",
    });

    res.json(result);
  } catch (error) {
    console.error("GPU Test route error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
