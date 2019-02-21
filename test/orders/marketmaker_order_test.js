const sinon = require('sinon');
const chai = require('chai');
const marketMakerOrder = require('../../src/exchanges/commands/algo/market_maker');
const cancel = require('../../src/exchanges/commands/cancel_orders');
const Exchange = require('../../src/exchanges/exchange');
const FakeTimers = require('../support/fake_timers');

const logger = require('../../src/common/logger').logger;



const assert = chai.assert;

class MockAPI {
    ticker() {}
    walletBalances() {}
    limitOrder() {}
    order() {}
    cancelOrders() {}
}

describe('Market Maker Orders', () => {
    let exchange;
    let fakeTimer;
    let ticker;

    beforeEach(() => {
        fakeTimer = new FakeTimers();
        fakeTimer.start();

        // runs before each test in this block
        exchange = new Exchange({});

        // Build a mock API to call
        const api = new MockAPI();
        exchange.api = api;

        // Stub the ticker
        ticker = sinon.stub(api, 'ticker');
        ticker.resolves({ mid: '3025', bid: '3000', ask: '3040', last_price: '3010' });

        // Stub the wallet balances
        const wallet = sinon.stub(api, 'walletBalances');
        wallet.resolves([
            { type: 'exchange', currency: 'btc', amount: '10', available: '10' },
            { type: 'exchange', currency: 'usd', amount: '50000', available: '50000' },
        ]);
    });

    afterEach(() => {
        fakeTimer.restore();
    });

    it('can place basic market maker order', async () => {
        const context = { ex: exchange, symbol: 'btcusd' };

        const limit = sinon.stub(exchange.api, 'limitOrder');
        limit.resolves({ id: 1 });

        const getOrder = sinon.stub(exchange.api, 'order');
        getOrder.resolves({ is_filled: false, is_open: true });

        const args = [
            { name: 'bidAmount', value: '0.1', index: 0 },
            { name: 'bidStep', value: '10', index: 1 },
            { name: 'bidCount', value: '4', index: 2 },
            { name: 'askAmount', value: '0.1', index: 0 },
            { name: 'askStep', value: '10', index: 1 },
            { name: 'askCount', value: '4', index: 2 },
            { name: 'spread', value: '20', index: 3 },
            { name: 'autoBalance', value: 'none', index: 4 },
        ];

        const expectLimit = [
            ['btcusd', 0.1, 3000, 'buy', false],
            ['btcusd', 0.1, 2990, 'buy', false],
            ['btcusd', 0.1, 2980, 'buy', false],
            ['btcusd', 0.1, 2970, 'buy', false],
            ['btcusd', 0.1, 3030, 'sell', false],
            ['btcusd', 0.1, 3040, 'sell', false],
            ['btcusd', 0.1, 3050, 'sell', false],
            ['btcusd', 0.1, 3060, 'sell', false],
        ];

        const finished = sinon.fake();
        marketMakerOrder(context, args).then((orders) => {
            finished(orders);
        });

        // Should not have finished yet
        assert.equal(finished.callCount, 0);

        // wait some time - initial scaled order should have been placed by now
        // but waiting for the orders to fill
        await fakeTimer.tickAsync(5000, 100);
        // assert.isTrue(limit.calledThrice);
        assert.equal(limit.callCount, 8);
        // assert.equal(getOrder.callCount, 1);

        // Start marking the orders as filled
        getOrder.resolves({ is_filled: false, is_open: false });

        // wait some more (just over 10s in total)
        // Each order should fill, the contra order placed, and that filled too, ending the order
        await fakeTimer.tickAsync(10000, 100);
        assert.equal(finished.callCount, 1);
        assert.equal(limit.callCount, 8);
        assert.deepEqual(limit.args, expectLimit);
    });


    it('can place basic and auto balancing market maker order', async () => {
        const context = { ex: exchange, symbol: 'btcusd' };

        const limit = sinon.stub(exchange.api, 'limitOrder');
        limit.resolves({ id: 1 });

        const getOrder = sinon.stub(exchange.api, 'order');
        getOrder.resolves({ is_filled: false, is_open: true });

        const args = [
            { name: 'bidAmount', value: '0.1', index: 0 },
            { name: 'bidStep', value: '10', index: 1 },
            { name: 'bidCount', value: '4', index: 2 },
            { name: 'askAmount', value: '0.1', index: 3 },
            { name: 'askStep', value: '10', index: 4 },
            { name: 'askCount', value: '0', index: 5 },
            { name: 'spread', value: '20', index: 6 },
            { name: 'autoBalance', value: 'shuffle', index: 7 },
            { name: 'autoBalanceEvery', value: '3s', index: 8 },
        ];

        const expectLimit = [
            // 4 initial orders (from scaled order0
            ['btcusd', 0.1, 3000, 'buy', false],
            ['btcusd', 0.1, 2990, 'buy', false],
            ['btcusd', 0.1, 2980, 'buy', false],
            ['btcusd', 0.1, 2970, 'buy', false],

            // plus one extra, from shuffling the bottom order up closer to the price
            ['btcusd', 0.1, 3010, 'buy', false],
        ];

        ticker.onCall(0).returns({ mid: '3025', bid: '3000', ask: '3040', last_price: '3010' });
        ticker.onCall(1).returns({ mid: '3025', bid: '3000', ask: '3040', last_price: '3010' });
        ticker.onCall(2).returns({ mid: '3025', bid: '3010', ask: '3040', last_price: '3010' });
        ticker.onCall(3).returns({ mid: '3025', bid: '3010', ask: '3040', last_price: '3010' });
        ticker.onCall(4).returns({ mid: '3025', bid: '3010', ask: '3040', last_price: '3010' });
        ticker.onCall(5).returns({ mid: '3025', bid: '3010', ask: '3040', last_price: '3010' });
        ticker.onCall(6).returns({ mid: '3025', bid: '3010', ask: '3040', last_price: '3010' });

        const finished = sinon.fake();
        marketMakerOrder(context, args).then((orders) => {
            finished(orders);
        });

        // Should not have finished yet
        assert.equal(finished.callCount, 0);

        // wait some time - initial scaled order should have been placed by now
        // but waiting for the orders to fill
        await fakeTimer.tickAsync(1000, 100);
        assert.equal(limit.callCount, 4);

        // wait for the first test to shuffle - price not gone up enough yet, so no change.
        await fakeTimer.tickAsync(2000, 100);
        assert.equal(limit.callCount, 4);

        // wait long enough for the price to go up, bottom order should cancel, top order added
        await fakeTimer.tickAsync(10000, 100);

        // Start marking the orders as filled
        getOrder.resolves({ is_filled: false, is_open: false });

        // wait some more (just over 10s in total)
        // Each order should fill, the contra order placed, and that filled too, ending the order
        await fakeTimer.tickAsync(10000, 100);
        assert.equal(finished.callCount, 1);
        assert.equal(limit.callCount, 5);
        assert.deepEqual(limit.args, expectLimit);
        assert.equal(ticker.callCount, 3);
    });


    it('can be cancelled', async () => {
        const context = { ex: exchange, symbol: 'btcusd' };

        const limit = sinon.stub(exchange.api, 'limitOrder');
        limit.resolves({ id: 1 });

        const getOrder = sinon.stub(exchange.api, 'order');
        getOrder.resolves({ is_filled: false, is_open: true });

        const args = [
            { name: 'bidAmount', value: '0.1', index: 0 },
            { name: 'bidStep', value: '10', index: 1 },
            { name: 'bidCount', value: '4', index: 2 },
            { name: 'askAmount', value: '0.1', index: 0 },
            { name: 'askStep', value: '10', index: 1 },
            { name: 'askCount', value: '4', index: 2 },
            { name: 'spread', value: '20', index: 3 },
            { name: 'autoBalance', value: 'none', index: 4 },
            { name: 'tag', value: 'cancel-me', index: 4 },
        ];

        const finished = sinon.fake();
        marketMakerOrder(context, args).then((orders) => {
            finished(orders);
        });

        // Should not have finished yet
        assert.equal(finished.callCount, 0);

        // wait some time - initial scaled order should have been placed by now
        // but waiting for the orders to fill
        await fakeTimer.tickAsync(5000, 100);
        assert.equal(limit.callCount, 8);

        // cancel it - all the orders, and the master algo order should all end.
        cancel(context, [{ name: 'which', value: 'tagged', index: 0 }, { name: 'tag', value: 'cancel-me', index: 1 }]);
        await fakeTimer.tickAsync(5000, 100);
        assert.equal(limit.callCount, 8);
        assert.equal(finished.callCount, 1);
    });


    it('can does nothing if all order counts are zero', async () => {
        const context = { ex: exchange, symbol: 'btcusd' };

        const limit = sinon.stub(exchange.api, 'limitOrder');
        limit.resolves({ id: 1 });

        const getOrder = sinon.stub(exchange.api, 'order');
        getOrder.resolves({ is_filled: false, is_open: true });

        const args = [
            { name: 'bidAmount', value: '0.1', index: 0 },
            { name: 'bidStep', value: '10', index: 1 },
            { name: 'bidCount', value: '0', index: 2 },
            { name: 'askAmount', value: '0.1', index: 0 },
            { name: 'askStep', value: '10', index: 1 },
            { name: 'askCount', value: '0', index: 2 },
            { name: 'spread', value: '20', index: 3 },
            { name: 'autoBalance', value: 'none', index: 4 },
        ];

        const finished = sinon.fake();
        marketMakerOrder(context, args).then((orders) => {
            finished(orders);
        });

        // Should not have finished yet
        assert.equal(finished.callCount, 0);

        // wait some time - initial scaled order should have been placed by now
        // but waiting for the orders to fill
        await fakeTimer.tickAsync(5000, 100);
        assert.equal(limit.callCount, 0);
        assert.equal(finished.callCount, 1);
    });

    it('can does nothing if steps and amounts are zero', async () => {
        const context = { ex: exchange, symbol: 'btcusd' };

        const limit = sinon.stub(exchange.api, 'limitOrder');
        limit.resolves({ id: 1 });

        const getOrder = sinon.stub(exchange.api, 'order');
        getOrder.resolves({ is_filled: false, is_open: true });

        const args = [
            { name: 'bidAmount', value: '0', index: 0 },
            { name: 'bidStep', value: '10', index: 1 },
            { name: 'bidCount', value: '10', index: 2 },
            { name: 'askAmount', value: '0.1', index: 0 },
            { name: 'askStep', value: '0', index: 1 },
            { name: 'askCount', value: '10', index: 2 },
            { name: 'spread', value: '20', index: 3 },
            { name: 'autoBalance', value: 'none', index: 4 },
        ];

        const finished = sinon.fake();
        marketMakerOrder(context, args).then((orders) => {
            finished(orders);
        });

        // Should not have finished yet
        assert.equal(finished.callCount, 0);

        // wait some time - initial scaled order should have been placed by now
        // but waiting for the orders to fill
        await fakeTimer.tickAsync(5000, 100);
        assert.equal(limit.callCount, 0);
        assert.equal(finished.callCount, 1);
    });
});
