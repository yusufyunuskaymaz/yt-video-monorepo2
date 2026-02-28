require("dotenv").config();

const app = require("./app");
const prisma = require("./config/db.config");

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log("🚀 ================================");
  console.log(`🚀 Sunucu http://localhost:${PORT} adresinde çalışıyor`);
  console.log("🚀 ================================");
  console.log("");
  console.log("📝 API Endpoints:");
  console.log(`   POST /api/generate - Resim üret`);
  console.log(`   GET  /api/models   - Modelleri listele`);
  console.log("");

  // Takılmış sahneleri temizle (sunucu restart sonrası)
  try {
    const stuck = await prisma.scene.updateMany({
      where: { status: "image_processing" },
      data: { status: "pending" },
    });
    if (stuck.count > 0) {
      console.log(`🔧 ${stuck.count} takılmış sahne pending'e alındı`);
    }
    // generating_images durumundaki projeleri de pending'e al
    const stuckProjects = await prisma.project.updateMany({
      where: { status: "generating_images" },
      data: { status: "pending" },
    });
    if (stuckProjects.count > 0) {
      console.log(`🔧 ${stuckProjects.count} takılmış proje pending'e alındı`);
    }
  } catch (e) {
    console.error("Takılmış sahne temizleme hatası:", e.message);
  }
});
