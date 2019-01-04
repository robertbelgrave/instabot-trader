const sinon = require('sinon');
const chai = require('chai');
const twapOrder = require('../../src/exchanges/commands/algo/twap_order');
const Exchange = require('../../src/exchanges/exchange');
const FakeTimers = require('../support/fake_timers');

const assert = chai.assert;

class MockAPI {
    ticker() {}
    walletBalances() {}
    marketOrder() {}
}

describe('Twap Orders', () => {
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

    it('can place basic twap order', async () => {
        const context = { ex: exchange };

        const market = sinon.stub(exchange.api, 'marketOrder');
        market.resolves({ id: 1 });

        const args = [
            { name: 'duration', value: '10s', index: 0 },
            { name: 'orderCount', value: '3', index: 2 },
            { name: 'amount', value: '6', index: 3 },
            { name: 'side', value: 'buy', index: 4 },
            { name: 'varyAmount', value: '0', index: 5 },
            { name: 'tag', value: '', index: 6 },
        ];

        const expect = [
            { order: { id: 1 }, side: 'buy', price: null, amount: 2, units: '' },
            { order: { id: 1 }, side: 'buy', price: null, amount: 2, units: '' },
            { order: { id: 1 }, side: 'buy', price: null, amount: 2, units: '' },
        ];


        var finished = sinon.fake();
        twapOrder(context, args).then((orders) => {
            finished(orders);
        });

        // Should not have finished yet
        assert.equal(finished.callCount, 0);

        // wait 9.5 seconds - still not finished
        await fakeTimer.tickAsync(9500, 100);
        assert.equal(finished.callCount, 0);
        assert.equal(market.calledTwice, true);

        // wait some more (just over 10s in total)
        await fakeTimer.tickAsync(700, 100);
        assert.equal(finished.callCount, 1);
        assert.equal(market.calledThrice, true);
        assert.deepEqual(expect, finished.lastArg);
    });
});
