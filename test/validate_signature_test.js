const assert = require('chai').assert;
const validateSignature = require('../src/common/validate_signature');

describe('Validate Signatures', () => {
    it('can handle no signature', () => {
        const msg = 'bitfinex(BTCUSD) { wait(5s); }';
        assert.isTrue(validateSignature(msg, '', 'secret'));
        assert.isTrue(validateSignature(msg, 'none', 'secret'));
    });

    it('rejects unknown signing methods', () => {
        const msg = 'bitfinex(BTCUSD) { wait(5s); }';
        assert.isFalse(validateSignature(msg, 'fish', 'secret'));
    });

    it('fails if there is no password', () => {
        const msg = 'bitfinex(BTCUSD) { wait(5s); }';
        assert.isFalse(validateSignature(msg, 'password', 'secret'));
    });

    it('works with a valid password', () => {
        const msg = 'bitfinex(BTCUSD) { wait(5s); } sig:secret';
        assert.isTrue(validateSignature(msg, 'password', 'secret'));
    });

    it('fails if there is no hash', () => {
        const msg = 'bitfinex(BTCUSD) { wait(5s); }';
        assert.isFalse(validateSignature(msg, 'hash', 'secret'));
        assert.isFalse(validateSignature('bitfinex(BTCUSD) { wait(5s); } sig:12345', 'hash', 'secret'));
    });

    it('works with a valid hash', () => {
        const msg = 'bitfinex(BTCUSD) { wait(5s); } sig:816f7662b94f2f28';
        assert.isTrue(validateSignature(msg, 'hash', 'secret'));
    });
});
