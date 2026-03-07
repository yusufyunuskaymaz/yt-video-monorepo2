let activeVoicePicker = null;
      function showVoicePicker(sceneId) {
        // Önceki picker'ı kapat
        if (activeVoicePicker && activeVoicePicker !== sceneId) {
          const prev = document.getElementById(`voicePicker_${activeVoicePicker}`);
          if (prev) prev.style.display = 'none';
        }
        const picker = document.getElementById(`voicePicker_${sceneId}`);
        if (!picker) return;
        if (picker.style.display === 'none') {
          picker.style.display = 'block';
          activeVoicePicker = sceneId;
        } else {
          picker.style.display = 'none';
          activeVoicePicker = null;
        }
      }

      function pickVoice(sceneId, voiceId) {
        const picker = document.getElementById(`voicePicker_${sceneId}`);
        if (picker) picker.style.display = 'none';
        activeVoicePicker = null;
        generateSceneAudio(sceneId, voiceId);
      }

      // Sayfaya tıklayınca picker'ı kapat
      document.addEventListener('click', () => {
        if (activeVoicePicker) {
          const picker = document.getElementById(`voicePicker_${activeVoicePicker}`);
          if (picker) picker.style.display = 'none';
          activeVoicePicker = null;
        }
      });

      // Single scene ElevenLabs TTS
      async function generateSceneAudio(sceneId, voiceId) {
        const btn = document.getElementById(`ttsBtn_${sceneId}`);
        if (!btn) return;

        if (!voiceId) voiceId = document.getElementById('languageSelect').value;
        const origHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner" style="width:12px;height:12px;border-width:2px;display:inline-block;"></div>';

        try {
          const response = await fetch(`/api/scenes/${sceneId}/generate-elevenlabs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ voiceId }),
          });
          const result = await response.json();

          if (result.success) {
            console.log(`✅ Sahne ${result.sceneNumber} ses üretildi:`, result.audioUrl);
            // Sesi hemen çal
            playAudio(result.audioUrl);
            // Sayfayı yenile (yeni play butonu görünsün)
            setTimeout(() => refreshProject(), 1500);
          } else {
            alert(`❌ Ses üretim hatası: ${result.error}`);
            btn.disabled = false;
            btn.innerHTML = origHTML;
          }
        } catch (error) {
          alert(`❌ Hata: ${error.message}`);
          btn.disabled = false;
          btn.innerHTML = origHTML;
        }
      }

      // ElevenLabs seslerini API'den yükle
      async function loadElevenLabsVoices() {
        const select = document.getElementById('languageSelect');
        try {
          select.innerHTML = '<option value="">Yükleniyor...</option>';
          const res = await fetch('/api/scenes/elevenlabs-voices');
          const data = await res.json();
          if (data.success && data.voices.length > 0) {
            // Bilinen sesler üstte, diğerleri altta
            const knownIds = ['LCHGt3rsPMP50Vs28amI', 'QMJTqaMXmGnG8TCm8WQG'];
            const known = data.voices.filter(v => knownIds.includes(v.voice_id));
            const others = data.voices.filter(v => !knownIds.includes(v.voice_id));

            let html = '';
            if (known.length > 0) {
              html += '<optgroup label="⭐ Favoriler">';
              known.forEach(v => {
                html += `<option value="${v.voice_id}">🎙️ ${v.name} (${v.voice_id.substring(0, 5)})</option>`;
              });
              html += '</optgroup>';
            }
            if (others.length > 0) {
              html += '<optgroup label="📋 Tüm Sesler">';
              others.forEach(v => {
                html += `<option value="${v.voice_id}">🎤 ${v.name}</option>`;
              });
              html += '</optgroup>';
            }
            select.innerHTML = html;
          } else {
            select.innerHTML = `
              <option value="LCHGt3rsPMP50Vs28amI">🎙️ Ses 1 (LCHGt)</option>
              <option value="QMJTqaMXmGnG8TCm8WQG">🎙️ Ses 2 (QMJTq)</option>
            `;
          }
        } catch (e) {
          console.error('Sesler yüklenemedi:', e);
          select.innerHTML = `
            <option value="LCHGt3rsPMP50Vs28amI">🎙️ Ses 1 (LCHGt)</option>
            <option value="QMJTqaMXmGnG8TCm8WQG">🎙️ Ses 2 (QMJTq)</option>
          `;
        }
      }

      // Generate all audio (ElevenLabs + Dublaj)
      async function generateAllAudio() {
        if (!currentProjectId) return;

        const btn = document.getElementById("generateAudioBtn");
        const progress = document.getElementById("generateProgress");

        btn.disabled = true;
        btn.innerHTML =
          '<div class="spinner"></div><span>Ses + Dublaj Üretiliyor...</span>';
        progress.classList.remove("hidden");
        document.getElementById("progressText").textContent =
          "🎙️ ElevenLabs ses + dublaj üretimi başlatıldı. Arka planda çalışıyor, sayfa otomatik yenilenecek...";

        try {
          const response = await fetch(
            `/api/scenes/generate-all-audio/${currentProjectId}`,
            { method: "POST" }
          );
          const result = await response.json();

          if (result.success) {
            document.getElementById("progressText").textContent =
              `✅ ${result.totalScenes} sahne için üretim başlatıldı. Arka planda devam ediyor...`;
            // Her 15 saniyede sayfayı yenile
            const refreshInterval = setInterval(() => {
              refreshProject();
            }, 15000);
            // 20 dakika sonra dur
            setTimeout(() => clearInterval(refreshInterval), 20 * 60 * 1000);
          } else {
            document.getElementById("progressText").textContent =
              `❌ Hata: ${result.error}`;
          }
        } catch (error) {
          document.getElementById("progressText").textContent =
            `❌ Hata: ${error.message}`;
        } finally {
          btn.disabled = false;
          btn.innerHTML = "🎙️ Tüm Sesleri Oluştur";
          setTimeout(() => progress.classList.add("hidden"), 5000);
        }
      }

      // Generate all videos (sessiz)
      async function generateAllVideos() {
        if (!currentProjectId) return;

        const btn = document.getElementById("generateVideoBtn");

        btn.disabled = true;
        btn.innerHTML =
          '<div class="spinner"></div><span>Videolar Üretiliyor (Veo)...</span>';

        try {
          const response = await fetch(
            `/api/projects/${currentProjectId}/generate-videos`,
            { method: "POST" }
          );
          const result = await response.json();

          if (result.success) {
            alert("✅ Video üretimi başlatıldı! Arka planda devam ediyor. Yenile butonuyla takip edin.");
          } else {
            alert(`❌ Hata: ${result.error}`);
          }
        } catch (error) {
          alert(`❌ Hata: ${error.message}`);
        } finally {
          btn.disabled = false;
          btn.innerHTML = "🎬 Videoları Üret (Veo)";
        }
      }

      // Tekil sahne video üretimi
      let videoAutoRefresh = null;
      async function generateSingleVideo(sceneId) {
        const btn = document.getElementById(`veoBtn_${sceneId}`);
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = '<div class="spinner" style="width:12px;height:12px;border-width:2px;display:inline-block;"></div>';
        }

        try {
          const response = await fetch(`/api/scenes/${sceneId}/generate-video`, {
            method: 'POST'
          });
          const result = await response.json();

          if (result.success) {
            // Hemen sayfayı yenile (status video_generating olacak)
            setTimeout(() => refreshProject(), 1500);

            // Auto-refresh başlat (10 saniyede bir kontrol et)
            if (!videoAutoRefresh) {
              videoAutoRefresh = setInterval(async () => {
                await refreshProject();
                // Video üretimi bittiyse dur
                const res = await fetch(`/api/projects/${currentProjectId}`);
                const data = await res.json();
                const generating = data.project.scenes.some(s => s.status === 'video_generating');
                if (!generating) {
                  clearInterval(videoAutoRefresh);
                  videoAutoRefresh = null;
                }
              }, 10000);
            }
          } else {
            if (btn) btn.innerHTML = '❌';
            alert(`❌ ${result.error}`);
          }
        } catch (error) {
          if (btn) btn.innerHTML = '❌';
          alert(`❌ ${error.message}`);
        }
      }

      // Tüm sahne videolarını birleştir (FFmpeg)