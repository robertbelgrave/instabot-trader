const request = require('request');
const config = require('config');
const logger = require('../common/logger').logger;

/**
 * Webhook Notifier
 */
class Webhook {
    /**
     * Find the API keys from the config
     */
    constructor() {
        this.url = config.get('webhook.url');
    }

    /**
     * Send a message
     * @param msg
     * @param options
     */
    send(msg, options) {
        // If not configured, ignore
        if (this.url === '') {
            return;
        }

        const data = {
            message: msg,
            from: 'Instabot Trader',
        };

        if (options && options.title && options.title !== '') {
            data.title = options.title;
            data.text = options.text;
            data.color = options.color;
            data.footer = options.footer;
        }

        // send a message
        request({
            method: 'post',
            body: data,
            json: true,
            url: this.url,
        }, (err, res, body) => {
            logger.results('Webhook called');
            if (err) {
                logger.error(err);
            }
        });
    }

    init() {}
    setExchangeManager() {}
}

module.exports = Webhook;
