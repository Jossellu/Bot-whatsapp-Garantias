// src/services/whatsappService.js
import axios from 'axios';
import config from '../config/env.js';

class WhatsAppService {
  async sendMessage(to, message, messageId = null) {
    try {
      // Verificar si el número está en modo sandbox
      if (config.API_ENV === 'sandbox' && !config.TEST_NUMBERS.includes(to)) {
        console.warn(`Número ${to} no está en lista de pruebas. Mensaje no enviado.`);
        return { warning: 'Number not in test list' };
      }

      const response = await axios.post(
        `https://graph.facebook.com/${config.API_VERSION}/${config.BUSINESS_PHONE}/messages`,
        {
          messaging_product: 'whatsapp',
          to: to,
          text: { body: message },
          ...(messageId && { context: { message_id: messageId } }),
          type: 'text'
        },
        {
          headers: {
            Authorization: `Bearer ${config.API_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error sending message:', error.response?.data || error.message);
      throw error;
    }
  }

async sendQualitySurvey(to, templateName, parameters = [], languageCode = '', includeFlowButton = false) {
  try {
    if (!templateName || !languageCode) {
      throw new Error('Nombre de plantilla o código de idioma faltante');
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: languageCode
        },
        components: []
      }
    };

    // Agregar cuerpo si hay parámetros de texto
    if (parameters.length > 0) {
      payload.template.components.push({
        type: 'body',
        parameters: parameters.map(param => ({
          type: 'text',
          text: param.text.toString().trim()
        }))
      });
    }

    // Agregar botón tipo "flow" si aplica
    if (includeFlowButton) {
      payload.template.components.push({
        type: 'button',
        sub_type: 'flow',
        index: '0',
        parameters: [
          {
            type: 'action',
            action: {}
          }
        ]
      });
    }

    console.log('Enviando plantilla con payload:', JSON.stringify(payload, null, 2));

    const response = await axios.post(
      `https://graph.facebook.com/${config.API_VERSION}/${config.BUSINESS_PHONE}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${config.API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error detallado al enviar plantilla:', {
      templateName,
      parameters,
      error: error.response?.data || error.message
    });
    throw error;
  }
}


  async sendUniversalPublicityTemplate({
    phoneNumber,
    templateName,
    languageCode = 'es_MX',
    parameters = [],
    headerMedia = null,
  }) {
    try {
      const formattedNumber = `52${phoneNumber}`.replace(/\D/g, '');

      const payload = {
        messaging_product: 'whatsapp',
        to: formattedNumber,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
        },
      };

      
      // Agregar parámetros si hay
      if (parameters.length > 0) {
        payload.template.components = [
          {
            type: 'body',
            parameters: parameters.map((param) => {
              // Detectar si es texto, número, emoji, etc.
              if (typeof param === 'string' || typeof param === 'number') {
                return { type: 'text', text: param.toString() };
              }
              return param; // soporte para objetos personalizados
            }),
          },
        ];
      }

      // Agregar encabezado multimedia si se especifica
      if (headerMedia && headerMedia.type && headerMedia.link) {
        if (!payload.template.components) payload.template.components = [];
        payload.template.components.push({
          type: 'header',
          parameters: [
            {
              type: headerMedia.type, // 'image', 'video', 'document'
              [headerMedia.type]: {
                link: headerMedia.link,
              },
            },
          ],
        });
      }

      // Enviar solicitud a la API de WhatsApp
      const response = await axios.post(
        `https://graph.facebook.com/${config.API_VERSION}/${config.BUSINESS_PHONE}/messages`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${config.API_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log(`✅ Plantilla enviada a ${formattedNumber}`);
      return response.data;
    } catch (error) {
        console.error('❌ Error al enviar plantilla:', JSON.stringify(error.response?.data || error.message, null, 2));
        console.error('Datos de la fila:', row._rawData);
      throw error;
    }
  }


  async sendTemplateMessage(to, templateName, parameters = [], languageCode = '') {
    try {
      // Validar parámetros obligatorios
      if (!templateName || !languageCode) {
        throw new Error('Nombre de plantilla o código de idioma faltante');
      }

      // Construir el payload correctamente
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'template',
        template: {
          name: templateName,
          language: {
            code: languageCode
          }
        }
      };

      // Solo agregar componentes si hay parámetros
      if (parameters && parameters.length > 0) {
        payload.template.components = [{
          type: 'body',
          parameters: parameters.map(param => ({
            type: 'text',
            text: param.text.toString().trim() // Asegurar que sea string y sin espacios
          }))
        }];
      }

      console.log('Enviando plantilla con payload:', JSON.stringify(payload, null, 2));

      const response = await axios.post(
        `https://graph.facebook.com/${config.API_VERSION}/${config.BUSINESS_PHONE}/messages`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${config.API_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error detallado al enviar plantilla:', {
        templateName,
        parameters,
        error: error.response?.data || error.message
      });
      throw error;
    }
  }

  async checkBusinessAccountStatus() {
    try {
      const response = await axios.get(
        `https://graph.facebook.com/${config.API_VERSION}/${config.BUSINESS_PHONE}`,
        {
          headers: {
            Authorization: `Bearer ${config.API_TOKEN}`
          }
        }
      );
      console.log('Estado de la cuenta empresarial:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error al verificar estado de la cuenta:', error.response?.data || error.message);
      throw error;
    }
  }

  async sendImage(to, imageUrl) {
    try {
      console.log(`Intentando enviar imagen desde URL: ${imageUrl}`);
      const response = await axios({
        method: 'POST',
        url: `https://graph.facebook.com/${config.API_VERSION}/${config.BUSINESS_PHONE}/messages`,
        headers: {
          Authorization: `Bearer ${config.API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        data: {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to,
          type: 'image',
          image: {
            link: imageUrl
          }
        }
      });
      console.log('Imagen enviada con éxito:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error enviando imagen:');
      console.error('URL intentada:', imageUrl);
      console.error('Error detallado:', error.response?.data || error.message);
      throw error;
    }
  }
  
  

  async markAsRead(messageId) {
    try {
      await axios({
        method: 'POST',
        url: `https://graph.facebook.com/${config.API_VERSION}/${config.BUSINESS_PHONE}/messages`,
        headers: {
          Authorization: `Bearer ${config.API_TOKEN}`,
        },
        data: {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
        },
      });
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  }

  async sendInteractiveButtons(to, bodyText, buttons) {
    try {
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to.replace(/\D/g, ''),
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { 
            text: bodyText.substring(0, 1024)
          },
          action: {
            buttons: buttons.slice(0, 3).map(button => ({
              type: 'reply',
              reply: {
                id: button.reply.id.replace(/\s/g, '_').substring(0, 256),
                title: button.reply.title.substring(0, 20)
              }
            }))
          }
        }
      };
  
      const response = await axios({
        method: 'POST',
        url: `https://graph.facebook.com/${config.API_VERSION}/${config.BUSINESS_PHONE}/messages`,
        headers: {
          Authorization: `Bearer ${config.API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        data: payload
      });
      
      return response.data;
    } catch (error) {
      console.error('Error al enviar botones:');
      console.error('Request:', error.config?.data);
      console.error('Response:', error.response?.data || error.message);
      throw error;
    }
  }

  async sendCustomMessage(payload) {
    try {
      const response = await axios({
        method: 'POST',
        url: `https://graph.facebook.com/${config.API_VERSION}/${config.BUSINESS_PHONE}/messages`,
        headers: {
          Authorization: `Bearer ${config.API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        data: payload
      });
      return response.data;
    } catch (error) {
      console.error('Error sending custom message:', error.response?.data || error.message);
      throw error;
    }
  }
}

export default new WhatsAppService();