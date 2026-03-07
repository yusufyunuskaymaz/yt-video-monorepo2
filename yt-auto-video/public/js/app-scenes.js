// GPU Test
async function runGpuTest() {
  const url1 = document.getElementById("gpuVideoUrl1").value.trim();
  const url2 = document.getElementById("gpuVideoUrl2").value.trim();
  const url3 = document.getElementById("gpuVideoUrl3").value.trim();
  const targetDuration = parseInt(
    document.getElementById("gpuTargetDuration").value
  );
  const testName =
    document.getElementById("gpuTestName").value.trim() || "gpu_test";

  const msgEl = document.getElementById("gpuTestMessage");
  const btn = document.getElementById("gpuTestBtn");
  const resultsEl = document.getElementById("gpuTestResults");

  // En az 1 URL gerekli
  const videoUrls = [url1, url2, url3].filter((u) => u.length > 0);
  if (videoUrls.length === 0) {
    showMessage(msgEl, "error", "En az 1 video URL gerekli!");
    return;
  }

  btn.disabled = true;
  btn.innerHTML =
    '<div class="spinner"></div><span>GPU Test Çalışıyor...</span>';
  msgEl.className = "message";
  resultsEl.classList.add("hidden");

  try {
    // Python API'ye istek at (Node.js proxy üzerinden)
    const response = await fetch("/api/gpu-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        video_urls: videoUrls,
        target_duration_seconds: targetDuration,
        test_name: testName,
      }),
    });

    const result = await response.json();

    if (result.success) {
      showMessage(msgEl, "success", "✅ GPU Test başarıyla tamamlandı!");

      // Sonuçları göster
      const m = result.metrics;
      const totalTimeMs =
        m.download_time_ms + m.encode_time_ms + m.upload_time_ms;
      const encodingSpeed = (
        m.total_duration /
        (m.encode_time_ms / 1000)
      ).toFixed(2);

      document.getElementById("gpuTestStats").innerHTML = `
              <div class="stat-box"><div class="stat-value">${(
                m.download_time_ms / 1000
              ).toFixed(1)}s</div><div class="stat-label">İndirme</div></div>
              <div class="stat-box"><div class="stat-value" style="color: #ff6b6b;">${(
                m.encode_time_ms / 1000
              ).toFixed(1)}s</div><div class="stat-label">Encoding</div></div>
              <div class="stat-box"><div class="stat-value">${(
                m.upload_time_ms / 1000
              ).toFixed(1)}s</div><div class="stat-label">Yükleme</div></div>
              <div class="stat-box"><div class="stat-value" style="color: #4caf50;">${(
                totalTimeMs / 1000
              ).toFixed(1)}s</div><div class="stat-label">Toplam</div></div>
              <div class="stat-box"><div class="stat-value">${
                m.video_count
              }</div><div class="stat-label">Klip Sayısı</div></div>
              <div class="stat-box"><div class="stat-value">${(
                m.total_duration / 60
              ).toFixed(
                1
              )} dk</div><div class="stat-label">Video Süresi</div></div>
              <div class="stat-box"><div class="stat-value" style="color: #667eea;">${encodingSpeed}x</div><div class="stat-label">Encoding Hızı</div></div>
            `;

      document.getElementById("gpuTestVideoContainer").innerHTML = `
              <button class="video-play-btn" onclick="openVideoModal('${result.video_url}')" style="background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%);">
                ▶️ Test Videosunu İzle
              </button>
              <a href="${result.video_url}" target="_blank" style="margin-left: 10px; color: #667eea; text-decoration: underline; font-size: 0.85rem;">
                🔗 CDN Link
              </a>
            `;

      resultsEl.classList.remove("hidden");
    } else {
      showMessage(msgEl, "error", `❌ Hata: ${result.error}`);
    }
  } catch (error) {
    showMessage(msgEl, "error", `❌ Sunucu hatası: ${error.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = "🚀 GPU Test Başlat";
  }
}

// ─── Sahne Karakter Eşleştirme ──────────────────
function toggleRegenPanel(sceneId) {
  const row = document.getElementById(`regen-${sceneId}`);
  if (row) {
    row.style.display = row.style.display === "none" ? "table-row" : "none";
  }
}

async function regenerateScene(sceneId) {
  if (!currentProjectId) return;

  // Seçili karakterleri topla
  const charContainer = document.getElementById(`regen-chars-${sceneId}`);
  const characterNames = [
    ...charContainer.querySelectorAll("input[type=checkbox]:checked"),
  ].map((cb) => cb.value);

  // Referans sahne
  const refSelect = document.getElementById(`regen-ref-${sceneId}`);
  const referenceSceneId = refSelect.value ? parseInt(refSelect.value) : null;

  // Custom prompt
  const promptInput = document.getElementById(`regen-prompt-${sceneId}`);
  const customPrompt = promptInput.value.trim() || null;

  // Model
  const model = document.getElementById("geminiModelSelect").value;

  if (
    !confirm(
      `Sahne tekrar üretilecek.\n\nKarakterler: ${
        characterNames.length > 0 ? characterNames.join(", ") : "Yok"
      }\nReferans sahne: ${
        referenceSceneId ? "Sahne " + refSelect.selectedOptions[0].text : "Yok"
      }\n\nDevam?`
    )
  )
    return;

  // Butonu disable et
  const btn = event.target;
  const origText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = "⏳ Üretiliyor...";

  try {
    const res = await fetch("/api/gemini/generate-scene", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: currentProjectId,
        sceneId,
        model,
        characterNames: characterNames.length > 0 ? characterNames : undefined,
        referenceSceneId,
        customPrompt,
      }),
    });
    const data = await res.json();
    if (data.success) {
      alert("✅ Sahne başarıyla üretildi!");
      // Kısa gecikme ile yenile (cache temizlenmesi için)
      setTimeout(() => viewProject(currentProjectId), 500);
    } else {
      alert("Hata: " + data.error);
    }
  } catch (e) {
    alert("Üretim hatası: " + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = origText;
  }
}

function toggleSceneLog(sceneId) {
  const row = document.getElementById(`log-${sceneId}`);
  const vpRow = document.getElementById(`vp-${sceneId}`);
  const playerRow = document.getElementById(`player-${sceneId}`);
  const newDisplay =
    (row && row.style.display === "none") ||
    (vpRow && vpRow.style.display === "none") ||
    (playerRow && playerRow.style.display === "none")
      ? "table-row"
      : "none";
  if (row) row.style.display = newDisplay;
  if (vpRow) vpRow.style.display = newDisplay;
  if (playerRow) playerRow.style.display = newDisplay;
}

async function toggleSceneCharacter(sceneId, charName, checked) {
  try {
    // Mevcut sahne verisini al
    const res = await fetch(`/api/scenes/${sceneId}`);
    const data = await res.json();
    let chars = [];
    if (data.success && data.scene.characters) {
      chars = JSON.parse(data.scene.characters);
    }

    if (checked && !chars.includes(charName)) {
      chars.push(charName);
    } else if (!checked) {
      chars = chars.filter((c) => c !== charName);
    }

    // Güncelle
    await fetch(`/api/scenes/${sceneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characters: JSON.stringify(chars) }),
    });
  } catch (e) {
    console.error("Karakter eşleştirme hatası:", e);
  }
}

// ─── Speech Text Save ──────────────────────────────
async function saveSpeechText(sceneId, text) {
  const cleaned = text.trim().replace(/metin ekle\.\.\./g, "");
  if (!cleaned) return;
  try {
    await fetch(`/api/scenes/${sceneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speechText: cleaned }),
    });
    console.log(`✅ Sahne ${sceneId} speechText kaydedildi: ${cleaned}`);
  } catch (e) {
    console.error("speechText kaydetme hatası:", e);
  }
}

// ─── Video Upload ──────────────────────────────
async function uploadSceneVideo(sceneId) {
  const fileInput = document.getElementById(`videoUpload_${sceneId}`);
  const statusEl = document.getElementById(`videoUploadStatus_${sceneId}`);
  if (!fileInput || !fileInput.files[0]) {
    alert("Video dosyası seçin!");
    return;
  }

  const file = fileInput.files[0];
  statusEl.textContent = `⏳ Yükleniyor... (${(
    file.size /
    (1024 * 1024)
  ).toFixed(1)} MB)`;
  statusEl.style.color = "#ff9800";

  const formData = new FormData();
  formData.append("video", file);

  try {
    const res = await fetch(`/api/scenes/${sceneId}/upload-video`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (data.success) {
      statusEl.textContent = `✅ Yüklendi! ${data.videoUrl}`;
      statusEl.style.color = "#4caf50";
      fileInput.value = "";
      // Projeyi yenile
      setTimeout(() => viewProject(currentProjectId), 500);
    } else {
      statusEl.textContent = `❌ Hata: ${data.error}`;
      statusEl.style.color = "#f44336";
    }
  } catch (e) {
    statusEl.textContent = `❌ Bağlantı hatası: ${e.message}`;
    statusEl.style.color = "#f44336";
  }
}

// ─── Image Upload ──────────────────────────────
async function uploadSceneImage(sceneId) {
  const fileInput = document.getElementById(`imageUpload_${sceneId}`);
  const statusEl = document.getElementById(`imageUploadStatus_${sceneId}`);
  if (!fileInput || !fileInput.files[0]) {
    alert("Resim dosyası seçin!");
    return;
  }
  const file = fileInput.files[0];
  statusEl.textContent = `⏳ Yükleniyor... (${(file.size / 1024).toFixed(
    0
  )} KB)`;
  statusEl.style.color = "#4caf50";
  const formData = new FormData();
  formData.append("image", file);
  try {
    const res = await fetch(`/api/scenes/${sceneId}/upload-image`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (data.success) {
      statusEl.textContent = `✅ Yüklendi! ${data.imageUrl}`;
      statusEl.style.color = "#4caf50";
      fileInput.value = "";
      setTimeout(() => viewProject(currentProjectId), 500);
    } else {
      statusEl.textContent = `❌ Hata: ${data.error}`;
      statusEl.style.color = "#f44336";
    }
  } catch (e) {
    statusEl.textContent = `❌ Bağlantı hatası: ${e.message}`;
    statusEl.style.color = "#f44336";
  }
}

// ─── Download All Images ──────────────────────────────
async function downloadAllImages() {
  if (!cachedProjectData || !cachedProjectData.scenes) return;

  const scenes = cachedProjectData.scenes.filter((s) => s.imageUrl);
  if (scenes.length === 0) {
    alert("İndirilecek resim yok!");
    return;
  }

  const btn = document.getElementById("downloadImagesBtn");
  const origText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = "⏳ İndiriliyor...";

  try {
    const zip = new JSZip();
    let done = 0;

    for (const s of scenes) {
      try {
        const num = String(s.sceneNumber).padStart(3, "0");
        const ext = s.imageUrl.match(/\.(png|jpg|jpeg|webp)$/i)?.[1] || "jpg";
        const fileName = `${num}.${ext}`;

        const response = await fetch(s.imageUrl);
        const blob = await response.blob();
        zip.file(fileName, blob);
        done++;
        btn.innerHTML = `⏳ ${done}/${scenes.length}`;
      } catch (e) {
        console.error(`Sahne ${s.sceneNumber} indirilemedi:`, e);
      }
    }

    const projectName = (cachedProjectData.title || "proje").replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    );
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${projectName}_resimler.zip`);

    btn.innerHTML = `✅ ${done} resim indirildi!`;
    setTimeout(() => {
      btn.innerHTML = origText;
      btn.disabled = false;
    }, 3000);
  } catch (e) {
    alert("İndirme hatası: " + e.message);
    btn.innerHTML = origText;
    btn.disabled = false;
  }
}

// ─── Dialog Toggle ──────────────────────────────
async function toggleDialog(sceneId, isDialog) {
  try {
    await fetch(`/api/scenes/${sceneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDialog }),
    });
    // Satırın rengini hemen güncelle
    const row = document.querySelector(
      `tr[onclick*="toggleSceneLog(${sceneId})"]`
    );
    if (row) {
      if (isDialog) {
        row.classList.add("scene-row-dialog");
      } else {
        row.classList.remove("scene-row-dialog");
      }
    }
    console.log(`Sahne ${sceneId} → ${isDialog ? "💬 Dialog" : "🎙️ Anlatım"}`);
  } catch (e) {
    console.error("Dialog toggle hatası:", e);
  }
}

// ─── Default Stil ─────────────────────────────
function applyStylePreset(value) {
  if (value) {
    document.getElementById("defaultStyleInput").value = value;
  }
}

async function saveDefaultStyle() {
  if (!currentProjectId) return;
  const style = document.getElementById("defaultStyleInput").value.trim();
  try {
    await fetch(`/api/projects/${currentProjectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultStyle: style || null }),
    });
    alert("✅ Stil kaydedildi!");
  } catch (e) {
    alert("Hata: " + e.message);
  }
}

// ─── Karakter Yönetimi ──────────────────────────
function toggleCharacterForm() {
  const form = document.getElementById("characterForm");
  form.classList.toggle("hidden");
  if (!form.classList.contains("hidden")) {
    populateCharacterDropdown();
  }
}

function populateCharacterDropdown() {
  const select = document.getElementById("charName");
  if (!cachedProjectData) return;

  // Sahnelerdeki tüm karakter isimlerini topla
  const allNames = new Set();
  (cachedProjectData.scenes || []).forEach((s) => {
    if (s.characters) {
      try {
        const chars = JSON.parse(s.characters);
        chars.forEach((n) => allNames.add(n));
      } catch (e) {}
    }
  });

  // Zaten resmi yüklenmiş olanları çıkar
  const uploadedNames = new Set(
    (cachedProjectData.characters || []).map((c) => c.name)
  );
  const available = [...allNames].filter((n) => !uploadedNames.has(n));

  if (available.length > 0) {
    select.innerHTML = available
      .map((n) => `<option value="${n}">${n}</option>`)
      .join("");
  } else if (allNames.size === 0) {
    select.innerHTML = '<option value="">Sahnelerde karakter yok</option>';
  } else {
    select.innerHTML =
      '<option value="">Tüm karakterler eşleştirildi ✅</option>';
  }
}

async function loadCharacters() {
  const grid = document.getElementById("characterGrid");
  try {
    const res = await fetch(`/api/characters?projectId=${currentProjectId}`);
    const data = await res.json();
    if (!data.success || data.characters.length === 0) {
      grid.innerHTML =
        '<p style="color: #606080; font-size: 0.85rem;">Henüz karakter eklenmemiş</p>';
      return;
    }
    grid.innerHTML = data.characters
      .map(
        (c) => `
            <div style="background: rgba(255,255,255,0.05); border-radius: 10px; padding: 8px; text-align: center; position: relative; width: 100px;">
              <img src="${c.imageUrl}" style="width: 80px; height: 80px; border-radius: 8px; object-fit: cover; cursor: pointer;" onclick="openModal('${c.imageUrl}')">
              <div style="font-size: 0.75rem; margin-top: 4px; color: #c0c0e0; font-weight: 500;">${c.name}</div>
              <button onclick="deleteCharacter(${c.id})" style="position: absolute; top: 2px; right: 2px; background: rgba(244,67,54,0.8); border: none; color: #fff; width: 18px; height: 18px; border-radius: 50%; font-size: 0.6rem; cursor: pointer; line-height: 18px;">✕</button>
            </div>
          `
      )
      .join("");
  } catch (e) {
    grid.innerHTML =
      '<p style="color: #e57373; font-size: 0.85rem;">Yüklenemedi</p>';
  }
}

async function uploadCharacter() {
  const select = document.getElementById("charName");
  const name = select.value;
  const fileInput = document.getElementById("charImage");
  if (!name) return alert("Karakter seçin");
  if (!fileInput.files[0]) return alert("Resim seçin");

  const formData = new FormData();
  formData.append("name", name);
  formData.append("image", fileInput.files[0]);
  formData.append("projectId", currentProjectId);

  try {
    const res = await fetch("/api/characters", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (data.success) {
      fileInput.value = "";
      document.getElementById("characterForm").classList.add("hidden");
      loadCharacters();
      viewProject(currentProjectId);
    } else {
      alert("Hata: " + data.error);
    }
  } catch (e) {
    alert("Yükleme hatası: " + e.message);
  }
}

async function deleteCharacter(id) {
  if (!confirm("Bu karakteri silmek istiyor musunuz?")) return;
  try {
    await fetch(`/api/characters/${id}`, { method: "DELETE" });
    loadCharacters();
  } catch (e) {
    alert("Silme hatası: " + e.message);
  }
}

// Gemini modellerini API'den çek
// ─── Üretimi İptal Et ──────────────────────────
async function cancelGeneration() {
  if (!currentProjectId) return;
  if (!confirm("Üretimi durdurmak istiyor musunuz?")) return;

  try {
    await fetch(`/api/gemini/cancel/${currentProjectId}`, { method: "POST" });
    document.getElementById("progressText").textContent =
      "⛔ Üretim iptal edildi!";
    document.getElementById("cancelGenBtn").classList.add("hidden");
    const btn = document.getElementById("geminiGenBtn");
    btn.disabled = false;
    btn.innerHTML = "🖼️ Resimleri Üret (Gemini API)";
    // Sayfayı yenile
    setTimeout(() => viewProject(currentProjectId), 2000);
  } catch (e) {
    alert("İptal hatası: " + e.message);
  }
}

async function loadGeminiModels() {
  const select = document.getElementById("geminiModelSelect");
  try {
    const response = await fetch("/api/gemini/models");
    const result = await response.json();
    if (result.success && result.models.length > 0) {
      const defaultModel = "nano-banana-pro-preview";
      select.innerHTML = result.models
        .map(
          (m) =>
            `<option value="${m.id}" ${
              m.id === defaultModel ? "selected" : ""
            }>${m.name}</option>`
        )
        .join("");
    } else {
      select.innerHTML = '<option value="">Model bulunamadı</option>';
    }
  } catch (e) {
    select.innerHTML = '<option value="">Model yüklenemedi</option>';
  }
}

// Gemini API ile resim üret
async function generateImagesWithGemini() {
  if (!currentProjectId) return;
  const btn = document.getElementById("geminiGenBtn");
  const model = document.getElementById("geminiModelSelect").value;
  const progress = document.getElementById("generateProgress");

  if (
    !confirm(
      `Gemini API ile tüm resimleri üretmek istiyor musunuz?\nModel: ${model}`
    )
  )
    return;

  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div><span>Üretiliyor...</span>';
  document.getElementById("cancelGenBtn").classList.remove("hidden");
  progress.classList.remove("hidden");
  document.getElementById("progressText").textContent =
    "Gemini API ile resimler üretiliyor...";

  try {
    const response = await fetch("/api/gemini/generate-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: currentProjectId, model }),
    });
    const result = await response.json();

    if (result.success) {
      document.getElementById("progressText").textContent =
        "✅ Resim üretimi başlatıldı! Sayfayı yenileyin...";
      // Durumu takip et
      let checkCount = 0;
      const checker = setInterval(async () => {
        checkCount++;
        try {
          const r = await fetch(`/api/projects/${currentProjectId}`);
          const data = await r.json();
          if (data.success) {
            const p = data.project;
            const done = p.scenes.filter((s) => s.imageUrl).length;
            const total = p.scenes.length;
            const processing = p.scenes.filter(
              (s) => s.status === "image_processing"
            ).length;
            document.getElementById(
              "progressText"
            ).textContent = `🖼️ ${done}/${total} resim tamamlandı${
              processing > 0 ? `, ${processing} işleniyor...` : ""
            }`;

            // Tabloyu güncelle
            viewProject(currentProjectId);

            if (
              done >= total ||
              p.status === "generation_done" ||
              p.status === "generation_failed"
            ) {
              clearInterval(checker);
              document.getElementById(
                "progressText"
              ).textContent = `✅ Tamamlandı! ${done}/${total} resim üretildi.`;
              btn.disabled = false;
              btn.innerHTML = "🖼️ Resimleri Üret (Gemini API)";
              setTimeout(() => progress.classList.add("hidden"), 5000);
            }
          }
        } catch (e) {}
        if (checkCount > 120) {
          // 10dk max
          clearInterval(checker);
          btn.disabled = false;
          btn.innerHTML = "🖼️ Resimleri Üret (Gemini API)";
        }
      }, 5000);
    } else {
      document.getElementById(
        "progressText"
      ).textContent = `❌ Hata: ${result.error}`;
      btn.disabled = false;
      btn.innerHTML = "🖼️ Resimleri Üret (Gemini API)";
    }
  } catch (error) {
    document.getElementById(
      "progressText"
    ).textContent = `❌ Hata: ${error.message}`;
    btn.disabled = false;
    btn.innerHTML = "🖼️ Resimleri Üret (Gemini API)";
    progress.classList.add("hidden");
  }
}

// Keyboard: ESC kapatır, ← → galeri gezin
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeModal();
    closeVideoModal();
  }
  if (document.getElementById("imageModal").classList.contains("active")) {
    if (e.key === "ArrowLeft") galleryPrev();
    if (e.key === "ArrowRight") galleryNext();
  }
});
