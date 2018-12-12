const config = require('config');
const crypto = require('crypto');
const getStdin = require('get-stdin');
const logger = require('./common/logger').logger;

// set up the logger
logger.setLevel(2);

logger.results('Usage: node sign.js. Takes standard input and generates a signature for it.');
logger.results('eg: cat myMessage | npm run sign');

getStdin().then((message) => {
    // Prepare the message for signing
    const regex = /sig:([a-zA-Z0-9]+)/;
    const toSign = message.replace(regex, '').trim();

    // sign the message
    const secret = config.get('server.security.secret');
    const hash = crypto.createHmac('sha256', secret).update(toSign).digest('hex').substring(16, 32);

    // output the signed version
    logger.progress(`${message}\n\nsig:${hash}\n`);
});

