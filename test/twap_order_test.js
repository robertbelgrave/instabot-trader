const sinon = require('sinon');
const chai = require('chai');
const twapOrder = require('../src/exchanges/commands/algo/twap_order');
const Exchange = require('../src/exchanges/exchange');

const assert = chai.assert;

class MockAPI {
    ticker() {}
    walletBalances() {}
    marketOrder() {}
}

// Hack to make fake timers work with promises
// see https://github.com/sinonjs/sinon/issues/738#issuecomment-428370425
let clock;
const originalSetImmediate = setImmediate;
const tickAsync = async (ms, step) => {
    let toWait = ms;
    while (toWait > 0) {
        toWait -= step;
        clock.tick(step);
        await new Promise(resolve => originalSetImmediate(resolve));
    }
};


describe('Twap Orders', () => {
    let exchange;

    beforeEach(() => {
        clock = sinon.useFakeTimers();

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
        clock.restore();
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

        const start = Date.now();
        const twap = twapOrder(context, args).then((orders) => {
            const end = Date.now();
            assert.isAtLeast(end - start, 10000);
            assert.deepEqual(expect, orders);
            assert.equal(market.calledThrice, true);
        });

        await tickAsync(10500, 100);

        return twap;
    });
});
