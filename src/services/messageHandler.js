import whatsappService from './whatsappService.js';
import config from '../config/env.js';
import fs from 'fs';
import geminiService from './GeminiService.js';
import { scheduleJob } from 'node-schedule';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library'
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
      'portabilidad': 'PORTABILIDAD',
      'telcel_libre':'TELCEL LIBRE',
      'internet_en_casa': 'INERNET EN CASA',
      'cambio_de_equipo': 'CAMBIO DE EQUIPO CON MISMO NUMERO'

    };
  }


  initCleanupJob() {
    // Limpiar mensajes procesados cada hora para evitar acumulación
    setInterval(() => {
      this.processedMessages.clear();
      this.processedOptions.clear();
      console.log('Limpieza de mensajes procesados realizada');
    }, 3600000); // Cada hora
  }


  initScheduledJob() {
    // GARANTIAS
    scheduleJob('30 17 * * *', async () => {
      try {
        console.log('Ejecutando tarea programada: scraping y envío de mensajes');
        await this.processDailyWarrantyUpdates();
      } catch (error) {
        console.error('❌ Error en la tarea programada de garantía:', error);
      }
    });

    // ENCUESTAS DE CALIDAD
    scheduleJob('00 14 * * *', async () => {
      try {
        console.log('🕑 Ejecutando tarea programada: envío de encuestas de calidad');
        await this.processDailySurveyUpdates();
      } catch (error) {
        console.error('❌ Error en la tarea programada de encuestas:', error);
      }
    });

    // RECORDATORIOS
    scheduleJob('00 12 * * *', async () => {
      try {
        console.log('🕑 Ejecutando tarea programada: envío de recordatorios');
        await this.processDailyReminders();
      } catch (error) {
        console.error('❌ Error en la tarea programada de recordatorios:', error);
      }
    });

    // PUBLICIDAD
    scheduleJob('00 12 * * *', async () => {
      try {
        console.log('🕑 Ejecutando tarea programada: envío de publicidad');
        await this.processDailyPublicity();
      } catch (error) {
        console.error('❌ Error en la tarea programada de publicidad:', error);
      }
    });
  }

  // Método para procesar las actualizaciones diarias de garantía
  async processDailyWarrantyUpdates() {
    try {
      const serviceAccountAuth = new JWT({
        email: config.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: config.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      const doc = new GoogleSpreadsheet(config.GOOGLE_SHEET_ID, serviceAccountAuth);
      await doc.loadInfo();
      const sheet = doc.sheetsByIndex[0];

      const rows = await sheet.getRows();
      console.log(`📄 Total filas obtenidas: ${rows.length}`);

      const today = new Date().toISOString().split('T')[0];
      let messagesSent = 0;

      for (const row of rows) {
        try {
          const data = row._rawData;

          // Verificar si la fila corresponde a hoy
          if (!data[0] || !data[0].includes(today)) continue;

          const phoneNumber = data[1]?.toString().trim();
          const nameclient = data[2]?.toString().trim() || 'Usuari@';
          const imei = data[3]?.toString().trim() || 'imei';
          const model = data[4]?.toString().trim() || 'no proporcionado';
          const falla = data[5]?.toString().trim() || 'no proporcionada';

          // Buscar el último campo no vacío como status
          let status = '';
          for (let i = data.length - 1; i >= 0; i--) {
            const val = data[i]?.toString().trim();
            if (val) {
              status = val;
              break;
            }
          }

          const parameters = [
            { type: 'text', text: nameclient },
            { type: 'text', text: model },
            { type: 'text', text: imei },
            { type: 'text', text: falla },
            { type: 'text', text: status }
          ];

          // Validar que ningún parámetro esté vacío
          const validParams = parameters.every(p => typeof p.text === 'string' && p.text.trim() !== '');
          if (!phoneNumber || !validParams) {
            console.warn('❌ Datos incompletos o inválidos:', {
              phoneNumber, nameclient, model, imei,falla, status
            });
            continue;
          }

          const formattedNumber = `52${phoneNumber}`.replace(/\D/g, '');
          console.log(`📤 Enviando a ${formattedNumber} con:`, parameters);

          await whatsappService.sendTemplateMessage(
            formattedNumber,
            'actualizacion_garantia',
            parameters,
            'es'
          );

          messagesSent++;
          console.log(`✅ Mensaje enviado a ${phoneNumber}`);

        } catch (error) {
          console.error(`⚠️ Error procesando fila: ${error.message}`);
          console.error('Datos de la fila:', row._rawData);
        }
      }

      console.log(`✅ Proceso completado. Mensajes enviados: ${messagesSent}`);
      return messagesSent;

    } catch (error) {
      console.error('❌ Error en processDailyWarrantyUpdates:', error);
      throw error;
    }
  }

  async processDailySurveyUpdates() {
      try {
        const serviceAccountAuth = new JWT({
          email: config.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          key: config.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const doc = new GoogleSpreadsheet(config.GOOGLE_SHEET_ID, serviceAccountAuth);
        await doc.loadInfo();
        const sheet = doc.sheetsByIndex[2];

        const rows = await sheet.getRows();
        console.log(`📄 Total filas obtenidas: ${rows.length}`);

        const dateObj = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const year = dateObj.getFullYear();
        const newday = `${day}/${month}/${year}`;
        let messagesSent = 0;

        for (const row of rows) {
          try {
            const data = row._rawData;

            // Verificar si la fila corresponde a hoy
            if (!data[0] || !data[0].includes(newday)) continue;

            const phoneNumber = data[5]?.toString().trim();
            const nombre_cliente = data[3]?.toString().trim() || 'Cliente';
            const servicio = data[7]?.toString().trim() || 'Servicio';
              
            const formattedNumber = `52${phoneNumber}`.replace(/\D/g, '');
            await whatsappService.sendQualitySurvey(
              formattedNumber,
              'servicio_post_venta',
                [
                { text: nombre_cliente },
                { text: servicio }
              ],
               'es_MX',
               true
            );

            messagesSent++;
            console.log(`✅ Mensaje enviado a ${formattedNumber}`);

          } catch (error) {
            console.error(`⚠️ Error procesando fila: ${error.message}`);
            console.error('Datos de la fila:', row._rawData);
          }
        }

        console.log(`✅ Proceso completado. Mensajes enviados: ${messagesSent}`);
        return messagesSent;

      } catch (error) {
        console.error('❌ Error en envio de encuesta de calidad:', error);
        throw error;
      }
    }


  // Método para procesar las actualizaciones diarias de publicidad
  async processDailyPublicity() {
    try {
      const serviceAccountAuth = new JWT({
        email: config.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: config.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      const doc = new GoogleSpreadsheet(config.GOOGLE_SHEET_ID, serviceAccountAuth);
      await doc.loadInfo();
      const sheet = doc.sheetsByIndex[1];

      const rows = await sheet.getRows();
      console.log(`📄 Total filas obtenidas: ${rows.length}`);

      const today = new Date().toISOString().split('T')[0];
      let messagesSent = 0;

      for (const row of rows) {
        try {
          const data = row._rawData;

          // Verificar si la fila corresponde a hoy
          if (!data[1] || !data[1].includes(today)) continue;

          const phoneNumber = data[0]?.toString().trim();


          console.log(`📤 Enviando publicidad a ${phoneNumber}`);

          await whatsappService.sendUniversalPublicityTemplate({
            phoneNumber,
            templateName: 'publicidad_prueba',
            languageCode: 'es_MX',
          });


          messagesSent++;
          console.log(`✅ Mensaje enviado a ${phoneNumber}`);

        } catch (error) {
          console.error(`⚠️ Error procesando fila: ${error.message}`);
          console.error('Datos de la fila:', row._rawData);
        }
      }

      console.log(`✅ Proceso completado. Mensajes enviados: ${messagesSent}`);
      return messagesSent;

    } catch (error) {
      console.error('❌ Error en processDailyWarrantyUpdates:', error);
      throw error;
    }
  }

  async saveFlowSurveyResponses(phoneNumber, responses) {
    try {
      const serviceAccountAuth = new JWT({
        email: config.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: config.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      const doc = new GoogleSpreadsheet(config.GOOGLE_SHEET_ID, serviceAccountAuth);
      await doc.loadInfo();
      const sheet = doc.sheetsByIndex[2]; // Hoja de encuestas
      const rows = await sheet.getRows();
      const cleanPhone = phoneNumber.replace(/\D/g, '').slice(-10);

      for (const row of rows) {
        const rowPhone = row._rawData[5]?.replace(/\D/g, '').slice(-10);

        if (rowPhone === cleanPhone) {
          // Crear mapa personalizado
          const campoTraducido = {
            screen_0_Opciones_0: "Valoracion",
            screen_0_Opciones_1: "Publicidad",
            screen_0_Deja_un_comentario_2: "Comentarios"
          };

          responses.forEach(({ name, value }) => {
            const nombreColumna = campoTraducido[name];
            if (nombreColumna) {
              // Limpieza del valor
              const cleanedValue = value.slice(2).replace(/_/g, ' ');

              // Asignar por índice fijo
              switch (nombreColumna) {
                case "Valoracion":
                  row._rawData[18] = cleanedValue;
                  break;
                case "Publicidad":
                  row._rawData[19] = cleanedValue;
                  break;
                case "Comentarios":
                  row._rawData[20] = value;
                  break;
              }
            }
          });

          await row.save();
          console.log(`✔️ Respuestas guardadas en columnas 23-25 para ${phoneNumber}`);
          return;
        }
      }

      console.warn(`⚠️ No se encontró el número ${phoneNumber} en hoja de encuestas`);
    } catch (error) {
      console.error('❌ Error guardando respuestas del flow:', error);
    }
  }

  async processDailyReminders() {
    try {
      const serviceAccountAuth = new JWT({
        email: config.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: config.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      const doc = new GoogleSpreadsheet(config.GOOGLE_SHEET_ID, serviceAccountAuth);
      await doc.loadInfo();
      const sheet = doc.sheetsByIndex[4];

      const rows = await sheet.getRows();
      console.log(`📄 Total filas obtenidas: ${rows.length}`);
      const dateObj = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      const day = String(dateObj.getDate()).padStart(2, '0');
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const year = dateObj.getFullYear();
      const newday = `${day}/${month}/${year}`;

      let messagesSent = 0;
      
      for (const row of rows) {
        try {
          const data = row._rawData;

          // Verificar si la fila corresponde a hoy
          if (!data[5] || !data[5].includes(newday)) continue;



          const phoneNumber = row._rawData[1]?.toString().trim();
          const formattedNumber = `52${phoneNumber}`.replace(/\D/g, '');
          await whatsappService.sendTemplateMessage(
            formattedNumber,
            'recordatorio_pago',
            [],
            'es_MX',
          );

          messagesSent++;
          console.log(`✅ Mensaje enviado a ${formattedNumber}`);
        } catch (error) {
          console.error(`⚠️ Error procesando fila: ${error.message}`);
          console.error('Datos de la fila:', row._rawData);
        }
      }

      console.log(`✅ Proceso completado. Mensajes enviados: ${messagesSent}`);
      return messagesSent;
    } catch (error) {
      console.error('❌ Error en envio de recordatorios:', error);
      throw error;
    }
  }



  async handleIncomingMessage(message, senderInfo) {
    const fromNumber = message.from.slice(0, 2) + message.from.slice(3);
    const incomingMessage = message?.text?.body?.toLowerCase().trim();
    const messageId = message.id;
    
    if (message.type === 'interactive' && message.interactive?.type === 'nfm_reply') {
      const waId = message.from;
      const rawJson = message.interactive.nfm_reply?.response_json;

      if (!rawJson) {
        console.warn(`⚠️ Se recibió una respuesta de Flow (nfm_reply) sin contenido para ${waId}`);
        return;
      }

      const responses = [];
      try {
        const parsed = JSON.parse(rawJson);
        for (const [key, value] of Object.entries(parsed)) {
          responses.push({ name: key, value });
        }
      } catch (err) {
        console.error('❌ Error al parsear response_json de nfm_reply:', err);
        return;
      }

      console.log(`🧾 Usuario ${waId} respondió la encuesta:`);
      responses.forEach(r => console.log(`- ${r.name}: ${r.value}`));

      await this.saveFlowSurveyResponses(waId, responses);

      await whatsappService.sendMessage(
        waId,
        "¡Gracias por completar nuestra encuesta! Tu opinión es muy valiosa para nosotros. 🙌"
      );

      return;
    }

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
    }if (message?.type === 'interactive') {
      const interactiveType = message.interactive?.type;
      const fromNumber = message.from.slice(0, 2) + message.from.slice(3);
      
      if (interactiveType === 'list_reply') {
        const selectedId = message.interactive.list_reply.id;
        await this.handleMenuOption(fromNumber, selectedId, message.id);
      } else if (interactiveType === 'button_reply') {
        const option = message.interactive.button_reply.id.toLowerCase().trim();
        await this.handleMenuOption(fromNumber, option, message.id);
      }
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
    try {
      const listMessage = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'interactive',
        interactive: {
          type: 'list',
          header: {
            type: 'text',
            text: '🏷️ Nuestras Promociones'
          },
          body: {
            text: 'Selecciona una opción para ver más detalles:'
          },
          action: {
            button: 'Ver Promociones',
            sections: [
              {
                title: 'Opciones Disponibles',
                rows: [
                  {
                    id: 'promo1',
                    title: 'PLANES TARIFARIOS',
                    description: 'Conoce nuestros planes'
                  },
                  {
                    id: 'promo2',
                    title: 'ACTUALIZACION DE CHIP',
                    description: 'Actualiza tu chip'
                  },
                  {
                    id: 'promo3',
                    title: 'PORTABILIDAD',
                    description: 'Cambia de compañía'
                  },
                  {
                    id: 'promo4',
                    title: 'CAMBIO DE EQUIPO',
                    description: 'Nuevo equipo con mismo número'
                  }
                ]
              }
            ]
          }
        }
      };

      await whatsappService.sendCustomMessage(listMessage);
    } catch (error) {
      console.error('Error al enviar menú de promociones:', error);
      throw error;
    }
  }


  async sendPostPromotionMenu(to, promotionType) {
    const buttons = [
      { reply: { id: 'mas_info', title: 'Quiero Contratar' } },
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

  async sendPostModemsMenu(to, promotionType) {
    const buttons = [
      { reply: { id: 'ver_modems', title: 'Modems Disponibles' } },
      { reply: { id: 'mas_info', title: 'Quiero Contratar' } },
      { reply: { id: 'terminar', title: 'Terminar' } }
    ];
        
    // Guardar el tipo de promoción en el estado
    this.assistandState[to] = {
      step: 'post_promotion',
      promotionType: promotionType
    };
    
    await whatsappService.sendInteractiveButtons(to, "¿Deseas ver los modems disponibles de esta promoción?", buttons);
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

      "mas_info": async () => {
        await whatsappService.sendMessage(to, "Por favor, ¿cuál es tu nombre completo y de que parte de la republica nos escribes?");
        this.assistandState[to] = {
          step: 'capture_name',
          promotionType: this.assistandState[to]?.promotionType
        };
      },

      "promo1": async () => {
        await whatsappService.sendMessage(
          to,
          "Tenemos disponible para usted los siguientes planes:"
        );

        const buttons = [
          { reply: { id: 'telcel_libre', title: 'TELCEL LIBRE' } },
          { reply: { id: 'internet_en_casa', title: 'INTERNET EN CASA' } }
        ];

        await whatsappService.sendInteractiveButtons(to, "Seleccione una opción:", buttons);

        this.assistandState[to] = {
          step: 'planes_tarifarios'
        };
      },


      "telcel libre|telcel_libre": async () => {
        const fileUrl = `${config.BASE_URL}/promociones/telcel_libre.jpg`;

        await whatsappService.sendImage(to, fileUrl);
        await whatsappService.sendMessage(to, 
            `👋 ¿Cansado de los **plazos forzosos** en tu plan de celular? 😩\n\n` +
            `¡Tengo una **excelente noticia** para ti! Con los nuevos **Planes Telcel Libre**, ¡dile adiós a los amarres y disfruta de **total libertad**! 🚀\n\n` +
            `Aquí lo más importante: 👇\n\n` +
            `✅ **¡Sin plazos forzosos!**\n` +
            `⚡️ **Velocidad 5G real**: Navega a la máxima velocidad y sin interrupciones.\n` +
            `📱 **Gigas para todo**: Desde 4 GB hasta 55 GB (¡o 40 GB en el plan VIP!).\n` +
            ` unlimited **Redes Sociales Ilimitadas**: WhatsApp, Facebook, Instagram, X (antes Twitter), ¡sin gastar tus gigas! 🤳\n` +
            `📞 **Minutos y SMS ilimitados**: Habla y chatea sin preocuparte en México, EE. UU. y Canadá.\n` +
            `💰 **¡Recibe Cashback!**: Te regresamos parte de tu renta para usarlo en equipos, suscripciones o servicios Telcel.\n` +
            `🍿 **Claro Video con Paramount+ y Claro Drive**: ¡Entretenimiento y almacenamiento incluidos!\n\n` +
            `¿Listo para la libertad de un plan sin ataduras? ✨\n\n` +
            `💬 ¡Envíame un mensaje para darte todos los detalles y ayudarte a contratar tu **Plan Telcel Libre** hoy mismo! 😉`
        );

        await this.sendPostPromotionMenu(to, 'telcel_libre');
      },

      "internet en casa|internet_en_casa": async () => {
        const fileUrl = `${config.BASE_URL}/promociones/internet_casa.jpg`;

        await whatsappService.sendImage(to, fileUrl);
        await whatsappService.sendMessage(to, 
            `👋 ¿Necesitas **internet de alta velocidad en casa** sin complicaciones? 🤔\n\n` +
            `¡Con el **Plan de Renta Internet en Casa de Telcel**, tener WiFi es más fácil que nunca! 🚀\n\n` +
            `Olvídate de instalaciones complejas y largos procesos. Con este plan, tú solo:\n\n` +
            `🔌 **Conectas y listo**: ¡No necesitas técnicos! Solo enchufa tu módem y empieza a navegar.\n` +
            ` libertad de un módem inalámbrico que puedes mover donde lo necesites.\n` +
            `💨 **Velocidad y estabilidad**: Conéctate con la red de Telcel, reconocida por su cobertura y rapidez.\n` +
            ` limitless **Internet ilimitado**: ¡Navega, trabaja, estudia y diviértete sin preocuparte por los gigas!\n` +
            `✍️ **Contratación sencilla**: Adquiere tu módem y empieza a disfrutar en minutos.\n\n` +
            `Ideal para toda la familia, para trabajar desde casa o para tus ratos de ocio con series y películas. 👨‍👩‍👧‍👦💻🎬\n\n` +
            `💬 ¡Mándame un mensaje para conocer los planes disponibles y las velocidades que tenemos para tu hogar! Estoy aquí para ayudarte a elegir la mejor opción. 😉`
        );

        await this.sendPostModemsMenu(to, 'internet_en_casa');
      },

      "ver_modems|modems": async () => {
          await whatsappService.sendMessage(to,
          "Tenemos disponible para usted los siguientes modelos:"
          );
          // Enviar las 3 imágenes de modems
          await whatsappService.sendImage(to, `${config.BASE_URL}/promociones/modem1.jpeg`);
          await whatsappService.sendImage(to, `${config.BASE_URL}/promociones/modem2.jpeg`);
          await whatsappService.sendImage(to, `${config.BASE_URL}/promociones/modem3.jpeg`);
          await new Promise(resolve => setTimeout(resolve, 3000)); 
          await whatsappService.sendInteractiveButtons(to, "¿Te interesa contratar alguno de estos?", [
            { reply: { id: 'mas_info', title: 'Quiero Contratar' } },
            { reply: { id: 'otra_promo', title: 'Ver otra promoción' } },
            { reply: { id: 'terminar', title: 'Terminar' } }
          ]);
          },

      "promo2": async () => {
        const fileUrl = `${config.BASE_URL}/promociones/promo1.jpeg`;
        await whatsappService.sendImage(to,fileUrl);
        await whatsappService.sendMessage(to, 
            `👋 ¡Hola!\n\n` +
            `¿Sabías que **actualizar tu chip Telcel** te puede dar una **mejor experiencia** en tu celular? ¡Es rápido, sencillo y tiene grandes beneficios! ✨\n\n` +
            `Aquí te cuento por qué te conviene: 👇\n\n` +
            `🚀 *¡Acceso a la Red 5G!* Si tu chip es antiguo, podrías estar perdiéndote la velocidad más alta de Telcel. Con un chip nuevo, estarás listo para navegar en la **red 5G más grande del país** (si tu equipo es compatible y la cobertura está disponible en tu zona).\n\n` +
            `📶 *Mejor señal y rendimiento:* Los chips más recientes están optimizados para ofrecerte una **conexión más estable y clara**, tanto en llamadas como en datos.\n\n` +
            `🔒 *Máxima seguridad:* Un chip actualizado te brinda las **últimas mejoras en seguridad** para proteger tu información.\n\n` +
            `✅ *¡Es gratis y conservas tu número!* Mantienes tu mismo número de siempre, tus contactos y todo lo que tienes.\n\n` +
            `🚫 ¡No dejes que un chip viejo te impida disfrutar de todo el potencial de tu smartphone y de la red Telcel!\n\n` +
            `--- \n` +
            `*📌 Requisitos:*\n` +
            `• Identificación Oficial vigente (INE, pasaporte, cédula profesional).\n` +
            `• Tu número de Telcel a 10 dígitos.\n\n` +
            `💬 ¡Mándame un mensaje para ayudarte a hacer el cambio! Te explico cómo en unos minutos. `
        );
        await this.sendPostPromotionMenu(to, 'actualizacion');
      },

      "promo3": async () => {
        const fileUrl = `${config.BASE_URL}/promociones/promo3.jpeg`;
        await whatsappService.sendImage(to,fileUrl);
        await whatsappService.sendMessage(to, 
            `👋 ¡Hola!\n\n` +
            `¿Quieres **cambiarte a Telcel y conservar tu mismo número**? ¡Es **súper fácil y rápido**! 🚀\n\n` +
            `Con la **Portabilidad Telcel**, disfruta de la red más grande de México y una **promo increíble**:\n\n` +
            `✅ *¡Tu mismo número!* No pierdes contactos ni complicaciones.\n` +
            `📶 *La mejor cobertura:* Conéctate a la red más grande y con **5G** (si tu equipo es compatible).\n` +
            `🎉 *¡Triple de beneficios en tus recargas!* 🤩 Al portar tu número a Telcel en prepago Amigo, obtén **¡el triple de Gigas y beneficios en tus recargas de $50 o más durante los primeros 5 meses!**\n\n` +
            `--- \n` +
            `*📌 ¿Qué necesitas para portarte?*\n` +
            `• **Identificación Oficial vigente** (INE, pasaporte, cédula profesional).\n` +
            `• Tu **número de teléfono a 10 dígitos**.\n` +
            `• Ser el **titular de la línea** que quieres portar (o tener carta poder si no eres el titular).\n` +
            `• **No tener adeudos** con tu compañía actual (si es pospago).\n\n` +
            `¡Únete a la red líder con esta promoción increíble! 🤩\n\n` +
            `💬 *¡Mándame un mensaje para darte todos los detalles y ayudarte con tu cambio! ¡Es más sencillo de lo que imaginas!*`
        );
        await this.sendPostPromotionMenu(to, 'portabilidad');
      },

      "promo4": async () => {
        const fileUrl = `${config.BASE_URL}/promociones/promo4.jpeg`;
        await whatsappService.sendImage(to,fileUrl);
        await whatsappService.sendMessage(to, 
            `👋 ¡Hola!\n\n` +
            `¿Tu smartphone ya no te da el ancho? 😩 ¡Es **hora de estrenar**!\n\n` +
            `Con **Telcel**, puedes **cambiar tu equipo por uno nuevo** y **conservar tu mismo número** de siempre. ¡Es fácil y rápido! 🚀\n\n` +
            `✨ *Beneficios de renovar con Telcel:*\n` +
            `• **Estrena lo último en tecnología**: Elige entre una gran variedad de smartphones.\n` +
            `• **Aprovecha la Red 5G**: Disfruta de la máxima velocidad con tu nuevo equipo y la mejor cobertura Telcel.\n` +
            `• **Mantén tu número**: ¡Sin complicaciones! Conservas todos tus contactos y no necesitas avisar a nadie.\n` +
            `• **Opciones de financiamiento**: Encuentra un plan que se ajuste a tu presupuesto.\n\n` +
            `--- \n` +
            `📌 *¿Qué necesitas para renovar tu equipo?*\n` +
            `• Ser el **titular de la línea Telcel**.\n` +
            `• Tu **identificación oficial vigente** (INE, pasaporte, etc.).\n` +
            `• Tener tu **línea activa** y al corriente con tus pagos (si es plan de renta).\n\n` +
            `⬇️⬇️ ¡Aquí puedes ver el **catálogo de equipos disponible**! ⬇️⬇️\n` +
            `tiiexpress.catalog.kyte.site\n\n` +
            `💬 ¡Mándame un mensaje para ayudarte a elegir tu próximo smartphone! 😉`
        );
        await this.sendPostPromotionMenu(to, 'cambio_de_equipo');
      },

      "promoción|otra_promo|ver otra promocion": async () => {
        await this.sendPromotionsMenu(to);
        delete this.assistandState[to];
      },

      "garantia|seguimiento": async () => {
        await whatsappService.sendMessage(to, "Ingresa tu *número de teléfono* o *imei* correspondiente a tu equipo en garantía:");
        this.assistandState[to] = { step: 'warranty' };
      },
      "hacer otro seguimien|hacer otro seguimiento": async () => {
        await whatsappService.sendMessage(to, "Ingresa tu *número de teléfono* o *imei* correspondiente a tu equipo en garantía:");
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



  async handleWarrantyFlow(to, userInput) {
    try {
      // Limpiar la entrada del usuario (eliminar todo excepto dígitos)
      const cleanInput = userInput.replace(/\D/g, '');
      
      // Validar que la entrada tenga longitud adecuada (10 para teléfono o 15 para IMEI)
      if (cleanInput.length !== 10 && cleanInput.length !== 15) {
        await whatsappService.sendMessage(
          to,
          "Por favor ingresa un número de teléfono (10 dígitos) o IMEI (15 dígitos) válido."
        );
        return;
      }

      // Configuración de autenticación
      const serviceAccountAuth = new JWT({
        email: config.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: config.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      // Inicialización del documento
      const doc = new GoogleSpreadsheet(config.GOOGLE_SHEET_ID, serviceAccountAuth);
      await doc.loadInfo();
      const sheet = doc.sheetsByIndex[0];
      const rows = await sheet.getRows();
      
      // Buscar coincidencias en ambas columnas
      const warrantyRecords = rows.filter(row => {
        const rowPhone = row._rawData[1]?.replace(/\D/g, ''); // Teléfono en 2da columna (índice 1)
        const rowImei = row._rawData[3]?.replace(/\D/g, '');  // IMEI en 4ta columna (índice 3)
        
        // Comparar con ambas columnas
        return rowPhone === cleanInput || rowImei === cleanInput;
      });

      if (warrantyRecords.length === 0) {
        await whatsappService.sendMessage(
          to,
          `❌ No se encontró ningún equipo en garantía asociado a ${cleanInput}`
        );
      } else {
        // Tomar el registro más reciente
        const latestRecord = warrantyRecords[warrantyRecords.length - 1];
        const model = latestRecord._rawData[4];    // MODELO en 5ta columna (índice 4)
        const nameClient = latestRecord._rawData[2]; // Nombre en 3ra columna (índice 2)
        const imei = latestRecord._rawData[3];     // IMEI en 4ta columna (índice 3)
        const phoneNumber = latestRecord._rawData[1]; // Teléfono en 2da columna (índice 1)
        
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
      if (userName.split(/\s+/).length < 2 || this.isGreeting(userName)) {
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
      const message = `El cliente ${userName} quiere más información acerca de ${context}. ` +
                `Por favor comunícate con él al ${userPhone}`;

      // Lista de asesores a notificar
      const advisors = ['529711269180', '529711251367'];

      // Enviar el mensaje a cada asesor
      for (const advisor of advisors) {
        await whatsappService.sendMessage(advisor, message);
      }
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
        const model = latestRecord._rawData[4] || 'modelo no proporcionado'; // Posición 4: MODELO
        const nameClient = latestRecord._rawData[2]; // Posición 2: Nombre
        const imei = latestRecord._rawData[3] || 'imei no proporcionado'; // Posición 3: IMEI

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


