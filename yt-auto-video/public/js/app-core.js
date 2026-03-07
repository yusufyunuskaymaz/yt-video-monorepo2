// Tab switching
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document
      .querySelectorAll(".tab")
      .forEach((t) => t.classList.remove("active"));
    document
      .querySelectorAll(".tab-content")
      .forEach((c) => c.classList.add("hidden"));
    tab.classList.add("active");
    document
      .getElementById(`tab-${tab.dataset.tab}`)
      .classList.remove("hidden");
    if (tab.dataset.tab === "projects") loadProjects();
  });
});

// Create project
async function createProject() {
  const jsonInput = document.getElementById("jsonInput").value.trim();
  const btn = document.getElementById("createBtn");
  const msgEl = document.getElementById("createMessage");
  if (!jsonInput) {
    showMessage(msgEl, "error", "JSON verisi gerekli!");
    return;
  }
  let data;
  try {
    data = JSON.parse(jsonInput);
  } catch (e) {
    showMessage(msgEl, "error", "Geçersiz JSON: " + e.message);
    return;
  }
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div><span>Oluşturuluyor...</span>';
  msgEl.className = "message";
  try {
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (result.success) {
      showMessage(
        msgEl,
        "success",
        `✅ Proje oluşturuldu! ${result.project.scenes.length} sahne kaydedildi.`
      );
      document.getElementById("jsonInput").value = "";
    } else {
      showMessage(msgEl, "error", result.error);
    }
  } catch (error) {
    showMessage(msgEl, "error", "Sunucu hatası: " + error.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = "🚀 Proje Oluştur";
  }
}

// Load projects
async function loadProjects() {
  const listEl = document.getElementById("projectsList");
  listEl.innerHTML =
    '<p style="color: #808090; text-align: center; padding: 30px">Yükleniyor...</p>';
  try {
    const response = await fetch("/api/projects");
    const result = await response.json();
    if (result.projects.length === 0) {
      listEl.innerHTML =
        '<p style="color: #808090; text-align: center; padding: 30px">Henüz proje yok</p>';
      return;
    }
    listEl.innerHTML = result.projects
      .map(
        (p) => `
            <div class="project-item">
              <div class="project-info">
                <h3><span style="color:#7c4dff;font-size:0.8em;">#${
                  p.id
                }</span> ${p.title}</h3>
                <div class="project-meta">${p._count.scenes} sahne • ${
          p.totalDuration
        }s • ${new Date(p.createdAt).toLocaleString("tr-TR")}</div>
              </div>
              <div style="display: flex; gap: 8px; align-items: center">
                <span class="status-badge status-${p.status}">${p.status}</span>
                <button class="btn btn-secondary btn-sm" onclick="viewProject('${
                  p.id
                }')">👁️ Detay</button>
              </div>
            </div>
          `
      )
      .join("");
  } catch (error) {
    listEl.innerHTML = `<p style="color: #e57373; text-align: center; padding: 30px">Hata: ${error.message}</p>`;
  }
}

// View project details
async function viewProject(id) {
  currentProjectId = id;
  document.getElementById("mainTabs").classList.add("hidden");
  document
    .querySelectorAll(".tab-content")
    .forEach((c) => c.classList.add("hidden"));
  document.getElementById("tab-detail").classList.remove("hidden");
  document.getElementById("detailTitle").textContent = "Yükleniyor...";
  document.getElementById("detailStats").innerHTML = "";
  document.getElementById("scenesBody").innerHTML =
    '<tr><td colspan="6" style="text-align:center;padding:30px;color:#808090">Yükleniyor...</td></tr>';

  // Gemini modellerini yükle
  loadGeminiModels();
  // Karakterleri yükle
  loadCharacters();

  try {
    const response = await fetch(`/api/projects/${id}`);
    const result = await response.json();
    if (result.success) {
      const p = result.project;
      document.getElementById(
        "detailTitle"
      ).textContent = `📽️ #${p.id} ${p.title}`;

      // Proje verisini cache'le (dropdown vb. için)
      cachedProjectData = p;

      // Default stil yükle
      document.getElementById("defaultStyleInput").value = p.defaultStyle || "";

      // Üretim devam ediyorsa iptal butonunu göster
      const isGenerating =
        p.status === "generating_images" ||
        p.scenes.some((s) => s.status === "image_processing");
      const cancelBtn = document.getElementById("cancelGenBtn");
      const genBtn = document.getElementById("geminiGenBtn");
      if (isGenerating) {
        cancelBtn.classList.remove("hidden");
        genBtn.disabled = true;
        genBtn.innerHTML =
          '<div class="spinner"></div><span>Üretiliyor...</span>';
      } else {
        cancelBtn.classList.add("hidden");
        genBtn.disabled = false;
        genBtn.innerHTML = "🖼️ Resimleri Üret (Gemini API)";
      }

      // Stats
      const pending = p.scenes.filter((s) => s.status === "pending").length;
      const completed = p.scenes.filter(
        (s) => s.status === "completed" || s.status === "image_done"
      ).length;
      const dialogCount = p.scenes.filter((s) => s.isDialog).length;
      document.getElementById("detailStats").innerHTML = `
              <div class="stat-box"><div class="stat-value">${
                p.scenes.length
              }</div><div class="stat-label">Toplam Sahne</div></div>
              <div class="stat-box"><div class="stat-value">${
                p.totalDuration
              }s</div><div class="stat-label">Süre</div></div>
              <div class="stat-box"><div class="stat-value" style="color:#00bcd4">${dialogCount}</div><div class="stat-label">💬 Dialog</div></div>
              <div class="stat-box"><div class="stat-value">${
                p.scenes.length - dialogCount
              }</div><div class="stat-label">🎙️ Anlatım</div></div>
              <div class="stat-box"><div class="stat-value">${pending}</div><div class="stat-label">Bekleyen</div></div>
              <div class="stat-box"><div class="stat-value">${completed}</div><div class="stat-label">Tamamlanan</div></div>
              <div class="stat-box"><div class="stat-value" style="color:${
                p.status === "completed" ? "#4caf50" : "#ffc107"
              }">${p.status}</div><div class="stat-label">Durum</div></div>
            `;

      // Scenes table
      // Proje karakterleri (project response'unda zaten var)
      // Global karakterleri getir
      let globalChars = [];
      try {
        const charRes = await fetch("/api/characters");
        const charData = await charRes.json();
        if (charData.success) globalChars = charData.characters || [];
      } catch (e) {}
      const projectChars = globalChars;

      window._currentScenes = p.scenes;
      document.getElementById("scenesBody").innerHTML = p.scenes
        .map((s) => {
          const sceneChars = s.characters ? JSON.parse(s.characters) : [];
          const charCheckboxes =
            projectChars.length > 0
              ? projectChars
                  .map(
                    (c) => `
                        <label style="display:flex;align-items:center;gap:3px;cursor:pointer;font-size:0.75rem;color:#c0c0e0;white-space:nowrap;">
                          <input type="checkbox" 
                            ${sceneChars.includes(c.name) ? "checked" : ""} 
                            onchange="toggleSceneCharacter(${s.id}, '${
                      c.name
                    }', this.checked)"
                            style="width:14px;height:14px;accent-color:#667eea;">
                          ${c.name}
                        </label>
                      `
                  )
                  .join("")
              : '<span style="color:#606080;font-size:0.75rem;">-</span>';

          // Üretim logu
          let logHtml = "";
          if (s.generationLog) {
            try {
              const log = JSON.parse(s.generationLog);
              logHtml = `
                        <tr class="scene-log-row" id="log-${
                          s.id
                        }" style="display:none;">
                          <td colspan="10" style="padding:12px 16px;background:rgba(0,0,0,0.3);border-bottom:1px solid rgba(255,255,255,0.05);">
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:0.8rem;">
                              <div>
                                <div style="color:#667eea;font-weight:600;margin-bottom:4px;">📝 Prompt</div>
                                <div style="color:#c0c0e0;white-space:pre-wrap;background:rgba(0,0,0,0.3);padding:8px;border-radius:6px;max-height:120px;overflow-y:auto;font-size:0.75rem;">${
                                  log.prompt || "-"
                                }</div>
                              </div>
                              <div>
                                <div style="color:#667eea;font-weight:600;margin-bottom:4px;">📊 Detaylar</div>
                                <div style="display:flex;flex-direction:column;gap:4px;color:#c0c0e0;">
                                  <span>🤖 Model: <b style="color:#fff;">${
                                    log.model || "-"
                                  }</b></span>
                                  <span>⏱️ Süre: <b style="color:#fff;">${
                                    log.durationSec || "-"
                                  }s</b></span>
                                  <span>🔗 Referans: <b style="color:#fff;">${
                                    log.refCount || 0
                                  } adet</b></span>
                                  <span>🔄 Önceki sahne: <b style="color:${
                                    log.prevRefSent ? "#4caf50" : "#f44336"
                                  }">${log.prevRefReason || "-"}</b></span>
                                  <span>📅 ${
                                    log.completedAt
                                      ? new Date(
                                          log.completedAt
                                        ).toLocaleString("tr-TR")
                                      : "-"
                                  }</span>
                                  ${
                                    log.error
                                      ? `<span style="color:#f44336;">❌ Hata: ${log.error}</span>`
                                      : ""
                                  }
                                </div>
                              </div>
                            </div>
                            <div style="margin-top:10px;display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start;">
                              ${
                                (log.refImages || []).length > 0
                                  ? `
                                <div>
                                  <div style="color:#ff9800;font-weight:600;font-size:0.75rem;margin-bottom:4px;">📤 Gönderilen Referanslar</div>
                                  <div style="display:flex;gap:6px;flex-wrap:wrap;">
                                    ${(log.refImages || [])
                                      .map((r) =>
                                        r.url
                                          ? `
                                      <div style="text-align:center;">
                                        <img src="${r.url}" style="width:60px;height:60px;border-radius:6px;object-fit:cover;border:2px solid #ff9800;cursor:pointer;" onclick="event.stopPropagation();openModal('${r.url}')">
                                        <div style="font-size:0.6rem;color:#ff9800;margin-top:2px;">${r.name}</div>
                                      </div>
                                    `
                                          : `<span style="font-size:0.7rem;color:#808090;">${r.name}</span>`
                                      )
                                      .join("")}
                                  </div>
                                </div>
                              `
                                  : ""
                              }
                              ${
                                log.imageUrl
                                  ? `
                                <div>
                                  <div style="color:#4caf50;font-weight:600;font-size:0.75rem;margin-bottom:4px;">📥 Üretilen Resim</div>
                                  <img src="${log.imageUrl}" style="width:80px;height:80px;border-radius:6px;object-fit:cover;border:2px solid #4caf50;cursor:pointer;" onclick="event.stopPropagation();openModal('${log.imageUrl}')">
                                </div>
                              `
                                  : ""
                              }
                            </div>
                          </td>
                        </tr>`;
            } catch (e) {}
          }

          // Video prompt detay satırı (her zaman, log olsun olmasın)
          const vpSafe = (s.videoPrompt || "")
            .replace(/`/g, "\\`")
            .replace(/\$/g, "\\$");
          const videoPromptRow = s.videoPrompt
            ? `
                    <tr class="scene-log-row" id="vp-${s.id}" style="display:none;">
                      <td colspan="12" style="padding:10px 16px;background:rgba(156,39,176,0.08);border-bottom:1px solid rgba(156,39,176,0.2);">
                        <div style="font-size:0.8rem;">
                          <div style="color:#ce93d8;font-weight:600;margin-bottom:6px;">🎬 Video Prompt — Sahne ${s.sceneNumber}</div>
                          <div onclick="navigator.clipboard.writeText(this.innerText).then(()=>{this.style.borderColor='#4caf50';setTimeout(()=>this.style.borderColor='rgba(156,39,176,0.3)',1000)})" style="color:#e0e0e0;white-space:pre-wrap;background:rgba(0,0,0,0.4);padding:10px 12px;border-radius:6px;font-size:0.78rem;line-height:1.5;cursor:pointer;border:1px solid rgba(156,39,176,0.3);user-select:all;" title="Tıkla kopyala">${s.videoPrompt}</div>
                          <div style="font-size:0.65rem;color:#9e9ec0;margin-top:4px;">📋 Tıkla → kopyala</div>
                        </div>
                      </td>
                    </tr>`
            : "";

          // Ses & Video Player satırı
          const audioPlayerRow = `
                    <tr class="scene-log-row" id="player-${
                      s.id
                    }" style="display:none;">
                      <td colspan="13" style="padding:14px 16px;background:rgba(0,188,212,0.06);border-bottom:1px solid rgba(0,188,212,0.15);">
                        <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;">
                          ${
                            s.audioUrl
                              ? `
                          <div style="flex:1;min-width:280px;">
                            <div style="color:#00e5ff;font-weight:600;font-size:0.8rem;margin-bottom:8px;">🔊 Ses — Sahne ${
                              s.sceneNumber
                            }</div>
                            <audio controls preload="none" style="width:100%;height:40px;border-radius:8px;">
                              <source src="${s.audioUrl}" type="audio/mpeg">
                            </audio>
                            <div style="font-size:0.65rem;color:#808090;margin-top:4px;">${
                              s.audioUrl.length > 60
                                ? s.audioUrl.substring(0, 60) + "..."
                                : s.audioUrl
                            }</div>
                          </div>`
                              : ""
                          }
                          ${
                            s.dubbedVideoUrl
                              ? `
                          <div style="flex:1;min-width:320px;">
                            <div style="color:#ef5350;font-weight:600;font-size:0.8rem;margin-bottom:8px;">🎬 Dublajlı Video — Sahne ${s.sceneNumber}</div>
                            <video controls preload="none" style="width:100%;max-width:480px;border-radius:8px;border:1px solid rgba(244,67,54,0.3);">
                              <source src="${s.dubbedVideoUrl}" type="video/mp4">
                            </video>
                          </div>`
                              : ""
                          }
                          <!-- Video Yükle -->
                          <div style="flex:1;min-width:260px;">
                            <div style="color:#ff9800;font-weight:600;font-size:0.8rem;margin-bottom:8px;">📤 Video Yükle — Sahne ${
                              s.sceneNumber
                            }</div>
                            <div style="display:flex;gap:8px;align-items:center;">
                              <input type="file" accept="video/*" id="videoUpload_${
                                s.id
                              }" onclick="event.stopPropagation()" style="font-size:0.75rem;color:#a0a0c0;max-width:200px;">
                              <button onclick="event.stopPropagation();uploadSceneVideo(${
                                s.id
                              })" style="padding:6px 14px;background:linear-gradient(135deg,#ff9800,#f57c00);border:none;color:#fff;border-radius:6px;cursor:pointer;font-size:0.75rem;font-weight:600;">📤 Yükle</button>
                            </div>
                            <div id="videoUploadStatus_${
                              s.id
                            }" style="font-size:0.65rem;color:#808090;margin-top:4px;"></div>
                          </div>
                          <!-- Resim Yükle -->
                          <div style="flex:1;min-width:260px;">
                            <div style="color:#4caf50;font-weight:600;font-size:0.8rem;margin-bottom:8px;">🖼️ Resim Yükle — Sahne ${
                              s.sceneNumber
                            }</div>
                            <div style="display:flex;gap:8px;align-items:center;">
                              <input type="file" accept="image/*" id="imageUpload_${
                                s.id
                              }" onclick="event.stopPropagation()" style="font-size:0.75rem;color:#a0a0c0;max-width:200px;">
                              <button onclick="event.stopPropagation();uploadSceneImage(${
                                s.id
                              })" style="padding:6px 14px;background:linear-gradient(135deg,#4caf50,#388e3c);border:none;color:#fff;border-radius:6px;cursor:pointer;font-size:0.75rem;font-weight:600;">🖼️ Yükle</button>
                            </div>
                            <div id="imageUploadStatus_${
                              s.id
                            }" style="font-size:0.65rem;color:#808090;margin-top:4px;"></div>
                          </div>
                        </div>
                      </td>
                    </tr>`;

          return `
              <tr onclick="toggleSceneLog(${
                s.id
              })" style="cursor:pointer;" title="Detaylar için tıkla" class="${
            s.isDialog ? "scene-row-dialog" : ""
          }">
                <td class="scene-num">${s.sceneNumber}</td>
                <td>${s.timestamp}</td>
                <td class="scene-text" title="${s.narration}">${
            s.narration
          }</td>
                <td class="scene-text" title="${s.subject}">${s.subject}</td>
                <td style="text-align:center;">
                  <label class="dialog-toggle" onclick="event.stopPropagation()" title="${
                    s.isDialog ? "Dialog (konuşma)" : "Anlatım"
                  }">
                    <input type="checkbox" ${
                      s.isDialog ? "checked" : ""
                    } onchange="toggleDialog(${s.id}, this.checked)">
                    <span class="slider"></span>
                  </label>
                </td>
                <td style="min-width:120px;max-width:200px;">${
                  s.isDialog
                    ? `
                  <div contenteditable="true" onclick="event.stopPropagation()" onblur="saveSpeechText(${
                    s.id
                  }, this.innerText)" style="font-size:0.75rem;color:#00e5ff;background:rgba(0,188,212,0.08);border:1px solid rgba(0,188,212,0.2);border-radius:6px;padding:4px 8px;min-height:28px;max-height:60px;overflow-y:auto;cursor:text;outline:none;" title="Tıkla düzenle">${
                        s.speechText ||
                        '<span style="color:#606080;font-style:italic;">metin ekle...</span>'
                      }</div>
                `
                    : '<span style="color:#404060;">—</span>'
                }</td>
                <td style="min-width:90px;">${charCheckboxes}</td>
                <td>${
                  s.imageUrl
                    ? `<img src="${s.imageUrl}" class="scene-img" onclick="event.stopPropagation();openModal('${s.imageUrl}')">`
                    : '<span style="color:#606080">-</span>'
                }</td>
                <td class="scene-text" style="max-width:180px;font-size:0.72rem;color:#b0b0d0;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${(
                  s.videoPrompt || ""
                ).replace(/"/g, "&quot;")}">${
            s.videoPrompt
              ? s.videoPrompt.substring(0, 50) + "…"
              : '<span style="color:#606080">—</span>'
          }</td>
                <td class="scene-text" style="max-width:200px;font-size:0.72rem;white-space:normal;line-height:1.3;">${
                  s.isDialog && s.speechText
                    ? `<span style="color:#00e5ff;" title="Dialog: speechText">${s.speechText}</span>`
                    : `<span style="color:#909090;" title="Anlatım: narration">${s.narration}</span>`
                }</td>
                <td style="position:relative;">${
                  s.audioUrl
                    ? `<div style="display:flex;gap:4px;align-items:center;">
                        <button class="audio-play-btn" onclick="event.stopPropagation();playAudio('${s.audioUrl}')">🔊</button>
                        <button class="audio-play-btn" style="background:linear-gradient(135deg,#00bcd4,#0097a7);font-size:0.65rem;padding:4px 8px;" onclick="event.stopPropagation();showVoicePicker(${s.id})" id="ttsBtn_${s.id}" title="Yeniden Seslendir">🔄</button>
                      </div>`
                    : `<button class="audio-play-btn" style="background:linear-gradient(135deg,#00bcd4,#0097a7);font-size:0.7rem;" onclick="event.stopPropagation();showVoicePicker(${s.id})" id="ttsBtn_${s.id}">🎙️</button>`
                }
                <div id="voicePicker_${
                  s.id
                }" style="display:none;position:absolute;z-index:99;background:#1a1a2e;border:1px solid rgba(0,188,212,0.4);border-radius:8px;padding:6px;box-shadow:0 8px 24px rgba(0,0,0,0.5);min-width:160px;">
                  <div style="font-size:0.65rem;color:#808090;margin-bottom:4px;padding:2px 4px;">Ses Seç:</div>
                  <button onclick="event.stopPropagation();pickVoice(${
                    s.id
                  },'7VqWGAWwo2HMrylfKrcm')" style="display:block;width:100%;text-align:left;background:rgba(244,67,54,0.1);border:1px solid rgba(244,67,54,0.2);color:#ef9a9a;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:0.75rem;margin-bottom:3px;">👑 Padişah</button>
                  <button onclick="event.stopPropagation();pickVoice(${
                    s.id
                  },'0DihkedLJYKoWg7H1u4d')" style="display:block;width:100%;text-align:left;background:rgba(255,152,0,0.1);border:1px solid rgba(255,152,0,0.2);color:#ffb74d;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:0.75rem;margin-bottom:3px;">📿 Vezir</button>
                  <button onclick="event.stopPropagation();pickVoice(${
                    s.id
                  },'LCHGt3rsPMP50Vs28amI')" style="display:block;width:100%;text-align:left;background:rgba(0,188,212,0.1);border:1px solid rgba(0,188,212,0.2);color:#00e5ff;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:0.75rem;margin-bottom:3px;">🎙️ Anlatım</button>
                  <button onclick="event.stopPropagation();pickVoice(${
                    s.id
                  },'QMJTqaMXmGnG8TCm8WQG')" style="display:block;width:100%;text-align:left;background:rgba(156,39,176,0.1);border:1px solid rgba(156,39,176,0.2);color:#ce93d8;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:0.75rem;">🎤 Yedek</button>
                </div>
                </td>
                <td>${
                  s.videoUrl
                    ? `<button class="video-play-btn" onclick="event.stopPropagation();openVideoModal('${s.videoUrl}','video')">▶️ Video</button>`
                    : s.status === "video_generating"
                    ? `<div style="display:flex;align-items:center;gap:4px;"><div class="spinner" style="width:14px;height:14px;border-width:2px;"></div><span style="font-size:0.7rem;color:#ce93d8;">Üretiliyor...</span></div>`
                    : s.status === "video_failed"
                    ? `<button class="video-play-btn" style="background:linear-gradient(135deg,#f44336,#c62828);font-size:0.7rem;" onclick="event.stopPropagation();generateSingleVideo(${s.id})" id="veoBtn_${s.id}">🔄 Tekrar</button>`
                    : s.imageUrl && s.videoPrompt
                    ? `<button class="video-play-btn" style="background:linear-gradient(135deg,#9c27b0,#7b1fa2);font-size:0.7rem;" onclick="event.stopPropagation();generateSingleVideo(${s.id})" id="veoBtn_${s.id}">🎬 Üret</button>`
                    : '<span class="no-video">-</span>'
                }</td>
                <td>${
                  s.mergedVideoUrl
                    ? `<button class="video-play-btn" style="background: linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%);" onclick="event.stopPropagation();openVideoModal('${s.mergedVideoUrl}','merged')">▶️ Sesli</button>`
                    : '<span class="no-video">-</span>'
                }</td>
                <td>${
                  s.dubbedVideoUrl
                    ? `<button class="video-play-btn" style="background: linear-gradient(135deg, #f44336 0%, #c62828 100%);" onclick="event.stopPropagation();openVideoModal('${s.dubbedVideoUrl}','dubbed')">🎬 Dublaj</button>`
                    : '<span class="no-video">-</span>'
                }</td>
                <td>
                  <span class="status-badge status-${s.status}">${
            s.status
          }</span>
                  <button onclick="event.stopPropagation();toggleRegenPanel(${
                    s.id
                  })" style="margin-left:4px;background:linear-gradient(135deg,#ff9800,#f57c00);border:none;color:#fff;padding:2px 6px;border-radius:4px;font-size:0.65rem;cursor:pointer;" title="Tekrar Üret">🔄</button>
                </td>
              </tr>
              ${videoPromptRow}
              ${audioPlayerRow}
              <tr id="regen-${s.id}" style="display:none;" class="${
            s.isDialog ? "scene-row-dialog" : ""
          }">
                <td colspan="10" style="padding:12px 16px;background:rgba(255,152,0,0.08);border-bottom:1px solid rgba(255,152,0,0.2);">
                  <div style="font-size:0.8rem;color:#ff9800;font-weight:600;margin-bottom:8px;">🔄 Tekrar Üret — Sahne ${
                    s.sceneNumber
                  }</div>
                  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;font-size:0.8rem;">
                    <div>
                      <label style="color:#c0c0e0;font-size:0.75rem;">🎭 Karakter Referansları</label>
                      <div id="regen-chars-${
                        s.id
                      }" style="display:flex;flex-direction:column;gap:2px;margin-top:4px;">
                        ${
                          (projectChars || [])
                            .map(
                              (c) => `
                          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;color:#c0c0e0;font-size:0.75rem;">
                            <input type="checkbox" value="${c.name}" style="accent-color:#ff9800;"> ${c.name}
                          </label>
                        `
                            )
                            .join("") ||
                          '<span style="color:#606080;">Karakter yok</span>'
                        }
                      </div>
                    </div>
                    <div>
                      <label style="color:#c0c0e0;font-size:0.75rem;">📸 Referans Sahne</label>
                      <select id="regen-ref-${
                        s.id
                      }" style="width:100%;margin-top:4px;padding:6px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#fff;font-size:0.75rem;">
                        <option value="">Referans yok</option>
                        ${p.scenes
                          .filter((sc) => sc.imageUrl)
                          .map(
                            (sc) => `
                          <option value="${sc.id}">Sahne ${sc.sceneNumber}</option>
                        `
                          )
                          .join("")}
                      </select>
                      <label style="color:#c0c0e0;font-size:0.75rem;margin-top:6px;display:block;">📝 Prompt (opsiyonel)</label>
                      <textarea id="regen-prompt-${
                        s.id
                      }" style="width:100%;margin-top:4px;padding:6px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#fff;font-size:0.75rem;min-height:50px;resize:vertical;">${
            s.subject
          }</textarea>
                    </div>
                    <div style="display:flex;align-items:flex-end;">
                      <button onclick="event.stopPropagation();regenerateScene(${
                        s.id
                      })" style="padding:8px 16px;background:linear-gradient(135deg,#ff9800,#f57c00);border:none;color:#fff;border-radius:6px;cursor:pointer;font-size:0.8rem;font-weight:600;">▶️ Üret</button>
                    </div>
                  </div>
                </td>
              </tr>
              ${logHtml}
            `;
        })
        .join("");

      // Final Video butonu göster/gizle
      const finalVideoBtn = document.getElementById("finalVideoBtn");
      if (finalVideoBtn) {
        if (p.finalVideoUrl) {
          finalVideoBtn.style.display = "inline-flex";
          finalVideoBtn.dataset.url = p.finalVideoUrl;
        } else {
          finalVideoBtn.style.display = "none";
        }
      }

      // Üretim durumunu güncelle
      updateGenerationStatus(p.status);

      // Aktif üretim varsa auto-refresh başlat
      if (
        [
          "generation_requested",
          "generating_images",
          "generating_videos",
        ].includes(p.status)
      ) {
        startAutoRefresh();
      }
    }
  } catch (error) {
    document.getElementById("detailTitle").textContent = "Hata!";
    document.getElementById(
      "scenesBody"
    ).innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:#e57373">${error.message}</td></tr>`;
  }
}

function goBack() {
  document.getElementById("mainTabs").classList.remove("hidden");
  document.getElementById("tab-detail").classList.add("hidden");
  document.getElementById("tab-projects").classList.remove("hidden");
  document
    .querySelectorAll(".tab")
    .forEach((t) => t.classList.remove("active"));
  document.querySelector('[data-tab="projects"]').classList.add("active");
  loadProjects();
}

let currentProjectId = null;
let cachedProjectData = null;

// Check image status (v2: images come from vertex-veo3)
async function generateAllImages() {
  if (!currentProjectId) return;

  const btn = document.getElementById("generateAllBtn");
  const progress = document.getElementById("generateProgress");

  if (btn) {
    btn.disabled = true;
    btn.innerHTML =
      '<div class="spinner"></div><span>Kontrol ediliyor...</span>';
  }
  if (progress) progress.classList.remove("hidden");

  try {
    const response = await fetch(
      `/api/projects/${currentProjectId}/generate-all`,
      { method: "POST" }
    );
    const result = await response.json();

    if (result.success) {
      if (result.pending === 0) {
        document.getElementById(
          "progressText"
        ).textContent = `✅ Tüm sahnelerin resmi mevcut! (${result.total} sahne)`;
      } else {
        document.getElementById("progressText").innerHTML =
          `⚠️ ${result.pending}/${result.total} sahne resim bekliyor.<br>` +
          `<span style="font-size:0.8rem;">Mac'teki vertex-veo3 ile üretip API'ye bildirin.</span>`;
      }
      setTimeout(() => refreshProject(), 1000);
    } else {
      document.getElementById(
        "progressText"
      ).textContent = `❌ Hata: ${result.error}`;
    }
  } catch (error) {
    document.getElementById(
      "progressText"
    ).textContent = `❌ Hata: ${error.message}`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = "📋 Resim Durumu";
    setTimeout(() => progress.classList.add("hidden"), 5000);
  }
}

// Refresh current project
function refreshProject() {
  if (currentProjectId) viewProject(currentProjectId);
}

// Auto-polling interval
let autoRefreshInterval = null;

// Üretim durumunu gösteren status bar
function updateGenerationStatus(status) {
  const statusEl = document.getElementById("generationStatus");
  const genBtn = document.getElementById("requestGenBtn");

  const statusConfig = {
    generation_requested: {
      color: "#ffc107",
      icon: "⏳",
      text: "Üretim talebi gönderildi, vertex-veo3 bekliyor...",
      bg: "rgba(255,193,7,0.1)",
      border: "rgba(255,193,7,0.3)",
    },
    generating_images: {
      color: "#2196f3",
      icon: "🎨",
      text: "Resimler üretiliyor (Gemini)...",
      bg: "rgba(33,150,243,0.1)",
      border: "rgba(33,150,243,0.3)",
    },
    generating_videos: {
      color: "#9c27b0",
      icon: "🎬",
      text: "Videolar üretiliyor (Grok)...",
      bg: "rgba(156,39,176,0.1)",
      border: "rgba(156,39,176,0.3)",
    },
    generation_done: {
      color: "#4caf50",
      icon: "✅",
      text: "Resim ve video üretimi tamamlandı!",
      bg: "rgba(76,175,80,0.1)",
      border: "rgba(76,175,80,0.3)",
    },
    generation_failed: {
      color: "#f44336",
      icon: "❌",
      text: "Üretim başarısız oldu!",
      bg: "rgba(244,67,54,0.1)",
      border: "rgba(244,67,54,0.3)",
    },
  };

  const config = statusConfig[status];
  if (config) {
    statusEl.classList.remove("hidden");
    statusEl.style.background = config.bg;
    statusEl.style.borderColor = config.border;
    statusEl.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
              ${
                status.includes("generating")
                  ? '<div class="spinner"></div>'
                  : `<span style="font-size:1.3rem;">${config.icon}</span>`
              }
              <div>
                <div style="font-weight: 600; color: ${config.color};">${
      config.text
    }</div>
                <div style="font-size: 0.8rem; color: #a0a0c0;">Sayfa otomatik güncelleniyor...</div>
              </div>
            </div>`;

    // Tamamlandıysa auto-refresh durdur
    if (status === "generation_done" || status === "generation_failed") {
      stopAutoRefresh();
      setTimeout(() => statusEl.classList.add("hidden"), 10000);
    }
  } else {
    statusEl.classList.add("hidden");
  }
}

// Auto refresh başlat
function startAutoRefresh() {
  if (autoRefreshInterval) return;
  autoRefreshInterval = setInterval(() => {
    if (currentProjectId) viewProject(currentProjectId);
  }, 5000);
}

// Auto refresh durdur
function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}

// Resim & Video üretim talebi gönder
async function requestGeneration() {
  if (!currentProjectId) return;

  const btn = document.getElementById("requestGenBtn");
  if (!btn) return;
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div><span>Gönderiliyor...</span>';

  try {
    const response = await fetch(
      `/api/projects/${currentProjectId}/request-generation`,
      { method: "POST" }
    );
    const result = await response.json();

    if (result.success) {
      updateGenerationStatus("generation_requested");
      startAutoRefresh();
    } else {
      alert("Hata: " + result.error);
      btn.disabled = false;
      btn.innerHTML = "🎬 Resim & Video Oluştur";
    }
  } catch (error) {
    alert("Bağlantı hatası: " + error.message);
    btn.disabled = false;
    btn.innerHTML = "🎬 Resim & Video Oluştur";
  }
}

function formatJson() {
  const input = document.getElementById("jsonInput");
  try {
    input.value = JSON.stringify(JSON.parse(input.value), null, 2);
  } catch (e) {
    alert("Geçersiz JSON: " + e.message);
  }
}
function clearInput() {
  document.getElementById("jsonInput").value = "";
  document.getElementById("createMessage").className = "message";
}
function showMessage(el, type, text) {
  el.className = `message ${type}`;
  el.textContent = text;
}
