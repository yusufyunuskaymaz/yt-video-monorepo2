// ─── Gallery Modal ──────────────────────────────
      let galleryImages = [];
      let galleryIndex = 0;

      function openModal(imageUrl) {
        // Tüm sahne resimlerini topla
        galleryImages = [];
        const rows = document.querySelectorAll('#scenesBody tr');
        rows.forEach((row, i) => {
          const img = row.querySelector('.scene-img');
          if (img && img.src) {
            const sceneNum = row.querySelector('.scene-num')?.textContent || (i + 1);
            galleryImages.push({ url: img.src, sceneNumber: sceneNum });
          }
        });

        // Tıklanan resmin index'ini bul
        galleryIndex = galleryImages.findIndex(g => g.url === imageUrl);
        if (galleryIndex === -1) {
          // Karakter resmi gibi galeri dışı bir resim
          galleryImages = [{ url: imageUrl, sceneNumber: '' }];
          galleryIndex = 0;
        }

        showGalleryImage();
        document.getElementById("imageModal").classList.add("active");
        document.body.style.overflow = "hidden";
      }

      function showGalleryImage() {
        const current = galleryImages[galleryIndex];
        document.getElementById("modalImage").src = current.url;
        document.getElementById("galleryInfo").textContent = 
          current.sceneNumber ? `Sahne ${current.sceneNumber} — ${galleryIndex + 1}/${galleryImages.length}` : '';

        // Buton durumları
        document.getElementById("galleryPrevBtn").style.visibility = galleryIndex > 0 ? 'visible' : 'hidden';
        document.getElementById("galleryNextBtn").style.visibility = galleryIndex < galleryImages.length - 1 ? 'visible' : 'hidden';

        // Thumbnails
        const thumbsEl = document.getElementById("galleryThumbs");
        if (galleryImages.length > 1) {
          thumbsEl.innerHTML = galleryImages.map((g, i) => `
            <img src="${g.url}" 
              onclick="galleryGoTo(${i})" 
              style="width: 60px; height: 60px; border-radius: 6px; object-fit: cover; cursor: pointer; 
                border: 2px solid ${i === galleryIndex ? '#667eea' : 'transparent'}; 
                opacity: ${i === galleryIndex ? '1' : '0.5'}; transition: all 0.2s;">
          `).join('');
          thumbsEl.style.display = 'flex';
        } else {
          thumbsEl.style.display = 'none';
        }
      }

      function galleryPrev() { if (galleryIndex > 0) { galleryIndex--; showGalleryImage(); } }
      function galleryNext() { if (galleryIndex < galleryImages.length - 1) { galleryIndex++; showGalleryImage(); } }
      function galleryGoTo(i) { galleryIndex = i; showGalleryImage(); }

      function closeModal() {
        document.getElementById("imageModal").classList.remove("active");
        document.body.style.overflow = "auto";
      }

      // Video Gallery Modal
      let videoGalleryList = [];
      let videoGalleryIndex = 0;
      let videoGalleryType = 'video'; // video, merged, dubbed

      function openVideoModal(videoUrl, type) {
        videoGalleryType = type || 'video';
        // Sahne listesinden tüm videoları topla
        videoGalleryList = [];
        if (window._currentScenes) {
          window._currentScenes.forEach(s => {
            let url = null;
            if (videoGalleryType === 'dubbed') url = s.dubbedVideoUrl;
            else if (videoGalleryType === 'merged') url = s.mergedVideoUrl;
            else url = s.videoUrl;
            if (url) {
              videoGalleryList.push({ url, sceneNumber: s.sceneNumber, narration: s.narration });
            }
          });
        }

        // Tıklanan videoyu bul
        videoGalleryIndex = videoGalleryList.findIndex(v => v.url === videoUrl);
        if (videoGalleryIndex < 0) {
          // Listede yoksa tek video olarak göster
          videoGalleryList = [{ url: videoUrl, sceneNumber: '?', narration: '' }];
          videoGalleryIndex = 0;
        }

        document.getElementById("videoModal").classList.add("active");
        document.body.style.overflow = "hidden";
        showVideoAtIndex(videoGalleryIndex);
        buildVideoThumbs();
      }

      function showVideoAtIndex(idx) {
        if (idx < 0 || idx >= videoGalleryList.length) return;
        videoGalleryIndex = idx;
        const item = videoGalleryList[idx];
        const video = document.getElementById("modalVideo");
        video.pause();
        video.src = item.url;
        video.load();
        video.play().catch(() => {});

        const typeLabel = videoGalleryType === 'dubbed' ? '🎬 Dublaj' :
                          videoGalleryType === 'merged' ? '🔊 Sesli' : '▶️ Video';
        document.getElementById("videoGalleryInfo").innerHTML =
          `${typeLabel} — Sahne ${item.sceneNumber} / ${videoGalleryList.length} &nbsp;|&nbsp; <span style="color:#808090;font-size:0.75rem;">${(item.narration || '').substring(0, 80)}...</span>`;

        // Prev/next butonları
        document.getElementById("videoPrevBtn").style.visibility = idx > 0 ? 'visible' : 'hidden';
        document.getElementById("videoNextBtn").style.visibility = idx < videoGalleryList.length - 1 ? 'visible' : 'hidden';

        // Thumbnail highlight
        document.querySelectorAll('.video-thumb').forEach((t, i) => {
          t.style.border = i === idx ? '2px solid #00e5ff' : '2px solid transparent';
          t.style.opacity = i === idx ? '1' : '0.5';
        });
      }

      function videoGalleryPrev() { showVideoAtIndex(videoGalleryIndex - 1); }
      function videoGalleryNext() { showVideoAtIndex(videoGalleryIndex + 1); }

      function buildVideoThumbs() {
        const container = document.getElementById("videoGalleryThumbs");
        container.innerHTML = videoGalleryList.map((v, i) =>
          `<div class="video-thumb" onclick="event.stopPropagation();showVideoAtIndex(${i})" style="cursor:pointer;padding:4px 10px;background:rgba(255,255,255,0.08);border-radius:6px;font-size:0.7rem;color:#c0c0e0;white-space:nowrap;border:2px solid transparent;transition:all 0.2s;">${v.sceneNumber}</div>`
        ).join('');
        // İlk highlight
        showVideoAtIndex(videoGalleryIndex);
      }

      function closeVideoModal() {
        const video = document.getElementById("modalVideo");
        video.pause();
        video.src = "";
        document.getElementById("videoModal").classList.remove("active");
        document.body.style.overflow = "auto";
      }

      // Final Video aç
      function openFinalVideo() {
        const btn = document.getElementById("finalVideoBtn");
        const url = btn.dataset.url;
        if (url) {
          openVideoModal(url);
        }
      }

      // Audio player
      let currentAudio = null;
      function playAudio(audioUrl) {
        // Önceki sesi durdur
        if (currentAudio) {
          currentAudio.pause();
          currentAudio = null;
        }
        // Yeni sesi çal
        currentAudio = new Audio(audioUrl);
        currentAudio.play();
        currentAudio.onended = () => {
          currentAudio = null;
        };
      }

      // Voice picker popup