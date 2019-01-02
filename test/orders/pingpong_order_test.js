const sinon = require('sinon');
const chai = require('chai');
const pingPongOrder = require('../../src/exchanges/commands/algo/ping_pong');
const Exchange = require('../../src/exchanges/exchange');
const FakeTimers = require('../support/fake_timers');


const assert = chai.assert;

class MockAPI {
    ticker() {}
    walletBalances() {}
    limitOrder() {}
    order() {}
}

describe('Ping Pong Orders', () => {
    let exchange;
    let fakeTimer;

    beforeEach(() => {
        fakeTimer = new FakeTimers();
        fakeTimer.start();

        // runs before each test in this block
        exchange = new Exchange({});

        // Build a mock API to call
        const api = new MockAPI();
        exchange.api = api;

        // Stub the ticker
        const ticker = sinon.stub(api, 'ticker');
        ticker.resolves({ mid: '3025', bid: '3000', ask: '3050', last_price: '3010' });

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

    it('can place basic pingpong order', async () => {
        const context = { ex: exchange, symbol: 'btcusd' };

        const limit = sinon.stub(exchange.api, 'limitOrder');
        limit.resolves({ id: 1 });

        const getOrder = sinon.stub(exchange.api, 'order');
        getOrder.resolves({ is_filled: false, is_open: true });


        const args = [
            { name: 'from', value: '0', index: 0 },
            { name: 'to', value: '100', index: 1 },
            { name: 'orderCount', value: '3', index: 2 },
            { name: 'amount', value: '6', index: 3 },
            { name: 'side', value: 'buy', index: 4 },
            { name: 'pongDistance', value: '50', index: 5 },
            { name: 'varyAmount', value: '0', index: 6 },
            { name: 'varyPrice', value: '0', index: 7 },
            { name: 'easing', value: 'linear', index: 8 },
            { name: 'tag', value: '', index: 9 },
        ];

            // pingAmount: '0',
            // pongAmount: '0',
            // endless: 'false',

        const expectLimit = [
            ['btcusd', 2, 3000, 'buy', false],
            ['btcusd', 2, 2950, 'buy', false],
            ['btcusd', 2, 2900, 'buy', false],
            ['btcusd', 2, 3050, 'sell', false],
            ['btcusd', 2, 3000, 'sell', false],
            ['btcusd', 2, 2950, 'sell', false],
        ];


        const finished = sinon.fake();
        pingPongOrder(context, args).then((orders) => {
            finished(orders);
        });

        // Should not have finished yet
        assert.equal(finished.callCount, 0);

        // wait some time - initial scaled order should have been placed by now
        // but waiting for the orders to fill
        await fakeTimer.tickAsync(1000, 100);
        assert.isTrue(limit.calledThrice);
        assert.equal(finished.callCount, 0);
        assert.equal(getOrder.callCount, 1);

        // Start marking the orders as filled
        getOrder.resolves({ is_filled: true, is_open: true });

        // wait some more (just over 10s in total)
        // Each order should fill, the contra order placed, and that filled too, ending the order
        await fakeTimer.tickAsync(10000, 100);
        assert.equal(finished.callCount, 1);
        assert.equal(limit.callCount, 6);
        assert.deepEqual(limit.args, expectLimit);
    });

    it('can run and endless order', async () => {
        const context = { ex: exchange, symbol: 'btcusd' };

        const limit = sinon.stub(exchange.api, 'limitOrder');
        limit.resolves({ id: 1 });

        const getOrder = sinon.stub(exchange.api, 'order');
        getOrder.resolves({ is_filled: false, is_open: true });


        const args = [
            { name: 'from', value: '0', index: 0 },
            { name: 'to', value: '100', index: 1 },
            { name: 'orderCount', value: '3', index: 2 },
            { name: 'amount', value: '6', index: 3 },
            { name: 'side', value: 'buy', index: 4 },
            { name: 'pongDistance', value: '50', index: 5 },
            { name: 'varyAmount', value: '0', index: 6 },
            { name: 'varyPrice', value: '0', index: 7 },
            { name: 'easing', value: 'linear', index: 8 },
            { name: 'tag', value: '', index: 9 },
            { name: 'endless', value: 'true', index: 10 },
        ];

        const expectLimit = [
            ['btcusd', 2, 3000, 'buy', false],
            ['btcusd', 2, 2950, 'buy', false],
            ['btcusd', 2, 2900, 'buy', false],
            ['btcusd', 2, 3050, 'sell', false],
            ['btcusd', 2, 3000, 'sell', false],
            ['btcusd', 2, 2950, 'sell', false],
        ];


        const finished = sinon.fake();
        pingPongOrder(context, args).then((orders) => {
            finished(orders);
        });

        // Should not have finished yet
        assert.equal(finished.callCount, 0);

        // wait some time - initial scaled order should have been placed by now
        // but waiting for the orders to fill
        await fakeTimer.tickAsync(1000, 100);
        assert.isTrue(limit.calledThrice);
        assert.equal(finished.callCount, 0);
        assert.equal(getOrder.callCount, 1);

        // Start marking the orders as filled
        getOrder.resolves({ is_filled: true, is_open: true });

        // wait some more (just over 10s in total)
        // Each order should fill, the contra order placed, and that filled too, ending the order
        await fakeTimer.tickAsync(10000, 100);
        assert.equal(finished.callCount, 0);
        assert.isAbove(limit.callCount, 9);

        // Start cancelling orders
        getOrder.resolves({ is_filled: false, is_open: false });
        await fakeTimer.tickAsync(10000, 100);
        assert.equal(finished.callCount, 1);
    });
});
