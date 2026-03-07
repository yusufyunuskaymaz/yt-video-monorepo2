const prisma = require("../config/db.config");
const r2Service = require("./r2.service");
const https = require("https");
const http = require("http");

/**
 * Tüm karakterleri getir (global)
 */
async function getAllCharacters(projectId) {
  const where = projectId ? { projectId: parseInt(projectId) } : {};
  return prisma.character.findMany({
    where,
    orderBy: { createdAt: "asc" },
  });
}

/**
 * İsme göre karakter getir
 */
async function getCharacterByName(name) {
  return prisma.character.findUnique({ where: { name } });
}

/**
 * İsimlere göre birden fazla karakter getir
 */
async function getCharactersByNames(names, projectId) {
  const where = { name: { in: names } };
  if (projectId) where.projectId = parseInt(projectId);
  return prisma.character.findMany({ where });
}

/**
 * Karakter oluştur — resmi R2'ye yükle (global)
 * @param {string} name
 * @param {Buffer} imageBuffer
 * @param {string} mimeType
 */
async function createCharacter(name, imageBuffer, mimeType, projectId) {
  const ext = mimeType.includes("png") ? "png" : "jpg";
  const slugName = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .substring(0, 30);
  const prefix = projectId ? `characters/${projectId}` : "characters/global";
  const r2Key = `${prefix}/${slugName}_${Date.now()}.${ext}`;

  const imageUrl = await r2Service.uploadBuffer(imageBuffer, r2Key, mimeType);

  const character = await prisma.character.create({
    data: { name, imageUrl, projectId: projectId ? parseInt(projectId) : null },
  });

  console.log(
    `[Character] ✅ ${name} oluşturuldu (proje:${
      projectId || "global"
    }) → ${imageUrl}`
  );
  return character;
}

/**
 * Karakter güncelle (resim değiştirme dahil)
 */
async function updateCharacter(characterId, data) {
  return prisma.character.update({
    where: { id: parseInt(characterId, 10) },
    data,
  });
}

/**
 * Karakter sil
 */
async function deleteCharacter(characterId) {
  return prisma.character.delete({
    where: { id: parseInt(characterId, 10) },
  });
}

/**
 * Sahne bazında karakter resimlerini base64 al (Gemini API için)
 * @param {string[]} characterNames - ["Sultan", "Vezir"]
 */
async function getCharacterImagesAsBase64ByNames(characterNames, projectId) {
  if (!characterNames || characterNames.length === 0) return [];

  const characters = await getCharactersByNames(characterNames, projectId);
  if (characters.length === 0) return [];

  const results = [];
  for (const char of characters) {
    try {
      const buffer = await downloadToBuffer(char.imageUrl);
      results.push({
        name: char.name,
        imageUrl: char.imageUrl,
        base64: buffer.toString("base64"),
        mimeType: char.imageUrl.endsWith(".png") ? "image/png" : "image/jpeg",
      });
    } catch (err) {
      console.error(`[Character] ${char.name} indirilemedi:`, err.message);
    }
  }
  return results;
}

/**
 * Projedeki tüm sahnelerden benzersiz karakter isimlerini çıkar ve resimlerini al
 */
async function getCharacterImagesForProject(projectId) {
  const projectService = require("./project.service");
  const project = await projectService.getProject(projectId);
  if (!project) return [];

  // Tüm sahnelerden benzersiz karakter isimlerini topla
  const allNames = new Set();
  for (const scene of project.scenes || []) {
    if (scene.characters) {
      try {
        const chars = JSON.parse(scene.characters);
        chars.forEach((n) => allNames.add(n));
      } catch (e) {}
    }
  }

  if (allNames.size === 0) return [];
  return getCharacterImagesAsBase64ByNames([...allNames], projectId);
}

/**
 * URL'den buffer olarak indir
 */
function downloadToBuffer(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    protocol
      .get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          downloadToBuffer(response.headers.location)
            .then(resolve)
            .catch(reject);
          return;
        }
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks)));
        response.on("error", reject);
      })
      .on("error", reject);
  });
}

module.exports = {
  getAllCharacters,
  getCharacterByName,
  getCharactersByNames,
  createCharacter,
  updateCharacter,
  deleteCharacter,
  getCharacterImagesAsBase64ByNames,
  getCharacterImagesForProject,
};
