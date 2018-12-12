const crypto = require('crypto');

/**
 * Something to validate messages if needed
 */
module.exports = (message, signingMethod, secret) => {
    if (signingMethod === '' || signingMethod === 'none') {
        return true;
    }

    // Look for the signature in the message
    let signature = '';
    const regex = /sig:([a-zA-Z0-9]+)/;
    const m = regex.exec(message);
    if (m !== null) {
        signature = m[1];
    }

    // The signature is just a simple password
    if (signingMethod === 'password') {
        return secret === signature;
    }

    // The signature is the hash of the message
    if (signingMethod === 'hash') {
        // remove the signature from the message, and trim white space
        const toSign = message.replace(regex, '').trim();
        const hash = crypto.createHmac('sha256', secret).update(toSign).digest('hex').substring(16, 32);
        return hash === signature;
    }

    // probably a bad signing method
    return false;
};
