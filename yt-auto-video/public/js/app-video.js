async function mergeVideos() {
        const mergeBtn = document.getElementById('mergeBtn');
        if (!confirm('Tüm sahne videoları birleştirilsin mi?')) return;

        mergeBtn.disabled = true;
        mergeBtn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;"></div> Birleştiriliyor...';

        try {
          const response = await fetch(`/api/projects/${currentProjectId}/concat-videos`, {
            method: 'POST'
          });
          const result = await response.json();

          if (result.success) {
            mergeBtn.innerHTML = '✅ Başlatıldı';
            alert('✅ Birleştirme arka planda başladı. Console loglarını takip edin.');
          } else {
            mergeBtn.innerHTML = '🔗 Birleştir';
            alert(`❌ ${result.error}`);
          }
        } catch (error) {
          alert(`❌ ${error.message}`);
        } finally {
          mergeBtn.disabled = false;
          setTimeout(() => { mergeBtn.innerHTML = '🔗 Birleştir'; }, 5000);
        }
      }

      // Dublajlı videoları birleştir
      async function mergeDubbedVideos() {
        const btn = document.getElementById('mergeDubbedBtn');
        if (!confirm('Dublajlı videolar birleştirilsin mi?')) return;

        btn.disabled = true;
        btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;"></div> Birleştiriliyor...';

        try {
          const response = await fetch(`/api/projects/${currentProjectId}/merge-dubbed`, {
            method: 'POST'
          });
          const result = await response.json();

          if (result.success) {
            btn.innerHTML = '✅ Başlatıldı';
            alert('✅ Dublajlı birleştirme arka planda başladı. Terminal loglarını takip edin.');
          } else {
            alert(`❌ ${result.error}`);
          }
        } catch (error) {
          alert(`❌ ${error.message}`);
        } finally {
          btn.disabled = false;
          setTimeout(() => { btn.innerHTML = '🎬 Dublajlı Birleştir'; }, 5000);
        }
      }

      // Merge all videos (video + ses)
      async function mergeAllVideos() {
        if (!currentProjectId) return;

        const btn = document.getElementById("mergeBtn");
        const progress = document.getElementById("generateProgress");

        btn.disabled = true;
        btn.innerHTML =
          '<div class="spinner"></div><span>Birleştiriliyor...</span>';
        progress.classList.remove("hidden");
        document.getElementById("progressText").textContent =
          "Video + Ses birleştiriliyor, lütfen bekleyin...";

        try {
          const response = await fetch(
            `/api/projects/${currentProjectId}/merge-videos`,
            { method: "POST" }
          );
          const result = await response.json();

          if (result.success) {
            document.getElementById(
              "progressText"
            ).textContent = `✅ Tamamlandı! ${result.processed} video birleştirildi.`;
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
          btn.innerHTML = "🔗 Birleştir";
          setTimeout(() => progress.classList.add("hidden"), 3000);
        }
      }

      // Concatenate Final Video (sadece mevcut mergedVideoUrl'leri birleştir)
      async function concatenateFinal() {
        if (!currentProjectId) return;

        const btn = document.getElementById("concatBtn");
        const progress = document.getElementById("generateProgress");

        btn.disabled = true;
        btn.innerHTML =
          '<div class="spinner"></div><span>Birleştiriliyor...</span>';
        progress.classList.remove("hidden");
        document.getElementById("progressText").textContent =
          "Final video oluşturuluyor, lütfen bekleyin...";

        try {
          const response = await fetch(
            `/api/projects/${currentProjectId}/concatenate-final`,
            { method: "POST" }
          );
          const result = await response.json();

          if (result.success) {
            document.getElementById(
              "progressText"
            ).textContent = `✅ Final video oluşturuldu!`;
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
          btn.innerHTML = "📦 Tümünü Birleştir";
          setTimeout(() => progress.classList.add("hidden"), 3000);
        }
      }

      // Run full pipeline
      async function runFullPipeline() {
        if (!currentProjectId) return;

        const btn = document.getElementById("pipelineBtn");
        const progress = document.getElementById("generateProgress");

        btn.disabled = true;
        btn.innerHTML = '<div class="spinner"></div><span>Çalışıyor...</span>';
        progress.classList.remove("hidden");
        document.getElementById("progressText").textContent =
          "🚀 Tam akış başlatıldı... Resim → Ses → Video → Birleştirme";

        try {
          const response = await fetch(
            `/api/projects/${currentProjectId}/generate-pipeline`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                voice: document.getElementById("languageSelect").value,
                temperature: 0.8,
              }),
            }
          );
          const result = await response.json();

          if (result.success) {
            const r = result.results;
            document.getElementById(
              "progressText"
            ).textContent = `✅ Tamamlandı! Görseller: ${r.images.processed}, Sesler: ${r.audio.processed}, Videolar: ${r.videos.processed}, Birleştirme: ${r.merge.processed}`;
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
          btn.innerHTML = "🚀 Tam Akış Başlat";
          setTimeout(() => progress.classList.add("hidden"), 5000);
        }
      }