import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const imagesPath = path.join(__dirname, '../../public/imagenes');

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 horas

function cleanOldImages() {
  try {
    const files = fs.readdirSync(imagesPath);
    const now = Date.now();
    
    files.forEach(file => {
      if (file.endsWith('.png')) {
        const filePath = path.join(imagesPath, file);
        const stats = fs.statSync(filePath);
        const fileAge = now - stats.mtimeMs;

        if (fileAge > MAX_AGE_MS) {
          fs.unlinkSync(filePath);
          console.log(`🗑️ Eliminada imagen antigua: ${file}`);
        }
      }
    });
  } catch (error) {
    console.error('Error en limpieza de imágenes:', error.message);
  }
}

// Ejecutar ahora y luego cada 6 horas
cleanOldImages();
setInterval(cleanOldImages, 6 * 60 * 60 * 1000); 

export { cleanOldImages };