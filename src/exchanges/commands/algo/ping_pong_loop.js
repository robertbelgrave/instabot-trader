const uuid = require('uuid/v4');
const logger = require('../../../common/logger').logger;

/**
 * Actually place the order
 * @param context
 * @param side
 * @param price
 * @param amount
 * @param tag
 * @returns {Promise<*>}
 */
async function placeLimitOrder(context, side, price, amount, tag) {
    try {
        const { ex = {}, symbol = '', session = '' } = context;

        // Place the order
        const order = await ex.api.limitOrder(symbol, amount, price, side, false);
        ex.addToSession(session, tag, order);

        const now = new Date();
        logger.results(`Limit order placed at ${now.toTimeString()}. ${side} ${amount} at ${price}.`);
        logger.dim(order);

        return { order, side, price, amount, units: '' };
    } catch (err) {
        logger.error('failed to place new limit order in ping pong - ignoring');
        logger.error(`Tried ${side} ${amount} at ${price}`);
        logger.error(err);

        return { order: null };
    }
}

/**
 * Once an order fills, place a new order on the other side of the book
 * @param context
 * @param p
 * @param original
 * @returns {Promise<*>}
 */
async function placeOppositeOrder(context, p, original) {
    // Need to place the 'pong' order on the other side of the book
    const side = original.side === 'buy' ? 'sell' : 'buy';
    const price = original.side === 'buy' ? original.price + p.pongDistance : original.price - p.pongDistance;
    const amount = p.side === original.side ? p.pongAmount : p.pingAmount;

    return placeLimitOrder(context, side, price, amount, p.tag);
}

/**
 * Helper to tidy up the initial list of orders
 * @param orders
 * @returns {void | this}
 */
function cleanOrderList(orders) {
    return orders
        .filter(order => order.order !== null)
        .sort((a, b) => (a.side === 'buy' ? b.price - a.price : a.price - b.price));
}

/**
 * Shuffles the order list closer to the price by moving the order that is furthest away to just above the closest
 * @param context
 * @param p
 * @param orders
 * @param stepSize
 * @returns {Promise<void|this>}
 */
async function shuffleBook(context, p, orders, stepSize) {
    const { ex = {}, symbol = {} } = context;

    // We only want to make changes if the price gets far enough away from the orders
    const ticker = await ex.api.ticker(symbol);
    const midPrice = (parseFloat(ticker.bid) + parseFloat(ticker.ask)) / 2;
    const gap = Math.abs(orders[0].price - midPrice);

    // If the price isn't far enough away, do nothing
    if (gap <= p.pongDistance) {
        return orders;
    }

    // we have work to do
    logger.info('Price has moved outside Ping pong order range');
    logger.info(`top order: ${orders[0].price}, ticker: ${midPrice}, gap: ${gap}`);

    // Cancel the order furthest from the current price
    const toCancel = orders.pop();
    await ex.api.cancelOrders([toCancel.order]);
    logger.info(`Cancelled ping pong order: ${toCancel.side} ${toCancel.amount} at ${toCancel.price}`);

    // and add a new one at the top, closer to the price
    const price = toCancel.side === 'buy' ? orders[0].price + stepSize : orders[0].price - stepSize;
    orders.push(await placeLimitOrder(context, toCancel.side, price, toCancel.amount, p.tag));

    // keep it in order
    return cleanOrderList(orders);
}

/**
 * Ping Pong Loop handler
 */
module.exports = async (context, startingPings, startingPongs, p, autoBalance) => {
    const { ex = {}, session = '' } = context;

    // Get the finds and pongs into order
    let pongs = cleanOrderList(startingPongs);
    let pings = cleanOrderList(startingPings);

    logger.progress(`Ping Pong initial orders placed - ${pings.length} pings, ${pongs.length} pongs.`);
    logger.progress('Waiting for orders to fill now');

    // Log the algo order, so it can be cancelled
    const id = uuid();
    const defaultSide = pings.length ? pings[0].side : (pongs.length ? pongs[0].side : 'buy');
    ex.startAlgoOrder(id, defaultSide, session, p.tag);

    // track some time for auto balancing
    let lastAutoBalance = Date.now();

    // now we have to wait for the pings to be filled
    // (actually only need to check the first one that would be hit)
    let waitTime = ex.minPollingDelay;
    while ((p.endless && pongs.length) || pings.length) {
        // Has the algo order been cancelled - if so, cancel all outstanding orders and stop
        if (ex.isAlgoOrderCancelled(id)) {
            logger.progress('Ping Pong order cancelled - stopping');
            waitTime = ex.minPollingDelay;
            await ex.api.cancelOrders(pings.map(order => order.order));
            await ex.api.cancelOrders(pongs.map(order => order.order));
            pings = [];
            pongs = [];
        }

        // Check the pings
        if (pings.length) {
            pings.sort((a, b) => (a.side === 'buy' ? b.price - a.price : a.price - b.price));
            const firstPing = pings[0];
            const orderInfo = await ex.api.order(firstPing.order);
            if (orderInfo.is_filled) {
                logger.results(`Ping Pong order: order filled - ${firstPing.side} ${firstPing.amount} for ${firstPing.price}`);
                pongs.push(await placeOppositeOrder(context, p, firstPing));
                pongs = cleanOrderList(pongs);
                pings.shift();
                waitTime = ex.minPollingDelay;
            } else if (!orderInfo.is_open) {
                logger.results('Ping Pong order: found a cancelled order - discarding');
                pings.shift();
                waitTime = ex.minPollingDelay;
            }
        }

        // and the pongs (only if this endlessly flips back and forth)
        if (p.endless && pongs.length) {
            pongs.sort((a, b) => (a.side === 'buy' ? b.price - a.price : a.price - b.price));
            const firstPong = pongs[0];
            const orderInfo = await ex.api.order(firstPong.order);
            if (orderInfo.is_filled) {
                logger.results(`Ping Pong order: order filled - ${firstPong.side} ${firstPong.amount} for ${firstPong.price}`);
                pings.push(await placeOppositeOrder(context, p, firstPong));
                pings = cleanOrderList(pings);
                pongs.shift();
                waitTime = ex.minPollingDelay;
            } else if (!orderInfo.is_open) {
                logger.results('Ping Pong order: found a cancelled order - discarding');
                pongs.shift();
                waitTime = ex.minPollingDelay;
            }
        }

        // Decide if we need to re-balance the book
        const pingCount = pings.length;
        const pongCount = pongs.length;
        const couldAdjustPongs = (pingCount === 0 && pongCount > 0);
        const couldAdjustPings = (pongCount === 0 && pingCount > 0);
        const isIdle = waitTime > ex.minPollingDelay;
        const timeSinceLastAutoBalance = (Date.now() - lastAutoBalance) / 1000;
        const waitedLongEnough = timeSinceLastAutoBalance > p.autoBalanceEvery;
        if (isIdle && autoBalance === 'shuffle' && waitedLongEnough && (couldAdjustPings || couldAdjustPongs)) {
            if (couldAdjustPings) {
                pings = await shuffleBook(context, p, pings, p.pingStep);
            } else {
                pongs = await shuffleBook(context, p, pongs, p.pongStep);
            }

            // note the time that we last checked
            lastAutoBalance = Date.now();
        }

        // wait for a bit before deciding what to do next
        await ex.waitSeconds(waitTime);
        if (waitTime < ex.maxPollingDelay) waitTime += 1;
    }

    ex.endAlgoOrder(id);
};
