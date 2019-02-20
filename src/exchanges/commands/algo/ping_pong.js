const logger = require('../../../common/logger').logger;
const scaledOrder = require('./scaled_order');
const pingPongLoop = require('./ping_pong_loop');


/**
 * pingPongOrder
 */
module.exports = async (context, args) => {
    const { ex = {}, symbol = '', session = '' } = context;

    const p = ex.assignParams({
        from: '0',
        to: '50',
        orderCount: '10',
        amount: '0',
        side: 'buy',
        easing: 'linear',
        varyAmount: '0',
        varyPrice: '0',
        tag: 'pingpong',
        position: '',
        pongDistance: '20',
        pingAmount: '0',
        pongAmount: '0',
        endless: 'false',
    }, args);

    // ping pong orders do not support position
    p.position = '';

    // get the pong distance as a number
    p.pongDistance = parseFloat(p.pongDistance);
    p.endless = (p.endless.toLowerCase() === 'true');
    p.pingAmount = Math.max(parseFloat(p.pingAmount), 0);
    p.pongAmount = Math.max(parseFloat(p.pongAmount), 0);
    p.orderCount = Math.min(parseInt(p.orderCount, 10), 100);

    // Work out the step size
    p.pingStep = Math.abs(parseFloat(p.to) - parseFloat(p.from)) / p.orderCount;
    p.pongStep = Math.abs(parseFloat(p.to) - parseFloat(p.from)) / p.orderCount;

    // If ping and pong amounts are not given, work them out from amount or position
    if ((p.pingAmount === 0) && (p.pongAmount === 0)) {
        const modifiedPosition = await ex.positionToAmount(symbol, p.position, p.side, p.amount);
        p.pingAmount = p.pongAmount = ex.roundAsset(symbol, modifiedPosition.amount.value / p.orderCount);
    }

    p.amount = String(ex.roundAsset(symbol, p.pingAmount * p.orderCount));

    // show a little progress
    logger.progress(`PING PONG ORDER - ${ex.name}`);
    logger.progress(p);

    // zero orders means nothing to do
    if (p.orderCount < 1) {
        logger.results('Ping Pong order with orderCount of zero. Ignoring');
        return;
    }

    // step one - place a scaled order...
    const scaledOrderArgs = [
        { name: 'from', value: p.from, index: 0 },
        { name: 'to', value: p.to, index: 1 },
        { name: 'orderCount', value: String(p.orderCount), index: 2 },
        { name: 'amount', value: p.amount, index: 3 },
        { name: 'side', value: p.side, index: 4 },
        { name: 'easing', value: p.easing, index: 5 },
        { name: 'tag', value: p.tag, index: 6 },
    ];
    const orders = await scaledOrder(context, scaledOrderArgs);

    // loop, waiting for all the orders to complete (might never happen in endless mode...)
    await pingPongLoop(context, orders, [], p, 'none');
    logger.progress('PingPong order Complete.');
};
