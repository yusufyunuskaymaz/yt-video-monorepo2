/**
 * Image Service - v2
 *
 * Resim üretimi artık Mac'teki vertex-veo3 tarafından yapılır (Gemini browser automation).
 * Bu servis sadece dışarıdan gelen sahne güncellemelerini yönetir.
 *
 * Akış:
 *   1. Mac (vertex-veo3) → Gemini ile resim üretir
 *   2. Mac → R2'ye upload eder
 *   3. Mac → PATCH /api/scenes/:id ile imageUrl'i bildirir
 *   4. Bu servis → DB'yi günceller
 */

/**
 * Mevcut modelleri döndürür
 * @returns {Array} Model listesi
 */
function getAvailableModels() {
  return [
    {
      id: "gemini-2.5-pro",
      name: "Gemini 2.5 Pro (Thinking)",
      description:
        "Google Gemini ile yüksek kaliteli resim üretimi (browser automation)",
      provider: "vertex-veo3",
    },
    {
      id: "veo-3.1",
      name: "Veo 3.1 (Image-to-Video)",
      description:
        "Google Flow ile resimden video üretimi (browser automation)",
      provider: "vertex-veo3",
    },
  ];
}

module.exports = {
  getAvailableModels,
};
