import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export default {
  WEBHOOK_VERIFY_TOKEN: process.env.WEBHOOK_VERIFY_TOKEN,
  API_TOKEN: process.env.API_TOKEN,
  BUSINESS_PHONE: process.env.BUSINESS_PHONE,
  API_VERSION: process.env.API_VERSION,
  PORT: process.env.PORT || 5000,
  BASE_URL: process.env.BASE_URL,
  GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID,
  GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY,

  GARANTIAS_FILE: path.join(__dirname, '../../data/garantias.csv'),
  PROMOCIONES_FOLDER: path.join(__dirname, '../../data/promociones'),
  CLIENTES_FILE: path.join(__dirname, '../../data/clientes_contactados.csv'),
  
  // Configuración de OpenAI
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  PROMOCIONES_ACTIVAS: true,
  PROMOCION_INTERVAL_HOURS: 24,

  //otras configuraciones de limpieza
  IMAGE_CLEANUP: {
    MAX_AGE_HOURS: 24,    // Máxima antigüedad permitida
    INTERVAL_HOURS: 6,    // Frecuencia de limpieza
    DRY_RUN: false        // true para solo mostrar qué se borraría
  }
};
