const prisma = require("../config/db.config");

/**
 * Yeni proje oluştur ve sahneleri kaydet
 * @param {object} projectData - { title, total_duration, total_scenes, scenes: [...] }
 * @returns {Promise<object>} Oluşturulan proje
 */
async function createProject(projectData) {
  const { title, total_duration, total_scenes, scenes } = projectData;

  console.log(`📁 Proje oluşturuluyor: ${title}`);
  console.log(`🎬 Toplam sahne: ${scenes.length}`);

  const project = await prisma.project.create({
    data: {
      title,
      totalDuration: total_duration,
      totalScenes: total_scenes || scenes.length,
      status: "pending",
      scenes: {
        create: scenes.map((scene) => ({
          sceneNumber: scene.scene_number,
          timestamp: scene.timestamp,
          narration: scene.narration,
          subject: scene.subject,
          characters: scene.characters
            ? JSON.stringify(scene.characters)
            : null,
          videoPrompt: scene.video_prompt || scene.videoPrompt || null,
          status: "pending",
        })),
      },
    },
    include: {
      scenes: true,
    },
  });

  console.log(`✅ Proje oluşturuldu: ${project.id}`);
  console.log(`✅ ${project.scenes.length} sahne kaydedildi`);

  return project;
}

/**
 * Proje detaylarını getir
 * @param {string} projectId
 * @returns {Promise<object>}
 */
async function getProject(projectId) {
  return prisma.project.findUnique({
    where: { id: parseInt(projectId, 10) },
    include: {
      scenes: {
        orderBy: { sceneNumber: "asc" },
      },
    },
  });
}

/**
 * Tüm projeleri listele
 * @returns {Promise<array>}
 */
async function getAllProjects() {
  return prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { scenes: true },
      },
    },
  });
}

/**
 * Proje durumunu güncelle
 * @param {string} projectId
 * @param {string} status
 * @returns {Promise<object>}
 */
async function updateProjectStatus(projectId, status) {
  return prisma.project.update({
    where: { id: parseInt(projectId, 10) },
    data: { status },
  });
}

/**
 * Sahne durumunu ve URL'lerini güncelle
 * @param {string} sceneId
 * @param {object} data - { status, imageUrl, videoUrl }
 * @returns {Promise<object>}
 */
async function updateScene(sceneId, data) {
  return prisma.scene.update({
    where: { id: parseInt(sceneId, 10) },
    data,
  });
}

/**
 * Projenin pending durumundaki sahnelerini getir
 * @param {string} projectId
 * @returns {Promise<array>}
 */
async function getPendingScenes(projectId) {
  return prisma.scene.findMany({
    where: {
      projectId: parseInt(projectId, 10),
      status: "pending",
    },
    orderBy: { sceneNumber: "asc" },
  });
}

/**
 * Proje istatistiklerini getir
 * @param {string} projectId
 * @returns {Promise<object>}
 */
async function getProjectStats(projectId) {
  const scenes = await prisma.scene.findMany({
    where: { projectId: parseInt(projectId, 10) },
    select: { status: true },
  });

  const stats = {
    total: scenes.length,
    pending: scenes.filter((s) => s.status === "pending").length,
    image_processing: scenes.filter((s) => s.status === "image_processing")
      .length,
    image_done: scenes.filter((s) => s.status === "image_done").length,
    video_processing: scenes.filter((s) => s.status === "video_processing")
      .length,
    completed: scenes.filter((s) => s.status === "completed").length,
    failed: scenes.filter((s) => s.status === "failed").length,
  };

  stats.progress = Math.round((stats.completed / stats.total) * 100);

  return stats;
}

/**
 * Projeyi sil
 * @param {string} projectId
 * @returns {Promise<object>}
 */
async function deleteProject(projectId) {
  return prisma.project.delete({
    where: { id: parseInt(projectId, 10) },
  });
}

/**
 * Sahne ID'sine göre sahneyi getir
 * @param {string} sceneId
 * @returns {Promise<object>}
 */
async function getSceneById(sceneId) {
  return prisma.scene.findUnique({
    where: { id: parseInt(sceneId, 10) },
  });
}

/**
 * Projeyi güncelle
 * @param {string} projectId
 * @param {object} data - { finalVideoUrl, ... }
 * @returns {Promise<object>}
 */
async function updateProject(projectId, data) {
  return prisma.project.update({
    where: { id: parseInt(projectId, 10) },
    data,
  });
}

module.exports = {
  createProject,
  getProject,
  getAllProjects,
  updateProjectStatus,
  updateProject,
  updateScene,
  getPendingScenes,
  getProjectStats,
  deleteProject,
  getSceneById,
};
