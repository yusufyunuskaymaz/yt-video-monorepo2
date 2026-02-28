/**
 * Gemini Image Generation Service
 *
 * Gemini API ile resim üretimi → R2'ye upload → DB güncelleme
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const r2Service = require("./r2.service");
const projectService = require("./project.service");
const characterService = require("./character.service");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Model cache
let modelsCache = { data: null, timestamp: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 dakika

// İptal mekanizması
const cancelledProjects = new Set();

/**
 * Gemini API'den modelleri çek ve filtrele
 */
async function getModels() {
  const apiKey = GEMINI_API_KEY;
  if (!apiKey) return [];

  // Cache kontrolü
  if (modelsCache.data && Date.now() - modelsCache.timestamp < CACHE_TTL) {
    return modelsCache.data;
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`
    );
    if (!response.ok) return [];

    const json = await response.json();
    const allModels = json.models || [];

    // generateContent destekleyenleri filtrele
    const generateModels = allModels.filter((m) =>
      m.supportedGenerationMethods?.includes("generateContent")
    );

    // Resim üreten modelleri ayıkla
    const imageKeywords = ["image", "banana", "imagen"];
    const models = [];

    for (const m of generateModels) {
      const id = m.name.replace("models/", "");
      const isImageModel = imageKeywords.some(
        (kw) =>
          id.toLowerCase().includes(kw) ||
          (m.displayName || "").toLowerCase().includes(kw)
      );

      if (isImageModel) {
        models.push({
          id,
          name: m.displayName || id,
          description: m.description || "",
          category: "image",
        });
      }
    }

    console.log(`[Gemini] ${models.length} resim modeli bulundu`);
    modelsCache = { data: models, timestamp: Date.now() };
    return models;
  } catch (err) {
    console.error("[Gemini] Model listesi hatası:", err.message);
    return [];
  }
}

/**
 * Tek bir resim üret
 * @param {string} prompt - Resim promptu
 * @param {object} options - { model, aspectRatio, imageSize, referenceImages }
 * @returns {Promise<{imageBuffer: Buffer, mimeType: string}>}
 */
async function generateImage(prompt, options = {}) {
  const apiKey = options.apiKey || GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY ayarlanmamış");

  const modelId = options.model || "gemini-2.0-flash-preview-image-generation";
  const aspectRatio = options.aspectRatio || "16:9";
  const imageSize = options.imageSize || "1K";

  console.log(
    `[Gemini] Model: ${modelId}, Prompt: "${prompt.substring(0, 80)}..."`
  );

  // API isteği oluştur
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

  // Contents — prompt + referans resimler
  const parts = [{ text: prompt }];

  if (options.referenceImages && options.referenceImages.length > 0) {
    for (const ref of options.referenceImages) {
      parts.push({
        inlineData: {
          mimeType: ref.mimeType || "image/jpeg",
          data: ref.base64,
        },
      });
    }
    console.log(
      `[Gemini] ${options.referenceImages.length} referans resim eklendi`
    );
  }

  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio,
      },
    },
  };

  // imageSize sadece Gemini 3 modelleri destekler
  if (modelId.includes("gemini-3")) {
    body.generationConfig.imageConfig.imageSize = imageSize;
  }

  let response;
  let retries = 0;
  const maxRetries = 3;

  while (retries <= maxRetries) {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (response.ok) break;

    if (
      (response.status === 429 || response.status === 503) &&
      retries < maxRetries
    ) {
      const waitSec = Math.pow(2, retries + 1) * 10; // 20s, 40s, 80s
      console.warn(
        `[Gemini] ⚠️ Rate limit (${
          response.status
        }), ${waitSec}s bekleyip tekrar deneniyor... (${
          retries + 1
        }/${maxRetries})`
      );
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      retries++;
    } else {
      const errText = await response.text();
      throw new Error(`Gemini API hatası (${response.status}): ${errText}`);
    }
  }

  const result = await response.json();

  // Resmi çıkar (thinking olmayan)
  if (result.candidates?.[0]?.content?.parts) {
    for (const part of result.candidates[0].content.parts) {
      if (part.inlineData && !part.thought) {
        const buffer = Buffer.from(part.inlineData.data, "base64");
        console.log(
          `[Gemini] ✅ Resim üretildi (${(buffer.length / 1024).toFixed(0)}KB)`
        );
        return {
          imageBuffer: buffer,
          mimeType: part.inlineData.mimeType || "image/png",
        };
      }
    }
  }

  throw new Error("Gemini'den resim döndürülmedi — farklı bir prompt deneyin");
}

/**
 * Sahne için resim üret → R2'ye yükle → DB güncelle
 * @param {number} projectId
 * @param {number} sceneId
 * @param {object} options - { model, aspectRatio, referenceImages }
 * @returns {Promise<{imageUrl: string}>}
 */
async function generateAndUploadForScene(projectId, sceneId, options = {}) {
  // Sahneyi al
  const scene = await projectService.getSceneById(sceneId);
  if (!scene) throw new Error(`Sahne bulunamadı: ${sceneId}`);

  const prompt = options.customPrompt || scene.subject;
  if (!prompt) throw new Error(`Sahne ${sceneId} için prompt (subject) yok`);

  // Default stil varsa prompt'un sonuna ekle
  const fullPrompt = options.defaultStyle
    ? `${prompt}\n\nStyle: ${options.defaultStyle}`
    : prompt;

  // Referans resim stratejisi
  let sceneOptions = { ...options };
  let hasCharacters = false;
  const shouldAddPrevRef =
    options.previousSceneBuffer &&
    (scene.usePrevRef || options.forceUsePrevRef);

  // Sahnedeki karakterleri al
  let sceneCharNames = [];
  if (scene.characters) {
    try {
      sceneCharNames = JSON.parse(scene.characters);
    } catch (e) {}
  }

  if (
    shouldAddPrevRef &&
    !options.forceUsePrevRef &&
    sceneCharNames.length === 0
  ) {
    // use_prev_ref: true + karakter YOK → sadece önceki sahne (manzara devamlılığı)
    sceneOptions.referenceImages = [
      {
        base64: options.previousSceneBuffer.toString("base64"),
        mimeType: "image/png",
      },
    ];
    console.log(
      `[Gemini] Sahne ${scene.sceneNumber}: sadece önceki sahne referansı (karakter yok)`
    );
  } else if (
    shouldAddPrevRef &&
    !options.forceUsePrevRef &&
    sceneCharNames.length > 0
  ) {
    // use_prev_ref: true + karakter VAR → önceki sahne + karakter ref birlikte
    sceneOptions.referenceImages = [];
    if (options.allCharacterRefs) {
      const charRefs = options.allCharacterRefs
        .filter((c) => sceneCharNames.includes(c.name))
        .map((c) => ({ base64: c.base64, mimeType: c.mimeType }));
      sceneOptions.referenceImages.push(...charRefs);
      hasCharacters = charRefs.length > 0;
    }
    sceneOptions.referenceImages.push({
      base64: options.previousSceneBuffer.toString("base64"),
      mimeType: "image/png",
    });
    console.log(
      `[Gemini] Sahne ${scene.sceneNumber}: ${sceneCharNames.join(
        ", "
      )} + önceki sahne birlikte (${sceneOptions.referenceImages.length} ref)`
    );
  } else if (options.forceUsePrevRef && options.previousSceneBuffer) {
    // Tekrar üretim — referans sahne + varsa karakter ref birlikte
    sceneOptions.referenceImages = [];
    // Önce karakter referansları
    if (options.referenceImages) {
      sceneOptions.referenceImages.push(...options.referenceImages);
      hasCharacters = true;
    }
    // Sonra önceki sahne
    sceneOptions.referenceImages.push({
      base64: options.previousSceneBuffer.toString("base64"),
      mimeType: "image/png",
    });
    console.log(
      `[Gemini] Sahne ${scene.sceneNumber}: ${sceneOptions.referenceImages.length} referans (karakter + sahne birlikte)`
    );
  } else if (options.referenceImages && !options.allCharacterRefs) {
    // Tekrar üretim — sadece karakter referansları
    sceneOptions.referenceImages = options.referenceImages;
    hasCharacters = options.referenceImages.length > 0;
    console.log(
      `[Gemini] Sahne ${scene.sceneNumber}: ${options.referenceImages.length} karakter referansı (tekrar üretim)`
    );
  } else if (options.allCharacterRefs) {
    // Toplu üretim → sahne bazında karakter filtreleme
    if (scene.characters) {
      try {
        const sceneChars = JSON.parse(scene.characters);
        if (sceneChars.length > 0) {
          hasCharacters = true;
          sceneOptions.referenceImages = options.allCharacterRefs
            .filter((c) => sceneChars.includes(c.name))
            .map((c) => ({ base64: c.base64, mimeType: c.mimeType }));
          console.log(
            `[Gemini] Sahne ${scene.sceneNumber}: ${sceneChars.join(
              ", "
            )} referansları eklendi`
          );
        } else {
          sceneOptions.referenceImages = [];
        }
      } catch (e) {}
    }
  }

  // Üretim logu hazırla
  const refNames = [];
  const refImages = [];

  // Karakter referansları logla
  if (hasCharacters && options.allCharacterRefs && sceneCharNames.length > 0) {
    options.allCharacterRefs
      .filter((c) => sceneCharNames.includes(c.name))
      .forEach((c) => {
        refNames.push(`👤 ${c.name}`);
        refImages.push({
          type: "character",
          name: c.name,
          url: c.imageUrl || null,
        });
      });
  }

  // Önceki sahne referansı logla
  if (shouldAddPrevRef) {
    refNames.push("📸 Önceki sahne");
    refImages.push({
      type: "prev_scene",
      name: "Önceki sahne",
      url: options.previousSceneUrl || null,
    });
  }

  const logData = {
    prompt: fullPrompt,
    model: sceneOptions.model || "default",
    references: refNames,
    refImages: refImages,
    prevRefSent: shouldAddPrevRef,
    prevRefReason: shouldAddPrevRef
      ? "Gönderildi"
      : options.previousSceneBuffer
      ? "Gönderilmedi (use_prev_ref: false)"
      : "İlk sahne",
    refCount: (sceneOptions.referenceImages || []).length,
    startedAt: new Date().toISOString(),
  };

  // Sahne durumunu güncelle
  await projectService.updateScene(sceneId, { status: "image_processing" });

  // Karakter referansı varsa prompt'a talimat ekle
  let finalPrompt = fullPrompt;
  if (
    hasCharacters &&
    sceneOptions.referenceImages &&
    sceneOptions.referenceImages.length > 0
  ) {
    finalPrompt += `\n\nIMPORTANT: The provided reference image(s) show the exact character design. You MUST match the character's face, clothing, hat, accessories, and overall appearance EXACTLY as shown in the reference image(s). Do NOT change or reinterpret any aspect of the character's visual design.`;
  }

  const startTime = Date.now();

  try {
    // Resim üret
    const { imageBuffer, mimeType } = await generateImage(
      finalPrompt,
      sceneOptions
    );

    const durationMs = Date.now() - startTime;

    // R2'ye yükle
    const ext = mimeType.includes("png") ? "png" : "jpg";
    const slugify = (t) =>
      t
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .substring(0, 40);
    const ts = Date.now().toString(36); // kısa timestamp
    const filename = `${String(scene.sceneNumber).padStart(2, "0")}_${slugify(
      prompt
    )}_${ts}.${ext}`;
    const r2Key = `flow-images/${projectId}/images/${filename}`;

    const imageUrl = await r2Service.uploadBuffer(imageBuffer, r2Key, mimeType);

    // Log tamamla
    logData.status = "success";
    logData.durationMs = durationMs;
    logData.durationSec = (durationMs / 1000).toFixed(1);
    logData.imageUrl = imageUrl;
    logData.completedAt = new Date().toISOString();

    // DB güncelle
    await projectService.updateScene(sceneId, {
      imageUrl,
      generationLog: JSON.stringify(logData),
      status: "image_done",
    });

    console.log(
      `[Gemini] ✅ Sahne ${
        scene.sceneNumber
      } → ${durationMs}ms → ${imageUrl.substring(0, 60)}...`
    );
    return { imageUrl, imageBuffer };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    logData.status = "failed";
    logData.durationMs = durationMs;
    logData.error = err.message;
    logData.completedAt = new Date().toISOString();

    await projectService.updateScene(sceneId, {
      generationLog: JSON.stringify(logData),
      status: "image_failed",
    });
    throw err;
  }
}

/**
 * Proje için tüm sahnelerin resimlerini üret
 * @param {number} projectId
 * @param {object} options - { model, aspectRatio, referenceImages, parallel }
 * @returns {Promise<{success: number, failed: number, total: number}>}
 */
async function generateAllForProject(projectId, options = {}) {
  const project = await projectService.getProject(projectId);
  if (!project) throw new Error(`Proje bulunamadı: ${projectId}`);

  // Resmi olmayan sahneleri al
  const pendingScenes = (project.scenes || []).filter(
    (s) =>
      !s.imageUrl &&
      s.status !== "image_done" &&
      s.status !== "image_processing"
  );

  if (pendingScenes.length === 0) {
    console.log(`[Gemini] Proje ${projectId}: üretilecek sahne yok`);
    return { success: 0, failed: 0, total: 0 };
  }

  console.log(
    `[Gemini] Proje ${projectId}: ${pendingScenes.length} sahne üretilecek`
  );

  // Default stil ekle
  if (project.defaultStyle) {
    options.defaultStyle = project.defaultStyle;
    console.log(
      `[Gemini] Default stil: "${project.defaultStyle.substring(0, 60)}..."`
    );
  }

  // Karakter referanslarını yükle (global havuzdan, sahne bazında)
  let characterRefs = [];
  try {
    characterRefs = await characterService.getCharacterImagesForProject(
      projectId
    );
    if (characterRefs.length > 0) {
      console.log(
        `[Gemini] ${
          characterRefs.length
        } karakter referansı yüklendi: ${characterRefs
          .map((c) => c.name)
          .join(", ")}`
      );
      // Tüm referansları sakla (sahne bazında filtrelenecek)
      options.allCharacterRefs = characterRefs;
      // Fallback: sahne characters belirtmemişse tümünü gönder
      options.referenceImages = characterRefs.map((c) => ({
        base64: c.base64,
        mimeType: c.mimeType,
      }));
    }
  } catch (err) {
    console.error("[Gemini] Karakter yükleme hatası:", err.message);
  }

  // Proje durumunu güncelle
  await projectService.updateProject(projectId, {
    status: "generating_images",
  });

  let success = 0;
  let failed = 0;
  let previousSceneBuffer = null;
  let previousSceneUrl = null;

  // İptal flag'ini temizle
  cancelledProjects.delete(projectId);

  for (const scene of pendingScenes) {
    // İptal kontrolü
    if (cancelledProjects.has(projectId)) {
      console.log(
        `[Gemini] ⛔ Proje ${projectId} iptal edildi! ${success} sahne üretildi, kalan atlanıyor.`
      );
      cancelledProjects.delete(projectId);
      break;
    }

    try {
      const sceneOpts = { ...options };
      if (previousSceneBuffer) {
        sceneOpts.previousSceneBuffer = previousSceneBuffer;
        sceneOpts.previousSceneUrl = previousSceneUrl;
      }

      const result = await generateAndUploadForScene(
        projectId,
        scene.id,
        sceneOpts
      );
      previousSceneBuffer = result.imageBuffer;
      previousSceneUrl = result.imageUrl;
      success++;
    } catch (err) {
      console.error(`[Gemini] Sahne ${scene.sceneNumber} hatası:`, err.message);
      failed++;
      previousSceneBuffer = null;
    }
  }

  // Proje durumunu güncelle
  const finalStatus =
    failed === pendingScenes.length ? "generation_failed" : "generation_done";
  await projectService.updateProject(projectId, { status: finalStatus });

  console.log(
    `[Gemini] Proje ${projectId} tamamlandı: ${success}/${pendingScenes.length} başarılı`
  );
  return { success, failed, total: pendingScenes.length };
}

/**
 * Üretimi iptal et
 */
function cancelGeneration(projectId) {
  cancelledProjects.add(parseInt(projectId, 10));
  console.log(`[Gemini] ⛔ Proje ${projectId} iptal talebi alındı`);
}

module.exports = {
  getModels,
  generateImage,
  generateAndUploadForScene,
  generateAllForProject,
  cancelGeneration,
};
