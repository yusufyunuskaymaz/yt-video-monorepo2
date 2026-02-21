const { startTimer, endTimer } = require("../utils/timing");

// FLUX API URL (RunPod'daki ayrı servis)
const FLUX_API_URL = process.env.FLUX_API_URL || "http://localhost:8888";

/**
 * Benzersiz ID oluştur (timestamp + random)
 */
function generateId() {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * FLUX API ile resim üretir (CDN upload Python tarafında yapılır)
 * @param {object} promptData - Prompt verisi (subject string veya obje)
 * @param {string} projectId - Proje ID (opsiyonel, dosya adı için)
 * @param {number} sceneNumber - Sahne numarası (opsiyonel, dosya adı için)
 * @returns {Promise<Object>} Üretilen resim bilgileri
 */
async function generateImage({ prompt: promptData, projectId, sceneNumber }) {
  console.log("🎨 Resim üretiliyor (FLUX)...");

  const prompt =
    typeof promptData === "string"
      ? promptData
      : promptData.subject || promptData;

  console.log("📝 Prompt:", prompt);
  console.log("🔗 FLUX API:", FLUX_API_URL);

  try {
    const fluxTimer = startTimer("FLUX_IMAGE_GENERATION");

    const response = await fetch(`${FLUX_API_URL}/generate-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: prompt,
        num_inference_steps: 4,
        width: 1920,
        height: 1080,
        upload_to_cdn: false,
        project_id: projectId ? String(projectId) : null,
        scene_number: sceneNumber || null,
      }),
    });

    const result = await response.json();
    endTimer(fluxTimer, { scene: sceneNumber, projectId: projectId });

    if (!result.success) {
      throw new Error(result.error || "FLUX API hatası");
    }

    console.log("✅ Resim başarıyla üretildi!");
    console.log(`⏱️ Süre: ${result.generation_time}s`);

    if (result.local_path) {
      console.log("📂 Lokal:", result.local_path);
    }
    if (result.cdn_url) {
      console.log("🔗 CDN:", result.cdn_url);
    }

    return {
      cdnUrl: result.cdn_url,
      localPath: result.local_path,
      prompt: promptData,
      generationTime: result.generation_time,
      filename: result.filename,
    };
  } catch (error) {
    console.error("❌ FLUX API Hata:", error.message);
    throw error;
  }
}

/**
 * Mevcut modelleri döndürür
 * @returns {Array} Model listesi
 */
function getAvailableModels() {
  return [
    {
      id: "black-forest-labs/FLUX.1-schnell",
      name: "FLUX.1 Schnell",
      description: "Hızlı yüksek kaliteli resim üretimi",
    },
  ];
}

module.exports = {
  generateImage,
  getAvailableModels,
};
