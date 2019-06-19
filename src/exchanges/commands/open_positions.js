const logger = require('../../common/logger').logger;
const util = require('../../common/util');
const notifier = require('../../notifications/notifier');

/**
 * Return Open Positions (Derebit Only)
 */

module.exports = (context) => {
        const { ex = {}, symbol = '' } = context;
        logger.progress('NOTIFY OPEN POSITIONS');

        return ex.api.positions().then((res) => {
            for (var i=0; i<res.length; i++){
                const msg = `--------\nInstrument: ${res[i].instrument}\n` + `size: ${res[i].size}\n` + `avgPrice: ${util.roundDown(res[i].averagePrice)}\n`
                            + `pnl: ${res[i].profitLoss}\n---------\n`;
                notifier.send(msg);
                logger.results(msg);
            }
});
};
