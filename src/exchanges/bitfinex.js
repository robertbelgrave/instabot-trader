const log = require('../common/logger');
const util = require('../common/util');
const Exchange = require('./exchange');
const BitfinexApiv1 = require('../apis/bitfinexv1');

const logger = log.logger;


/**
 * Bitfinex version of the exchange
 */
class Bitfinex extends Exchange {
    /**
     * set up the supported commands and API
     * @param credentials
     */
    constructor(credentials) {
        super(credentials);
        this.name = 'bitfinex';

        this.minPollingDelay = 2;
        this.maxPollingDelay = 20;

        // start up any sockets or create API handlers here.
        this.api = new BitfinexApiv1(credentials.key, credentials.secret);
    }

    /**
     * Called after the exchange has been created, but before it has been used.
     */
    async init(symbol) {
        // start the api
        const symbolDetails = await this.api.init(symbol);

        if (symbolDetails) {
            logger.dim(symbolDetails);
            this.minOrderSize = parseFloat(symbolDetails.minimum_order_size);
            this.assetPrecision = symbolDetails.price_precision;
            this.pricePrecision = symbolDetails.price_precision;
        }
    }

    /**
     * Rounds the price to 50c values
     * @param price
     * @returns {*}
     */
    roundPrice(price) {
        return util.roundSignificantFigures(price, this.pricePrecision);
    }

    /**
     * Handle shutdown
     */
    terminate() {
        logger.progress('Bitfinex exchange closing down');
        super.terminate();
    }
}

module.exports = Bitfinex;
