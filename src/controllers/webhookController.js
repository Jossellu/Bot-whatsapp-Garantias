import config from '../config/env.js';
import messageHandler from '../services/messageHandler.js';

class WebhookController {
  async handleIncoming(req, res) {
    console.log('📥 Webhook recibido:', JSON.stringify(req.body, null, 2));
    const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];
    const senderInfo = req.body.entry?.[0]?.changes[0]?.value?.contacts?.[0];
    const phoneNumberId = req.body.entry?.[0]?.changes[0]?.value?.metadata?.phone_number_id;

        // Verificar si el mensaje proviene del número correcto
        if (phoneNumberId !== config.BUSINESS_PHONE) {
          return res.sendStatus(200); // Ignorar el mensaje
        }
    if (message && senderInfo) {
      const rawNumber = senderInfo.wa_id;

      await messageHandler.handleIncomingMessage(message, senderInfo);
    }

    res.sendStatus(200);
  }

  verifyWebhook(req, res) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === config.WEBHOOK_VERIFY_TOKEN) {
      res.status(200).send(challenge);
      console.log('Webhook verified successfully!');
    } else {
      res.sendStatus(403);
    }
  }
}

export default new WebhookController();

