const uuid = require('uuid/v4');
const logger = require('../../../common/logger').logger;
const icebergOrder = require('./iceberg_order');


/**
 * Actually place the order
 * @param context
 * @param side
 * @param amount
 * @returns {Promise<*>}
 */
async function placeMarketOrder(context, side, amount) {
    try {
        const { ex = {}, symbol = '' } = context;

        return await ex.api.marketOrder(symbol, amount, side, false);
    } catch (err) {
        logger.error('failed to place market order in ping pong rebalance - ignoring');
        logger.error(err);
        return {};
    }
}

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
 *
 * @param context
 * @param side
 * @param amount
 * @param limitPrice
 * @param tag
 * @returns {Promise<undefined>}
 */
async function placeIcebergOrder(context, side, amount, limitPrice, tag) {
    try {
        // set up the iceberg order we'll use to auto balance the book
        const args = [
            { name: 'side', value: side, index: 0 },
            { name: 'totalAmount', value: String(amount), index: 1 },
            { name: 'averageAmount', value: String(amount*2), index: 2 },
            { name: 'variance', value: '0', index: 3 },
            { name: 'limitPrice', value: String(limitPrice), index: 4 },
            { name: 'timeLimit', value: '29m', index: 5 },
            { name: 'tag', value: tag, index: 6 },
        ];

        return await icebergOrder(context, args);
    } catch (err) {
        logger.error('ping pong rebalance iceberg order failed - ignoring');
        logger.error(err);
    }

    return {};
}

/**
 * Have we had 30 minutes without activity (30m is the max iceberg life
 * @param lastActivity
 * @returns {boolean}
 */
function hasBeenIdleLongEnough(lastActivity) {
    const thirtyMinutes = 1000 * 60 * 30;
    const thirtyMinutesAgo = Date.now() - thirtyMinutes;

    return lastActivity < thirtyMinutesAgo;
}


/**
 * Attempt to re-balance the book
 * @param context
 * @param p
 * @param autoBalance
 * @param pings
 * @param pongs
 * @param pendingOrders
 * @returns {Promise<void>}
 */
async function rebalanceBook(context, p, autoBalance, pings, pongs, pendingOrders) {
    const { ex = {} } = context;

    // find last order on the pong list. cancel it and remove it from the list
    const toCancel = pongs.pop();
    logger.info(`Cancelling ping pong order ${toCancel.side} ${toCancel.amount} at ${toCancel.price}`);
    await ex.api.cancelOrders([toCancel.order]);

    // market trade to get the funds in the right place
    if (autoBalance === 'market') {
        // market sell/buy the value
        logger.info('Exchanging value with market order');
        logger.dim(await placeMarketOrder(context, toCancel.side, toCancel.amount));
    }

    // place a new order (if enough funds), positioned at the end of ping list, the right distance after the existing last one
    let price = 0;
    if (pings.length > 0) {
        const lastPing = pings[pings.length - 1];
        price = lastPing.side === 'buy' ? lastPing.price - p.pingStep : lastPing.price + p.pingStep;
        logger.info(`Already some pings. Step ${p.pingStep}. Last ping price ${lastPing.price}`);
    } else {
        const firstPong = pongs[0];
        price = firstPong.side === 'buy' ? firstPong.price + p.pongDistance : firstPong.price - p.pongDistance;
        logger.info(`Creating first ping. pong distance ${p.pongDistance}. first pong price ${firstPong.price}`);
    }

    // Get some of the setting for the new order
    const side = toCancel.side === 'buy' ? 'sell' : 'buy';
    const amount = toCancel.amount;

    // place the order and add it to the list
    pings.push(await placeLimitOrder(context, side, price, amount, p.tag));

    // deal with a delayed order to exchange the value
    if (autoBalance === 'limit') {
        // place an iceberg order here to move the value asap
        pendingOrders.push(placeIcebergOrder(context, toCancel.side, toCancel.amount, price, p.tag));
    }
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
 * Ping Pong Loop handler
 */
module.exports = async (context, startingPings, startingPongs, p, autoBalance) => {
    const { ex = {}, session = '' } = context;

    // A list of pending limit order promises that are being used to rebalance
    const pendingOrders = [];
    let lastRebalance = new Date();

    // Get the finds and pongs into order
    let pongs = cleanOrderList(startingPongs);
    let pings = cleanOrderList(startingPings);

    logger.progress(`Ping Pong initial orders placed - ${pings.length} pings, ${pongs.length} pongs.`);
    logger.progress('Waiting for orders to fill now');

    // Log the algo order, so it can be cancelled
    const id = uuid();
    const defaultSide = pings.length ? pings[0].side : (pongs.length ? pongs[0].side : 'buy');
    ex.startAlgoOrder(id, defaultSide, session, p.tag);

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
        const totalOrders = pingCount + pongCount;
        const isIdle = waitTime > ex.minPollingDelay;
        if (isIdle && (autoBalance === 'market' || autoBalance === 'limit') && totalOrders > 9) {
            const threshold = p.autoBalanceAt;
            const pingRatio = pingCount / totalOrders;
            if (pingRatio < threshold) {
                logger.progress(`Position off balance (only ${Math.round(pingRatio * 100)}% of orders are pings}`);
                logger.progress(`Rebalancing book with a ${autoBalance} trade`);

                await rebalanceBook(context, p, autoBalance, pings, pongs, pendingOrders);
                lastRebalance = new Date();
            }

            // do something similar if the pong ratio is too low.
            const pongRatio = pongCount / totalOrders;
            if (pongRatio < threshold) {
                logger.progress(`Position off balance (only ${Math.round(pongRatio * 100)}% of orders are pongs}`);
                logger.progress(`Rebalancing book with a ${autoBalance} trade`);

                await rebalanceBook(context, p, autoBalance, pongs, pings, pendingOrders);
                lastRebalance = new Date();
            }

            // clean them both
            pings = cleanOrderList(pings);
            pongs = cleanOrderList(pongs);
        }

        // Clear any pending orders that will have completed by now
        if (pendingOrders.length && hasBeenIdleLongEnough(lastRebalance)) {
            logger.progress('All pending rebalance orders should be complete. clearing down pending orders...');
            await Promise.all(pendingOrders);
            pendingOrders.length = 0;
        }

        // wait for a bit before deciding what to do next
        await ex.waitSeconds(waitTime);
        if (waitTime < ex.maxPollingDelay) waitTime += 1;
    }

    // Wait for any pending orders to complete.
    if (pendingOrders.length) {
        logger.progress('awaiting all pending rebalnce orders to complete...');
        await Promise.all(pendingOrders);
    }

    ex.endAlgoOrder(id);
};
