import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/env.js';
import webhookRoutes from './routes/webhookRoutes.js';
import { cleanOldImages } from './utils/imageCleaner.js';

// Configuración de rutas de archivos
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// 1. Middlewares básicos (el orden es importante)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2. Servir archivos estáticos (verifica que la carpeta existe)
const staticImagesPath = path.join(__dirname, '..', 'public', 'imagenes');
app.use('/imagenes', express.static(staticImagesPath, {
  maxAge: '1d', // Cache en navegadores/CDN por 1 día
  setHeaders: (res, path) => {
    if (path.endsWith('.png')) {
      res.set('X-Image-Type', 'Generated Inventory');
    }
  }
}));

// 3. Logger de acceso a imágenes (útil para debug)
app.use('/imagenes', (req, res, next) => {
  console.log(`Solicitud de imagen: ${req.path}`);
  next();
});

// 4. Rutas principales
app.use('/', webhookRoutes);

// 5. Ruta de prueba para verificar servicio de imágenes
app.get('/test-image', (req, res) => {
  const testImage = path.join(staticImagesPath, 'test.png');
  if (fs.existsSync(testImage)) {
    res.sendFile(testImage);
  } else {
    res.status(404).send('Imagen de prueba no encontrada');
  }
});

// 6. Manejo de errores
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).send('Algo salió mal!');
});

// limpiar archivos viejos
cleanOldImages(); // Primera ejecución
console.log('🧹 Servicio de limpieza de imágenes activado');


// 7. Inicio del servidor
app.listen(config.PORT, () => {
  console.log(`Servidor escuchando en puerto: ${config.PORT}`);
  console.log(`Ruta de imágenes: ${staticImagesPath}`);

});