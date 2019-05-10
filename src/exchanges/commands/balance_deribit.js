const logger = require('../../common/logger').logger;
const util = require('../../common/util');
const notifier = require('../../notifications/notifier');

/**
 * Report account details (Deribit edition)
 */
module.exports = (context) => {
    /**
     * Given a symbol (like ETH-PERPETUAL), figure out the currency (eth)
     * @param symbol
     * @returns currency
     */
    const getCurrencyFromSymbol = (symbol) => {
        const regex = /^(.{3})-(.*)/u;
        const m = regex.exec(symbol);
        if (m) {
            return m[1];
        }

        // Default to btc / usd - not sure about this...
        // should really just throw an error
        return 'btc';
    };

    const { ex = {}, symbol = '' } = context;
    logger.progress('NOTIFY ACCOUNT BALANCE');
    const currency = getCurrencyFromSymbol(symbol);

    return ex.api.account(currency).then((account) => {
        const msg = `Deribit: Equity: ${util.roundDown(account.equity, 4)} ${currency}, ` +
            `available: ${util.roundDown(account.availableFunds, 4)} ${currency}, ` +
            `balance: ${util.roundDown(account.balance, 4)} ${currency}, pnl: ${util.roundDown(account.PNL, 4)} ${currency}.`;
        notifier.send(msg);
        logger.results(msg);
    });
};

