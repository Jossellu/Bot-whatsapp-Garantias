import whatsappService from './whatsappService.js';
import config from '../config/env.js';
import fs from 'fs';
import geminiService from './GeminiService.js';
import { scheduleJob } from 'node-schedule';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library'
import path from 'path';

class MessageHandler {
  constructor() {
    this.assistandState = {};
    this.processedMessages = new Set();
    this.processedOptions = new Set();
    this.initScheduledJob();
    this.initCleanupJob(); 

      // Nuevos estados para promociones
    this.PROMOTION_TYPES = {
      'planes tarifarios': 'PLANES TARIFARIOS',
      'actualizacion': 'ACTUALIZACION DE CHIP',
      'portabilidad': 'PORTABILIDAD'
    };
    this.PUBLICITY_SHEET_INDEX = 1; // Hoja 2 (0-based index)
    this.PUBLICITY_TEXT_PATH = path.join(__dirname, '../public/publicidad/publicidad_info.txt');
    this.PUBLICITY_IMAGE_PATH = `${config.BASE_URL}/publicidad/publicidad.jpg`;
    this.initPublicityJob(); // Inicializar el trabajo de publicidad
  }

  initPublicityJob() {
  // Programar la verificación diaria a las 12:00 PM
  scheduleJob('0 12 * * *', async () => {
    try {
      console.log('Iniciando verificación de publicidad programada');
      await this.processScheduledPublicity();
    } catch (error) {
      console.error('Error en el job de publicidad:', error);
    }
  });
}

  async processScheduledPublicity() {
    try {
      // 1. Configuración de autenticación
      const serviceAccountAuth = new JWT({
        email: config.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: config.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      // 2. Inicialización del documento
      const doc = new GoogleSpreadsheet(config.GOOGLE_SHEET_ID, serviceAccountAuth);
      await doc.loadInfo();
      const sheet = doc.sheetsByIndex[this.PUBLICITY_SHEET_INDEX];
      
      // 3. Obtener todas las filas
      const rows = await sheet.getRows();
      console.log(`Filas encontradas en hoja de publicidad: ${rows.length}`);

      // 4. Fecha actual en formato YYYY-MM-DD
      const today = new Date().toISOString().split('T')[0];
      
      // 5. Leer archivo de texto con la publicidad
      let publicityText = '¡Oferta especial para ti!';
      try {
        publicityText = fs.readFileSync(this.PUBLICITY_TEXT_PATH, 'utf-8');
      } catch (error) {
        console.error('Error leyendo archivo de publicidad:', error);
      }

      // 6. Filtrar y procesar filas
      let messagesSent = 0;
      
      for (const row of rows) {
        try {
          const phoneNumber = row.get('no. telefonos');
          const sendDate = row.get('fecha de envio');
          
          // Validar datos
          if (!phoneNumber || !sendDate) continue;
          
          // Verificar si es la fecha correcta
          if (sendDate !== today) continue;
          
          // Limpiar número de teléfono
          const cleanNumber = `52${phoneNumber}`.replace(/\D/g, '');
          
          // Enviar imagen de publicidad
          await whatsappService.sendImage(cleanNumber, this.PUBLICITY_IMAGE_PATH);
          
          // Enviar texto de publicidad
          await whatsappService.sendMessage(cleanNumber, publicityText);
          
          // Enviar botón de más información
          const buttons = [
            { reply: { id: 'mas_info_publicidad', title: 'Dame más información' } },
            { reply: { id: 'no_gracias_publicidad', title: 'No gracias' } }
          ];
          
          await whatsappService.sendInteractiveButtons(
            cleanNumber,
            "¿Te interesa conocer más detalles sobre esta oferta?",
            buttons
          );
          
          // Registrar en el estado que viene de publicidad
          this.assistandState[cleanNumber] = {
            step: 'post_publicity',
            source: 'scheduled_publicity'
          };
          
          messagesSent++;
          console.log(`Publicidad enviada a ${cleanNumber}`);
          
        } catch (error) {
          console.error(`Error procesando fila de publicidad: ${error.message}`);
        }
      }

      console.log(`Proceso de publicidad completado. Mensajes enviados: ${messagesSent}`);
      return messagesSent;

    } catch (error) {
      console.error('Error en processScheduledPublicity:', error);
      throw error;
    }
  }

  initCleanupJob() {
    // Limpiar mensajes procesados cada hora para evitar acumulación
    setInterval(() => {
      this.processedMessages.clear();
      this.processedOptions.clear();
      console.log('Limpieza de mensajes procesados realizada');
    }, 3600000); // Cada hora
  }

  // Método para inicializar el trabajo programado
  initScheduledJob() {
    // Programar la tarea diaria a las 5:00 PM
    scheduleJob('10 17 * * *', async () => {
      try {
        console.log('Ejecutando tarea programada: scraping y envío de mensajes');
        await this.processDailyWarrantyUpdates();
      } catch (error) {
        console.error('Error en la tarea programada:', error);
      }
    });
  }

  // Método para procesar las actualizaciones diarias de garantía
  async processDailyWarrantyUpdates() {
    try {
      // 1. Configuración de autenticación
      const serviceAccountAuth = new JWT({
        email: config.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: config.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      // 2. Inicialización del documento
      const doc = new GoogleSpreadsheet(config.GOOGLE_SHEET_ID, serviceAccountAuth);
      
      await doc.loadInfo();
      const sheet = doc.sheetsByIndex[0];
      
      // 3. Obtener todas las filas (no necesitamos encabezados)
      const rows = await sheet.getRows();
      console.log(`Total filas obtenidas: ${rows.length}`);

      // 4. Fecha actual en formato YYYY-MM-DD
      const today = new Date().toISOString().split('T')[0];
      
      // 5. Filtrar y procesar filas
      let messagesSent = 0;
      
      for (const row of rows) {
        try {
          // Verificar si la fila es de hoy (posición 0 en _rawData)
          if (!row._rawData[0] || !row._rawData[0].includes(today)) continue;
          
          // Extraer datos por posición fija
          const phoneNumber = row._rawData[1]; // Posición 1: No.CLIENTE
          const nameClient = row._rawData[2];
          const model = row._rawData[4];       // Posición 4: MODELO
          const imei = row._rawData[3];
          
          // Obtener el último valor no vacío del array
          let status = '';
          for (let i = row._rawData.length - 1; i >= 0; i--) {
            if (row._rawData[i]?.trim()) {
              status = row._rawData[i];
              break;
            }
          }

          // Validar datos mínimos
          if (!phoneNumber || !nameClient || !model || !status || !imei) {
            console.warn(`Fila incompleta - Datos: ${JSON.stringify(row._rawData)}`);
            continue;
          }

          // Enviar mensaje
          await whatsappService.sendMessage(
            `52${phoneNumber}`.replace(/\D/g, ''), // Limpiar número
            `✨ *Estimad@ ${nameClient || 'cliente'}* 
✨Tenemos una actualizacion para el estatus de tu equipo: 

📱*Equipo en garantía:* "${model || 'Modelo no especificado'}"

*IMEI:* "${imei || 'Imei no especificado'}"

🔄 *Estado de garantía:* "${status || 'Estado no disponible'}" 
            
ℹ️Para más información o asistencia, no dudes en responder a este mensaje.
_¡Gracias por confiar en nuestro servicio!_ 🔧 Tecnología Inalámbrica del Istmo`
          );
          
          messagesSent++;
          console.log(`Mensaje enviado a ${phoneNumber} sobre modelo ${model}`);

        } catch (error) {
          console.error(`Error procesando fila: ${error.message}`);
          console.error('Datos de la fila:', row._rawData);
        }
      }

      console.log(`Proceso completado. Mensajes enviados: ${messagesSent}`);
      return messagesSent;

    } catch (error) {
      console.error('Error en processDailyWarrantyUpdates:', error);
      throw error;
    }
  }
      

  async handleIncomingMessage(message, senderInfo) {
    const fromNumber = message.from.slice(0, 2) + message.from.slice(3);
    const incomingMessage = message?.text?.body?.toLowerCase().trim();
    const messageId = message.id;

    // Verificar si ya procesamos este mensaje
    if (this.processedMessages.has(messageId)) {
      return;
    }
    this.processedMessages.add(messageId);


    if (message?.type === "text") {
      const text = message.text.body.trim();

      if (this.isGreeting(incomingMessage)) {
        await this.sendWelcomeMessage(fromNumber, message.id, senderInfo);
        await this.sendWelcomeMenu(fromNumber);
      } else if (this.assistandState[fromNumber]?.step === "question") {
        await this.handleAssistandFlow(fromNumber, text);
      } else if (this.assistandState[fromNumber]?.step === "warranty") {
        await this.handleWarrantyFlow(fromNumber, text);
      } else if (this.assistandState[fromNumber]?.step === "contact_advisor") {
        await this.handleContactAdvisorFlow(fromNumber, text);
      } else if (this.assistandState[fromNumber]?.step === "promotion") {
        await this.handlePromotionFlow(fromNumber, text);
      }else if (this.assistandState[fromNumber]?.step === "capture_name") {
        await this.handleNameCapture(fromNumber, text);
      }

    } else if (message?.type === 'interactive') {
      const option = message?.interactive?.button_reply?.title.toLowerCase().trim();
      await this.handleMenuOption(fromNumber, option, messageId);
    } 

    await whatsappService.markAsRead(messageId);
  }
  isGreeting(message) {
    // Si el mensaje tiene más de 2 palabras, no es saludo
    if (message.split(/\s+/).length > 2) return false;
    
    const exactGreetings = [
      "hola", "hello", "buen dia", "buenos días", "buenas tardes",
      "buenas noches", "que tal", "hi", "hey", "saludos", "buen","oye"
    ];
    
    // Convertir a minúsculas y quitar acentos
    const cleanMessage = message.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    
    // Verificar coincidencia exacta
    return exactGreetings.some(greet => 
      cleanMessage === greet.toLowerCase() || 
      cleanMessage.startsWith(greet.toLowerCase() + ' ') ||
      cleanMessage.endsWith(' ' + greet.toLowerCase()) ||
      cleanMessage.includes(' ' + greet.toLowerCase() + ' ')
    );
  }

  async getSenderName(senderInfo) {
    return senderInfo.profile?.name || senderInfo.wa_id || "Usuario TII";
  }

  async sendWelcomeMessage(to, messageId, senderInfo) {
    const name = await this.getSenderName(senderInfo);
    const welcomeMessage = `¡Hola *${name}*! 👋 Bienvenido al servicio de Atención a Clientes de Tecnología Inalámbrica del Istmo. ¿En qué puedo ayudarte hoy?`;
    await whatsappService.sendMessage(to, welcomeMessage, messageId);
  }

  async sendWelcomeMenu(to) {
      const buttons = [
        { reply: { id: 'promociones', title: 'Promociones' } },
        { reply: { id: 'garantia', title: 'Seguimiento Garantía' } },
        { reply: { id: 'contacto', title: 'Contactar Con Asesor' } }
      ];
      await whatsappService.sendInteractiveButtons(to, "📋 Menú Principal:", buttons);
  }

  async sendPromotionsMenu(to) {
    const buttons = [
      { reply: { id: 'promo1', title: 'PLANES TARIFARIOS' } },
      { reply: { id: 'promo2', title: 'ACTUALIZACION DE CHIP' } },
      { reply: { id: 'promo3', title: 'PORTABILIDAD' } }
    ];
    await whatsappService.sendInteractiveButtons(to, "🏷️ Nuestras Promociones:", buttons);
  }


  async sendPostPromotionMenu(to, promotionType) {
    const buttons = [
      { reply: { id: 'mas_info', title: 'Dame más información' } },
      { reply: { id: 'otra_promo', title: 'Ver otra promoción' } },
      { reply: { id: 'terminar', title: 'Terminar' } }
    ];
    
    // Guardar el tipo de promoción en el estado
    this.assistandState[to] = {
      step: 'post_promotion',
      promotionType: promotionType
    };
    
    await whatsappService.sendInteractiveButtons(to, "¿Deseas más información sobre esta promoción?", buttons);
  }

  async handleMenuOption(to, option, messageId) {
    // Verificar si ya procesamos esta opción
    if (this.processedOptions.has(messageId)) {
      return;
    }
    this.processedOptions.add(messageId);
    const optionsMap = {

      "promociones": async () => {
        await this.sendPromotionsMenu(to);
      },

      "dame mas informacion|mas_info": async () => {
        await whatsappService.sendMessage(to, "Por favor, ¿cuál es tu nombre completo y de que parte de la republica nos escribes?");
        this.assistandState[to] = {
          step: 'capture_name',
          promotionType: this.assistandState[to]?.promotionType
        };
      },

      "promoción 1|planes tarifarios": async () => {
        const fileUrl = `${config.BASE_URL}/promociones/promo1.jpg`;
        await whatsappService.sendImage(to,fileUrl);
        await whatsappService.sendMessage(to, 
          `🔥 *PLANES TARIFARIOS* 🔥\n\n` +
          `📌 aprovecha la promocion de recargas \n\n` +
          `📆 Válida hasta: XX/XX/XXXX\n` +
          `📍 Aplican términos y condiciones\n\n` +
          `¡Aprovecha esta gran oportunidad!`
        );
        await this.sendPostPromotionMenu(to, 'planes tarifarios');
      },

      "promoción 2|actualizacion": async () => {
        const fileUrl = `${config.BASE_URL}/promociones/promo1.jpg`;
        await whatsappService.sendImage(to,fileUrl);
        await whatsappService.sendMessage(to, 
          `🔥 *ACTUALIZACION DE CHIP* 🔥\n\n` +
          `📌 Descripción detallada de la promoción 2\n\n` +
          `📆 Válida hasta: XX/XX/XXXX\n` +
          `📍 Aplican términos y condiciones\n\n` +
          `¡No dejes pasar esta oferta!`
        );
        await this.sendPostPromotionMenu(to, 'actualizacion');
      },

      "promoción 3|portabilidad": async () => {
        const fileUrl = `${config.BASE_URL}/promociones/promo1.jpg`;
        await whatsappService.sendImage(to,fileUrl);
        await whatsappService.sendMessage(to, 
          `🔥 *PORTABILIDAD* 🔥\n\n` +
          `📌 Descripción detallada de la promoción 3\n\n` +
          `📆 Válida hasta: XX/XX/XXXX\n` +
          `📍 Aplican términos y condiciones\n\n` +
          `¡Oferta por tiempo limitado!`
        );
        await this.sendPostPromotionMenu(to, 'portabilidad');
      },

      "promoción|otra_promo|ver otra promocion": async () => {
        await this.sendPromotionsMenu(to);
        delete this.assistandState[to];
      },

      "garantia|seguimiento": async () => {
        await whatsappService.sendMessage(to, "Ingresa tu número de teléfono correspondiente a tu equipo en garantía:");
        this.assistandState[to] = { step: 'warranty' };
      },
      "hacer otro seguimien|hacer otro seguimiento": async () => {
        await whatsappService.sendMessage(to, "Ingresa tu número de teléfono correspondiente a tu equipo en garantía:");
        this.assistandState[to] = { step: 'warranty' };
      },
      "terminar": async () => {
        await whatsappService.sendMessage(to, "¡Espero haberte ayudado! Que tengas un excelente día de parte de Tecnología Inalámbrica del Istmo.");
        delete this.assistandState[to];
      },
      "contactar": async () => {
        await whatsappService.sendMessage(to, "Ingresa tu número de teléfono correspondiente a tu equipo en garantía:");
        this.assistandState[to] = { step: 'contact_advisor' };
      },

      "dame más información|mas_info_publicidad": async () => {
        await whatsappService.sendMessage(to, "Por favor, ¿cuál es tu nombre completo?");
        this.assistandState[to] = {
          step: 'capture_name',
          source: 'publicity' // Diferenciar que viene de publicidad
        };
      },
  
      "no gracias|no_gracias_publicidad": async () => {
        await whatsappService.sendMessage(
          to,
          "Gracias por tu interés. ¡Estaremos aquí cuando nos necesites!"
        );
        delete this.assistandState[to];
      },
    };

    const normalizedOption = option.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    const matchedAction = Object.entries(optionsMap).find(([key]) => {
      const keywords = key.split("|");
      return keywords.some(k => normalizedOption.includes(k));
    });

    if (matchedAction) {
      try {
        await matchedAction[1]();
      } catch (error) {
        console.error('Error ejecutando acción:', error);
      }
    } else {
      await whatsappService.sendMessage(to, "Opción no reconocida. Por favor, selecciona una opción válida.");
    }
  }


  async handleWarrantyFlow(to, phoneNumber) {
    try {
      // 1. Configuración de autenticación
      const serviceAccountAuth = new JWT({
        email: config.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: config.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      // 2. Inicialización del documento
      const doc = new GoogleSpreadsheet(config.GOOGLE_SHEET_ID, serviceAccountAuth);
      
      await doc.loadInfo();
      const sheet = doc.sheetsByIndex[0];
      
      // 3. Obtener todas las filas
      const rows = await sheet.getRows();
      
      // Buscar coincidencias en ambas columnas (phone number e imei)
      const warrantyRecords = rows.filter(row => {
        const rowPhone = row._rawData[1]?.replace(/\D/g, ''); // Teléfono en 2da columna (índice 1)
        const rowImei = row._rawData[3]?.replace(/\D/g, '');  // IMEI en 4ta columna (índice 3)
        
        // Comparar con ambas columnas
        return rowPhone === cleanInput || rowImei === cleanInput;
      });

      if (warrantyRecords.length === 0) {
        await whatsappService.sendMessage(
          to,
          `❌ No se encontró ningún equipo en garantía asociado al número ${phoneNumber}`
        );
      } else {
        // Tomar el registro más reciente (último en la lista)
        const latestRecord = warrantyRecords[warrantyRecords.length - 1];
        const model = latestRecord._rawData[4]; // Posición 4: MODELO
        const nameClient = latestRecord._rawData[2]; // Posición 2: Nombre
        const imei = latestRecord._rawData[3];
        // Obtener el último estado no vacío
        let status = '';
        for (let i = latestRecord._rawData.length - 1; i >= 0; i--) {
          if (latestRecord._rawData[i]?.trim()) {
            status = latestRecord._rawData[i];
            break;
          }
        }

        // Enviar mensaje decorado
        await whatsappService.sendMessage(
          to,
          `✨ *Estimad@ ${nameClient || 'cliente'}* ✨\n\n` +
          `📱 *Equipo en garantía:* "${model || 'Modelo no especificado'}"\n` +
          `🔄 *IMEI:* "${imei || 'Imei no especificado'}"\n\n` +
          `🔄 *Último estado:* "${status || 'Estado no disponible'}"\n\n` +
          `ℹ️ Para más información o asistencia, no dudes en responder a este mensaje.\n\n` +
          `_¡Gracias por confiar en nuestro servicio!_ \n` +
          `🔧 Tecnología Inalámbrica del Istmo`
        );
      }

      // Mostrar opciones de seguimiento
      const buttons = [
        { reply: { id: 'hacer_otro_seguimiento', title: 'Hacer otro seguimiento' } },
        { reply: { id: 'contactar_asesor_garantia', title: 'Contactar con asesor' } },
        { reply: { id: 'terminar', title: 'Terminar' } }
      ];
      await whatsappService.sendInteractiveButtons(to, "¿Necesitas algo más?", buttons);

    } catch (error) {
      console.error('Error en handleWarrantyFlow:', error);
      await whatsappService.sendMessage(
        to,
        '⚠️ Ocurrió un error al buscar tu garantía. Por favor intenta más tarde.'
      );
    } finally {
      delete this.assistandState[to];
    }
  }

  async handleNameCapture(to, userName) {
    try {
      // Verificar si el input parece un nombre válido
      if (userInput.split(/\s+/).length < 2 || this.isGreeting(userInput)) {
        await whatsappService.sendMessage(
          to,
          "Por favor ingresa tu nombre completo real (al menos nombre y apellido)."
        );
        return;
      }

      // Determinar el contexto (promoción normal o publicidad)
      const context = this.assistandState[to]?.source === 'publicity' ? 
        'PUBLICIDAD PROGRAMADA' : 
        this.PROMOTION_TYPES[this.assistandState[to]?.promotionType];
      
      // Confirmar al usuario
      await whatsappService.sendMessage(
        to,
        `Estimado ${userName}, en unos momentos un asesor se comunicará contigo para brindarte más información.`
      );
      
      // Enviar notificación al asesor
      const userPhone = to.replace('521', '52'); // Formatear número
      await whatsappService.sendMessage(
        '529711198002', // Número del asesor
        `El cliente ${userName} quiere más información acerca de ${context}. ` +
        `Por favor comunicate con él al ${userPhone}`
      );
      
      // Mostrar menú reducido (solo ver otras promociones o terminar)
      const buttons = [
        { reply: { id: 'otra_promo', title: 'Ver otra promoción' } },
        { reply: { id: 'terminar', title: 'Terminar' } }
      ];
      
      await whatsappService.sendInteractiveButtons(
        to,
        "¿Te interesa ver otras promociones disponibles?",
        buttons
      );
      
    } catch (error) {
      console.error('Error en handleNameCapture:', error);
      await whatsappService.sendMessage(
        to,
        'Ocurrió un error al procesar tu solicitud. Por favor intenta nuevamente.'
      );
    } finally {
      // Mantener el estado para seguir el flujo
      this.assistandState[to] = {
        step: 'post_advisor_contact',
        promotionType: this.assistandState[to]?.promotionType
      };
    }
  }

  async handleContactAdvisorFlow(to, phoneNumber) {
    try {
      // 1. Configuración de autenticación (igual que en handleWarrantyFlow)
      const serviceAccountAuth = new JWT({
        email: config.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: config.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      // 2. Inicialización del documento
      const doc = new GoogleSpreadsheet(config.GOOGLE_SHEET_ID, serviceAccountAuth);
      
      await doc.loadInfo();
      const sheet = doc.sheetsByIndex[0];
      
      // 3. Obtener todas las filas
      const rows = await sheet.getRows();
      
      // 4. Buscar el número en la segunda columna (posición 1 en _rawData)
      const warrantyRecords = rows.filter(row => {
        const rowPhone = row._rawData[1]?.replace(/\D/g, ''); // Limpiar número
        const searchPhone = phoneNumber.replace(/\D/g, ''); // Limpiar número buscado
        return rowPhone === searchPhone;
      });

      if (warrantyRecords.length === 0) {
        await whatsappService.sendMessage(
          to,
          `❌ No se encontró ningún equipo en garantía asociado al número ${phoneNumber}`
        );
      } else {
        // Tomar el registro más reciente (último en la lista)
        const latestRecord = warrantyRecords[warrantyRecords.length - 1];
        const model = latestRecord._rawData[4]; // Posición 4: MODELO
        const nameClient = latestRecord._rawData[2]; // Posición 2: Nombre
        const imei = latestRecord._rawData[3]; // Posición 3: IMEI

        // Enviar mensaje al asesor
        await whatsappService.sendMessage(
          `529711374858`, // Número del asesor
          `El usuario ${nameClient} con equipo ${model} e imei: ${imei} quiere contactar un asesor para resolver dudas, llamalo al ${to.replace('521', '52')}`
        );
        
        // Enviar confirmación al cliente
        await whatsappService.sendMessage(
          to,
          "Un asesor se comunicará contigo en breve. ¡Gracias por tu paciencia!"
        );
      }

      // Mostrar opciones de seguimiento
      const buttons = [
        { reply: { id: 'hacer_otro_seguimiento', title: 'Hacer otro seguimiento' } },
        { reply: { id: 'terminar', title: 'Terminar' } }
      ];
      await whatsappService.sendInteractiveButtons(to, "¿Necesitas algo más?", buttons);

    } catch (error) {
      console.error('Error en handleContactAdvisorFlow:', error);
      await whatsappService.sendMessage(
        to,
        '⚠️ Ocurrió un error al procesar tu solicitud. Por favor intenta más tarde.'
      );
    } finally {
      delete this.assistandState[to];
    }
}

}



export default new MessageHandler();


