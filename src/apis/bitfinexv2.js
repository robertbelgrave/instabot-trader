/* eslint-disable no-await-in-loop */
const BFX = require('bitfinex-api-node');
const Order = require('bfx-api-node-models').Order;
const logger = require('../common/logger').logger;
const timeoutPromise = require('../common/timeout-promise');
const ApiInterface = require('./api');


class BitfinexApiv2 extends ApiInterface {
    /**
     * Set up the API
     * @param key
     * @param secret
     * @param options
     */
    constructor(key, secret, options) {
        super(key, secret);

        // Keep hold of the API key and secret
        this.key = key;
        this.secret = secret;

        // margin
        this.isMargin = !!(options.margin || false);
        this.maxLeverage = Math.min(options.maxLeverage || 1, 3.33);

        // optionally draw markers on the chart when orders are filled
        this.nextMarkId = Date.now();
        this.drawFills = options.drawFills || false;
        this.largeFillSize = options.largeFillSize || 10;
        if (this.largeFillSize <= 0.01) {
            this.largeFillSize = 1;
        }

        // create the Bfx api wrapper
        this.bfx = new BFX({
            apiKey: key,
            apiSecret: secret,
            transform: true,
            ws: {
                autoReconnect: true,
                seqAudit: false,
            },
        });

        // get the websocket connection out of it
        this.ws = this.bfx.ws();

        // cache of some data
        this.state = {
            ticker: [],
            wallet: [],
            walletUpdates: 0,
            walletTimer: null,
            orders: [],
        };

        // a list of the symbols we are tracking
        this.symbols = [];
    }

    /**
     * Subscribe to all the events relating to a symbol that we want
     * @param symbol
     */
    subscribeSymbol(symbol) {
        const ws = this.ws;
        const eventFilter = { symbol: `t${symbol}` };

        // Every time the price changes, this happens.
        ws.onTicker(eventFilter, (ticker) => {
            const t = ticker.toJS();
            this.state.ticker = this.state.ticker.filter(item => item.symbol !== symbol);
            this.state.ticker.push({
                symbol,
                bid: String(t.bid),
                ask: String(t.ask),
                last_price: String(t.lastPrice),
            });
        });

        ws.subscribeTicker(`t${symbol}`);

        if (this.isMargin) {
            this.ws.requestCalc([`margin_sym_t${symbol}`]);
        }
    }

    /**
     * Open the socket connection and attaches handles to events we need to know about
     * @returns {Promise<any>}
     */
    init() {
        const self = this;
        const ws = self.ws;

        // ws.on('message', (m) => {
        //     logger.debug('socket message');
        //     logger.debug(m);
        // });

        ws.on('error', (err) => {
            logger.error('Error detected on socket connection');
            logger.error(err);
        });

        ws.on('open', () => {
            const now = new Date();
            logger.debug(`socket opened - ${now.toTimeString()}`);
            ws.auth();
        });

        ws.on('close', () => { logger.debug('socket closed'); });

        // Some handlers to track the state our of wallet
        ws.onWalletSnapshot({}, (wallet) => {
            logger.debug('wallet snapshot');
            self.onWalletUpdate(wallet);
            self.refreshAvailableFunds();
        });

        ws.onWalletUpdate({}, wallet => self.onWalletUpdate([wallet]));

        // handlers to track the state of ordes
        ws.onOrderSnapshot({}, (orders) => {
            logger.debug(`order snapshot - ${orders.length} orders`);
            this.onOrderSnapshot(orders);
        });

        ws.onOrderNew({}, (order) => {
            logger.debug(`New order seen - id:${order.id}`);
            this.onOrderUpdate(order);
            this.refreshAvailableFunds();
        });

        ws.onOrderUpdate({}, (order) => {
            logger.debug(`Order updated - id:${order.id}`);
            this.onOrderUpdate(order);
            this.refreshAvailableFunds();
        });

        ws.onOrderClose({}, (order) => {
            logger.debug(`Order closed - id:${order.id}`);
            this.onOrderUpdate(order);
            this.refreshAvailableFunds();
        });

        // Happens once when we are authenticated. We use this to complete set up
        ws.once('auth', () => {
            logger.progress(`bfx v2 API Authenticated - ${this.isMargin ? 'margin' : 'spot'}`);

            // subscribe to stuff?
            this.symbols.forEach((sym) => {
                this.subscribeSymbol(sym);
            });
        });

        // Open the socket and resolve when we are authed
        return new Promise((resolve) => {
            ws.once('auth', () => {
                // give it a little bit of time to settle.
                setTimeout(() => { resolve(); }, 1000);
            });

            // Now all the handlers are set up, open the connection
            ws.open();
        });
    }

    /**
     * Called when a new symbol is being added
     * @param symbol
     */
    async addSymbol(symbol) {
        logger.debug(`adding ${symbol}`);
        if (this.symbols.indexOf(symbol) >= 0) {
            return;
        }

        // add the symbol
        this.symbols.push(symbol);
        if (this.ws.isAuthenticated()) {
            this.subscribeSymbol(symbol);
        }

        // Wait for the ticker to be live
        let tries = 10;
        while (tries > 0 && this.state.ticker.findIndex(item => item.symbol === symbol) < 0) {
            logger.debug('waiting for ticker to be valid');
            await this.sleep(300);
            tries -= 1;
        }
    }

    /**
     * Close up the socket
     * @returns {Promise<void>}
     */
    async terminate() {
        try {
            logger.debug('Closing bitfinex websocket connection...');
            // chance for any last minute shutdown stuff
            await this.ws.close();
            this.ws = null;
        } catch (err) {
            logger.error('Error while trying to close sockets');
            logger.error(err);
        }
    }

    /**
     * Just wait for some milliseconds
     * @param ms
     * @returns {Promise<any>}
     */
    sleep(ms) {
        return new Promise((resolve) => {
            setTimeout(() => { resolve(); }, ms);
        });
    }

    /**
     * Ask for the available balance to be updated.
     */
    refreshAvailableFunds() {
        this.state.walletUpdates = 0;
        clearTimeout(this.state.walletTimer);
        this.state.walletTimer = setTimeout(() => {
            this.symbols.forEach((symbol) => {
                const asset = symbol.substring(0, 3).toUpperCase();
                const currency = symbol.substring(3).toUpperCase();
                const walletType = (this.isMargin ? 'margin' : 'exchange');
                this.ws.requestCalc([`wallet_${walletType}_${asset}`, `wallet_${walletType}_${currency}`]);
            });
        }, 100);
    }

    /**
     * Called when we get a change to the wallet
     * @param wallet
     */
    onWalletUpdate(wallet) {
        const mapped = wallet.map(item => ({
            type: item.type,
            currency: item.currency.toLowerCase(),
            amount: String(item.balance),
            available: item.balanceAvailable === null ? String(item.balance * this.maxLeverage) : String(item.balanceAvailable * this.maxLeverage),
        })).filter(item => item.type === (this.isMargin ? 'margin' : 'exchange'));

        mapped.forEach((item) => {
            this.state.wallet = this.state.wallet.filter(w => w.currency !== item.currency);
            this.state.wallet.push(item);
        });

        this.state.walletUpdates += 1;
    }

    /**
     * Helper to remap from bfx raw to the data we use everywhere
     * @param orders
     * @returns {*}
     */
    orderRemap(orders) {
        return orders.map((order) => {
            const isCanceled = order.status === null ? false : order.status.includes('CANCELED');
            const isExecuted = order.status === null ? false : order.status.includes('EXECUTED');
            const isClosed = isExecuted || isCanceled;
            return {
                id: order.id,
                side: order.amountOrig > 0 ? 'buy' : 'sell',
                amount: Math.abs(order.amountOrig),
                remaining: Math.abs(order.amount),
                executed: Math.abs(order.amountOrig) - Math.abs(order.amount),
                price: order.price,
                status: order.status,
                type: order.type,
                flags: order.flags,
                symbol: order.symbol,
                is_filled: order.amount === 0,
                is_canceled: isCanceled,
                is_execited: isExecuted,
                is_open: !isClosed,
                last_updated: order.mtsUpdate === null ? Date.now() : order.mtsUpdate,
            };
        });
    }

    /**
     * Handles up snapshot of all orders
     * @param orders
     */
    onOrderSnapshot(orders) {
        this.state.orders = this.orderRemap(orders);
    }

    /**
     * Handles an change to one of the orders
     * @param order
     * @param replaceOnlyIfMissing
     */
    onOrderUpdate(order, replaceOnlyIfMissing = false) {
        const mapped = this.orderRemap([order.toJS()]).shift();

        if (replaceOnlyIfMissing) {
            const existing = this.state.orders.find(o => o.id === mapped.id);
            if (existing) {
                // ok, already had a matching entry, so use that instead.
                // this happens when we create an order and we've been told about it over the socket before
                // we had a chance to add it locally - we'd prefer the version from over the socket,
                // as it will be more accurate
                return existing;
            }
        }

        // remove an older version of this order
        this.state.orders = this.state.orders.filter(o => o.id !== mapped.id);

        // remember the new data
        this.state.orders.push(mapped);

        // see if we need to add a marker to the chart
        this.addMarkerIfFilled(mapped);

        return mapped;
    }

    /**
     * Attempt to add a marker to the chart when an order fills
     * @param order
     */
    addMarkerIfFilled(order) {
        // not drawing fills? - do nothing
        if (!this.drawFills) {
            return;
        }

        // only want to bother if the order has been filled
        if (!order.is_filled) {
            return;
        }

        // work out the size of the blob to draw.
        const normalisedAmount = order.amount > this.largeFillSize ? 1 : order.amount / this.largeFillSize;
        const markSize = Math.round(1 + (normalisedAmount * 15));
        const markColour = order.side === 'buy' ? '#11FF33' : '#FF1133';
        this.nextMarkId += 1;
        const props = {
            type: 'ucm-ui-chart',
            info: {
                type: 'marker_create',
                id: `mark_${this.nextMarkId}`,
                ts: order.last_updated,
                symbol: order.symbol,
                content: `${order.status} - id ${order.id}.`,
                color_bg: markColour,
                size_min: markSize,
            },
        };

        // send it
        this.ws.send([0, 'n', null, props]);
    }

    /**
     * Get the ticker for a symbol
     * @param symbol
     * @returns {*}
     */
    async ticker(symbol) {
        const index = this.state.ticker.findIndex(item => item.symbol === symbol);
        if (index < 0) {
            logger.error(this.state.ticker);
            throw new Error(`Unexpected symbol in ticker - looking for ${symbol}.`);
        }

        return this.state.ticker[index];
    }

    /**
     * Find out the price of a symbol directly (don't open a ws feed for it)
     * @param {*} symbol
     */
    async tickerDirect(symbol) {
        try {
            const ticker = await this.bfx.rest().ticker(`t${symbol}`);
            return {
                symbol,
                bid: String(ticker.bid),
                ask: String(ticker.ask),
                last_price: String(ticker.lastPrice),
            };
        } catch (err) {
            logger.error(`failed to get ${symbol} ticker`);
            logger.error(err);
            return {
                symbol: symbol.toUpperCase(),
                bid: String(1),
                ask: String(1),
                last_price: String(1),
            };
        }
    }

    /**
     * Get the balances
     * @returns {*}
     */
    async walletBalances() {
        if (this.state.walletUpdates < 1) {
            await this.sleep(300);
        }
        return this.state.wallet;
    }

    /**
     * Creates a new order
     * @param symbol
     * @param amount
     * @param price
     * @param side
     * @param type
     * @param reduceOnly
     * @returns {Promise<*>}
     */
    async newOrder(symbol, amount, price, side, type, reduceOnly = false) {
        // Build new order
        const o = new Order({
            symbol: `t${symbol}`,
            price,
            amount: side === 'buy' ? amount : -amount,
            type,
        }, this.ws);

        if (reduceOnly) {
            o.setReduceOnly(true);
        }

        const bfxOrder = await o.submit();
        return this.onOrderUpdate(bfxOrder, true);
    }

    /**
     * place a limit order
     * @param symbol
     * @param amount
     * @param price
     * @param side
     * @param isEverything
     * @returns {*}
     */
    async limitOrder(symbol, amount, price, side, _isEverything) {
        return this.newOrder(symbol, amount, price, side, this.isMargin ? Order.type.LIMIT : Order.type.EXCHANGE_LIMIT);
    }

    /**
     * Place a market order
     * @param symbol
     * @param amount
     * @param side - buy or sell
     * @param isEverything
     */
    async marketOrder(symbol, amount, side, _isEverything) {
        return this.newOrder(symbol, amount, 0, side, this.isMargin ? Order.type.MARKET : Order.type.EXCHANGE_MARKET);
    }

    /**
     * Place a stop market order
     * @param symbol
     * @param amount
     * @param price
     * @param side
     * @param trigger - mark price, index price etc (not used on bfx)
     * @returns {Promise<void>}
     */
    async stopOrder(symbol, amount, price, side, _trigger) {
        return this.newOrder(symbol, amount, price, side, this.isMargin ? Order.type.STOP : Order.type.EXCHANGE_STOP, this.isMargin);
    }

    /**
     * Cancel orders
     * @param orders - and array of orders to cancel
     * @returns {*}
     */
    async cancelOrders(orders) {
        try {
            const pending = this.ws.cancelOrders(orders);
            await timeoutPromise(3000, pending);
        } catch (e) {
            logger.error('timed out wait for orders to cancel - likely order that\'s already been cancelled');
            logger.error(e);
        }
    }

    /**
     * Get active orders
     * @param symbol
     * @param side - buy, sell or all
     * @returns {PromiseLike<T> | Promise<T>}
     */
    async activeOrders(symbol, side) {
        return this.state.orders.filter(order => ((side === 'buy' || side === 'sell') ? order.side === side : true));
    }

    /**
     * Get current order info
     * @param orderInfo
     * @returns {PromiseLike<{id: *, side: *, amount: number, remaining: number, executed: number, is_filled: boolean}> | Promise<{id: *, side: *, amount: number, remaining: number, executed: number, is_filled: boolean}>}
     */
    async order(orderInfo) {
        // Find the order in out active order state
        const order = this.state.orders.filter(o => o.id === orderInfo.id).shift();
        if (order) {
            return order;
        }

        // wasn't there, so report it as closed.
        logger.error('Asked for order info, but order not in cache. Treating as closed. requested order:');
        logger.error(orderInfo);
        return {
            id: orderInfo.id,
            side: orderInfo.side,
            amount: parseFloat(orderInfo.size),
            remaining: 0,
            executed: parseFloat(orderInfo.size),
            is_filled: false,
            is_open: false,
        };
    }
}

module.exports = BitfinexApiv2;
