const logger = require('../common/logger').logger;
const util = require('../common/util');
const Exchange = require('./exchange');
const DeribitApi = require('../apis/deribit');

const scaledOrderSize = require('./support/scaled_order_size_contracts');
const balance = require('./commands/balance_deribit');

/**
 * Deribit version of the exchange
 */
class Deribit extends Exchange {
    /**
     * Set up the API and commands
     * @param credentials
     */
    constructor(credentials) {
        super(credentials);
        this.name = 'deribit';

        this.minPollingDelay = 0;
        this.maxPollingDelay = 10;

        this.minOrderSize = 1;
        this.assetPrecision = 0;
        this.pricePrecision = 2;
        this.tickSize = 0.5;


        // start up any sockets or create API handlers here.
        this.api = new DeribitApi(credentials.key, credentials.secret);

        // override a couple of the default features
        this.support.scaledOrderSize = scaledOrderSize;
        this.commands.balance = balance;
    }

    /**
     * Called after the exchange has been created, but before it has been used.
     */
    async init(symbol) {
        // start the api
        const symbolDetails = await this.api.init(symbol);

        if (symbolDetails) {
            const calcPrecision = (v) => {
                let precision = 0;
                let value = v;
                while (value < 1) {
                    value *= 10;
                    precision += 1;
                }
                return precision;
            };

            if (symbolDetails.kind === 'option') {
                logger.error('That symbol is for an option. This isn\'t designed for that. Denied.');
                throw 'Options not supported';
            }

            logger.dim(symbolDetails);
            this.minOrderSize = symbolDetails.minTradeSize;
            this.assetPrecision = calcPrecision(symbolDetails.minTradeSize);
            this.pricePrecision = symbolDetails.pricePrecision;
            this.tickSize = symbolDetails.tickSize;
        }
    }

    /**
     * Handle shutdown
     */
    terminate() {
        logger.progress('Deribit exchange closing down');
        super.terminate();
    }

    /**
     * Rounds the price to 50c values
     * @param price
     * @returns {*}
     */
    roundPrice(price) {
        return util.round(price / this.tickSize, 0) * this.tickSize;
    }

    /**
     * Find the order size from the amount. This is more restricted in Deribit compared to Bitfinex.
     * @param symbol
     * @param side
     * @param orderPrice
     * @param amountStr
     * @returns {Promise<{total: *, available: *, isAllAvailable: boolean, orderSize: *}>}
     */
    orderSizeFromAmount(symbol, side, orderPrice, amountStr) {
        // Validate we are not trying to use a % of the wallet (leverage does not really have this concept)
        const amount = this.parseQuantity(amountStr);
        if (amount.units !== '') {
            return Promise.reject(new Error('Deribit amount does not support % or units. Use just the number of contracts (eg "1")'));
        }

        // And return the data in a suitable format
        return Promise.resolve({
            total: 0,
            available: 0,
            isAllAvailable: false,
            orderSize: this.roundAsset(amount.value),
        });
    }

    /**
     * Converts a target position size to an amount to trade
     * Default behaviour here is just to use the amount. Leveraged exchanges
     * might work out the diff needed to get to the target position and use that instead.
     * @param symbol
     * @param targetPosition - positive for long positions, negative for short positions
     * @param side
     * @param amount
     * @returns {*}
     */
    positionToAmount(symbol, targetPosition, side, amount) {
        // First see if we work using a target position, or a fixed amount
        if (targetPosition === '') {
            // use the amount as an absolute change (units not support here)
            const qty = this.parseQuantity(amount);
            return Promise.resolve({ side, amount: { value: qty.value, units: '' } });
        }

        // Find current position.
        return this.api.positions().then((openPositions) => {
            // Filter the results down to just hte symbol we are using
            logger.dim(openPositions);
            const positionSize = openPositions.reduce((size, item) => ((item.instrument.toUpperCase() !== symbol.toUpperCase()) ? size : item.size), 0);
            const change = this.roundAsset(parseInt(targetPosition, 10) - positionSize);

            return { side: change < 0 ? 'sell' : 'buy', amount: { value: Math.abs(change), units: '' } };
        });
    }
}

module.exports = Deribit;
