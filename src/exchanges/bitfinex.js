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
        this.api = new BitfinexApiv2(credentials.key, credentials.secret, credentials.margin, credentials.maxLeverage);
    }

    /**
     * Called after the exchange has been created, but before it has been used.
     */
    async init() {
        // start the socket connections etc
        await this.api.init();
    }

    /**
     * Let the api know that we are interested in a new symbol
     * @param symbol
     * @returns {Promise<void>}
     */
    async addSymbol(symbol) {
        await this.api.addSymbol(symbol);

        // Using v2 of the API, there does not appear to be a way to find out the min order size.
        // This article (https://support.bitfinex.com/hc/en-us/articles/115003283709-What-is-the-minimum-order-size-)
        // suggests between $10 and $25 as the min order size, so I am taking the worst case value
        // and using that to work out a min.
        const ticker = await this.api.ticker(symbol);
        this.symbolData.update(symbol, {
            minOrderSize: util.roundDown(25 / parseFloat(ticker.bid), 5),
            assetPrecision: 8,
            pricePrecision: 5,
        });
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
     * @param symbol
     * @param price
     * @returns {*}
     */
    roundPrice(symbol, price) {
        return util.roundSignificantFigures(price, this.symbolData.pricePrecision(symbol));
    }
}

module.exports = Bitfinex;
