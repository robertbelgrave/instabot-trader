const logger = require('../common/logger').logger;
const util = require('../common/util');
const Exchange = require('./exchange');
const BitfinexApiv2 = require('../apis/bitfinexv2');


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

        this.minPollingDelay = 0;
        this.maxPollingDelay = 3;

        // start up any sockets or create API handlers here.
        this.api = new BitfinexApiv2(credentials.key, credentials.secret);

        this.minOrderSize = 0.004;
        this.assetPrecision = 8;
        this.pricePrecision = 5;

    }

    /**
     * Called after the exchange has been created, but before it has been used.
     */
    async init(symbol) {
        // start the api
        await this.api.init(symbol);

        // Using v2 of the API, there does not appear to be a way to find out the min order size.
        // This article (https://support.bitfinex.com/hc/en-us/articles/115003283709-What-is-the-minimum-order-size-)
        // suggests between $10 and $25 as the min order size, so I am taking the worst case value
        // and using that to work out a min.
        const ticker = await this.api.ticker(symbol);
        this.minOrderSize = util.roundDown(25 / parseFloat(ticker.bid), 5);
    }

    /**
     * Handle shutdown
     */
    async terminate() {
        logger.progress('Bitfinex exchange closing down');
        super.terminate();

        await this.api.terminate();
    }

    /**
     * Rounds the price to 50c values
     * @param price
     * @returns {*}
     */
    roundPrice(price) {
        return util.roundSignificantFigures(price, this.pricePrecision);
    }
}

module.exports = Bitfinex;
