const logger = require('../../../common/logger').logger;
const scaledOrder = require('./scaled_order');
const pingPongLoop = require('./ping_pong_loop');


/**
 * marketMakerOrder
 */
module.exports = async (context, args) => {
    const { ex = {}, symbol = '', session = '' } = context;

    const p = ex.assignParams({
        bidAmount: '0',
        bidStep: '5',
        bidCount: '0',

        askAmount: '0',
        askStep: '5',
        askCount: '0',

        spread: '30',
        autoBalance: 'none',
        autoBalanceEvery: '0',

        tag: 'mm',
    }, args);


    // look at the bids
    p.bidAmount = Math.max(parseFloat(p.bidAmount), 0);
    p.bidStep = Math.max(parseFloat(p.bidStep), 0);
    p.bidCount = Math.max(parseInt(p.bidCount, 10), 0);

    // look at the asks
    p.askAmount = Math.max(parseFloat(p.askAmount), 0);
    p.askStep = Math.max(parseFloat(p.askStep), 0);
    p.askCount = Math.max(parseInt(p.askCount, 10), 0);

    // get the spread
    p.spread = Math.max(parseFloat(p.spread), 0);

    // Work out other values that will be useful
    p.bidFrom = (p.spread / 2) + p.bidStep;
    p.bidTo = p.bidFrom + ((p.bidCount - 1) * p.bidStep);

    p.askFrom = (p.spread / 2);
    p.askTo = p.askFrom + ((p.askCount - 1) * p.askStep);

    p.bidTotal = ex.roundAsset(symbol, p.bidAmount * p.bidCount);
    p.askTotal = ex.roundAsset(symbol, p.askAmount * p.askCount);
    p.total = ex.roundAsset(symbol, p.bidTotal + p.askTotal);

    p.autoBalanceEvery = ex.timeToSeconds(p.autoBalanceEvery, 0);


    // some settings to define to allow us to lean on the ping pong order code.
    p.endless = true;
    p.pingStep = p.bidStep;
    p.pongStep = p.askStep;
    p.pingAmount = p.bidAmount;
    p.pongAmount = p.askAmount;
    p.pongDistance = p.spread;

    // show a little progress
    logger.progress(`MARKET MAKER ORDER - ${ex.name}`);

    // Abort now if anything is rubbish
    if (p.bidCount < 1 && p.askCount < 1) {
        logger.results('Order count of zero - ignoring');
        return;
    }

    // If we want bids, but ask for zero amount or zero steps, ignore. same for asks
    if ((p.bidCount > 0 && (p.bidAmount === 0 || p.bidStep === 0)) || (p.askCount > 0 && (p.askAmount === 0 || p.askStep === 0))) {
        logger.results('Bid or Ask amount or step size of zero - ignoring');
        return;
    }

    // Convert from and to to absolute prices. Scaled order will do this for us, but this does
    // it with fewer api calls and ensures that both bids and asks are keyed off the same starting price.
    const orderbook = await ex.support.ticker(context);
    const midPrice = (parseFloat(orderbook.bid) + parseFloat(orderbook.ask)) / 2;
    p.bidFrom = `@${ex.roundPrice(symbol, midPrice - p.bidFrom)}`;
    p.bidTo = `@${ex.roundPrice(symbol, midPrice - p.bidTo)}`;
    p.askFrom = `@${ex.roundPrice(symbol, midPrice + p.askFrom)}`;
    p.askTo = `@${ex.roundPrice(symbol, midPrice + p.askTo)}`;

    // report the data we are actually going to use
    logger.progress(p);

    // step one - place the bids
    const bidArgs = [
        { name: 'from', value: p.bidFrom, index: 0 },
        { name: 'to', value: p.bidTo, index: 1 },
        { name: 'orderCount', value: String(p.bidCount), index: 2 },
        { name: 'amount', value: String(p.bidTotal), index: 3 },
        { name: 'side', value: 'buy', index: 4 },
        { name: 'easing', value: 'linear', index: 5 },
        { name: 'tag', value: p.tag, index: 6 },
    ];
    const bids = await scaledOrder(context, bidArgs);

    // step two - place the asks
    const askArgs = [
        { name: 'from', value: p.askFrom, index: 0 },
        { name: 'to', value: p.askTo, index: 1 },
        { name: 'orderCount', value: String(p.askCount), index: 2 },
        { name: 'amount', value: String(p.askTotal), index: 3 },
        { name: 'side', value: 'sell', index: 4 },
        { name: 'easing', value: 'linear', index: 5 },
        { name: 'tag', value: p.tag, index: 6 },
    ];
    const asks = await scaledOrder(context, askArgs);

    // loop, waiting for all the orders to complete (might never happen in endless mode...)
    await pingPongLoop(context, bids, asks, p, p.autoBalance);
    logger.progress('market maker order Complete.');
};
