import whatsappService from './whatsappService.js';
import config from '../config/env.js';
import fs from 'fs';
import geminiService from './GeminiService.js';
import { scheduleJob } from 'node-schedule';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library'


class MessageHandler {
  constructor() {
    this.assistandState = {};
    this.initScheduledJob(); // Inicializar el trabajo programado
  }

  // Método para inicializar el trabajo programado
  initScheduledJob() {
    // Programar la tarea diaria a las 5:00 PM
    scheduleJob('29 14 * * *', async () => {
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
          
          // Obtener el último valor no vacío del array
          let status = '';
          for (let i = row._rawData.length - 1; i >= 0; i--) {
            if (row._rawData[i]?.trim()) {
              status = row._rawData[i];
              break;
            }
          }

          // Validar datos mínimos
          if (!phoneNumber || !nameClient || !model || !status) {
            console.warn(`Fila incompleta - Datos: ${JSON.stringify(row._rawData)}`);
            continue;
          }

          // Enviar mensaje
          await whatsappService.sendMessage(
            `52${phoneNumber}`.replace(/\D/g, ''), // Limpiar número
            `✨ *Estimad@ ${nameClient || 'cliente'}* 
✨Tenemos una actualizacion para el estatus de tu 📱 *Equipo:* "${model || 'Modelo no especificado'}" 

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

    if (message?.type === "text") {
      const text = message.text.body.trim();

      if (this.isGreeting(incomingMessage)) {
        await this.sendWelcomeMessage(fromNumber, message.id, senderInfo);
        await this.sendWelcomeMenu(fromNumber);
      } else if (this.assistandState[fromNumber]?.step === "question") {
        await this.handleAssistandFlow(fromNumber, text);
      } else if (this.assistandState[fromNumber]?.step === "warranty") {
        await this.handleWarrantyFlow(fromNumber, text);
      }

      await whatsappService.markAsRead(message.id);
    } else if (message?.type === 'interactive') {
      const option = message?.interactive?.button_reply?.title.toLowerCase().trim();
      await this.handleMenuOption(fromNumber, option, message.id);
      await whatsappService.markAsRead(message.id);
    }
  }
  isGreeting(message) {
    const greetings = ["hola", "hello", "buen dia", "buenos días", "oye", "que tal", "hi", "hey"];
    return greetings.some(greet => message.includes(greet));
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
      { reply: { id: 'consulta', title: 'Consulta' } },
      { reply: { id: 'garantia', title: 'Seguimiento Garantía' } },
      { reply: { id: 'contacto', title: 'Contactar Con Asesor' } }
    ];
    await whatsappService.sendInteractiveButtons(to, "📋 Menú Principal:", buttons);
  }


  async handleMenuOption(to, option, messageId) {
    const optionsMap = {
      "consulta": async () => {
        await whatsappService.sendMessage(to, "¿En qué puedo ayudarte? Puedo resolver cualquier duda que tengas acerca de Tecnología Inalámbrica del Istmo");
        this.assistandState[to] = { step: 'question' };
      },
      "garantia|seguimiento": async () => {
        await whatsappService.sendMessage(to, "Ingresa tu número de teléfono correspondiente a tu equipo en garantía:");
        this.assistandState[to] = { step: 'warranty' };
      },
      "hacer otro seguimiento": async () => {
        await whatsappService.sendMessage(to, "Ingresa tu número de teléfono correspondiente a tu equipo en garantía:");
        this.assistandState[to] = { step: 'warranty' };
      },
      "terminar": async () => {
        await whatsappService.sendMessage(to, "¡Espero haberte ayudado! Que tengas un excelente día de parte de Tecnología Inalámbrica del Istmo.");
        delete this.assistandState[to];
      },
      "contactar": async () => {
        await whatsappService.sendMessage(to, "Un asesor se comunicará contigo en breve.");
      }
    };

    const normalizedOption = option.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    const matchedAction = Object.entries(optionsMap).find(([key]) => {
      const keywords = key.split("|");
      return keywords.some(k => normalizedOption.includes(k));
    });

    if (matchedAction) {
      await matchedAction[1]();
    } else {
      await whatsappService.sendMessage(to, "Opción no reconocida. Por favor, selecciona una opción válida.");
    }
  }

  async handleAssistandFlow(to, userMessage) {
    // Leer contexto del archivo .txt
    const empresaInfo = fs.readFileSync('./data/info_empresa.txt', 'utf-8');

    // Consulta a ChatGPT con contexto + pregunta del usuario
    const fullPrompt = `${empresaInfo}\n\nUsuario: ${userMessage}\nAsistente:`;
    const response = await geminiService(fullPrompt);


    // Enviar respuesta
    await whatsappService.sendMessage(to, response);

    // Mostrar menú después de responder
    const buttons = [
      { reply: { id: 'hacer_otra', title: 'Hacer otra consulta' } },
      { reply: { id: 'terminar', title: 'Terminar' } }
    ];
    await whatsappService.sendInteractiveButtons(to, "¿Te ha parecido útil la respuesta?", buttons);

    // Limpiar estado
    delete this.assistandState[to];
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
          `🔄 *Último estado:* "${status || 'Estado no disponible'}"\n\n` +
          `ℹ️ Para más información o asistencia, no dudes en responder a este mensaje.\n\n` +
          `_¡Gracias por confiar en nuestro servicio!_ \n` +
          `🔧 Tecnología Inalámbrica del Istmo`
        );
      }

      // Mostrar opciones de seguimiento
      const buttons = [
        { reply: { id: 'hacer_otro_seguimiento', title: 'Hacer otro seguimiento' } },
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
}

export default new MessageHandler();


