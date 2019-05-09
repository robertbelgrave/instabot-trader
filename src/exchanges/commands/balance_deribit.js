const logger = require('../../common/logger').logger;
const util = require('../../common/util');
const notifier = require('../../notifications/notifier');


/**
 * Report account details (Deribit edition)
 */
module.exports = (context) => {
    const { ex = {}, symbol = '' } = context;
    logger.progress('NOTIFY ACCOUNT BALANCE');
    const currency = ex.splitDashedSymbol(symbol).asset;

    return ex.api.account(currency).then((account) => {
        const msg = `Deribit: Equity: ${util.roundDown(account.equity, 4)} ${currency}, ` +
            `available: ${util.roundDown(account.availableFunds, 4)} ${currency}, ` +
            `balance: ${util.roundDown(account.balance, 4)} ${currency}, pnl: ${util.roundDown(account.PNL, 4)} ${currency}.`;
        notifier.send(msg);
        logger.results(msg);
    });
};

