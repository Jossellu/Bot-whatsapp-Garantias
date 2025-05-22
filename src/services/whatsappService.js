// src/services/whatsappService.js
import axios from 'axios';
import config from '../config/env.js';

class WhatsAppService {
  async sendMessage(to, message, messageId = null) {
    try {
      await axios.post(
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
    } catch (error) {
      console.error('Error sending message:', error.response?.data || error.message);
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
}

export default new WhatsAppService();