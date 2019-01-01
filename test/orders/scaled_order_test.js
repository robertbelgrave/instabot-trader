const assert = require('chai').assert;
const sinon = require('sinon');
const scaledOrder = require('../../src/exchanges/commands/algo/scaled_order');
const Exchange = require('../../src/exchanges/exchange');


class MockAPI {
    ticker() {}
    walletBalances() {}
    limitOrder() {}
}

describe('Scaled Orders', () => {
    const exchange = new Exchange({});

    beforeEach(() => {
        // runs before each test in this block

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

        const limit = sinon.stub(api, 'limitOrder');
        limit.resolves({ id: 1 });
    });

    it('can place simple scaled buy orders', async () => {
        const context = { ex: exchange };

        const expect = [
            { order: { id: 1 }, side: 'buy', price: 3000, amount: 1, units: '' },
            { order: { id: 1 }, side: 'buy', price: 2975, amount: 1, units: '' },
            { order: { id: 1 }, side: 'buy', price: 2950, amount: 1, units: '' },
            { order: { id: 1 }, side: 'buy', price: 2925, amount: 1, units: '' },
            { order: { id: 1 }, side: 'buy', price: 2900, amount: 1, units: '' }];

        const args = [
            { name: 'from', value: '0', index: 0 },
            { name: 'to', value: '100', index: 1 },
            { name: 'orderCount', value: '5', index: 2 },
            { name: 'amount', value: '5', index: 3 },
            { name: 'side', value: 'buy', index: 4 },
            { name: 'easing', value: 'linear', index: 5 },
            { name: 'tag', value: '', index: 6 },
        ];

        const orders = await scaledOrder(context, args);
        assert.lengthOf(orders, 5);
        assert.deepEqual(orders, expect);
    });

    it('does not care which order from and to are in', async () => {
        const context = { ex: exchange };

        const expect = [
            { order: { id: 1 }, side: 'buy', price: 3000, amount: 1, units: '' },
            { order: { id: 1 }, side: 'buy', price: 2975, amount: 1, units: '' },
            { order: { id: 1 }, side: 'buy', price: 2950, amount: 1, units: '' },
            { order: { id: 1 }, side: 'buy', price: 2925, amount: 1, units: '' },
            { order: { id: 1 }, side: 'buy', price: 2900, amount: 1, units: '' }];

        const args = [
            { name: 'from', value: '100', index: 0 },
            { name: 'to', value: '0', index: 1 },
            { name: 'orderCount', value: '5', index: 2 },
            { name: 'amount', value: '5', index: 3 },
            { name: 'side', value: 'buy', index: 4 },
            { name: 'easing', value: 'linear', index: 5 },
            { name: 'tag', value: '', index: 6 },
        ];

        const orders = await scaledOrder(context, args);
        assert.lengthOf(orders, 5);
        assert.deepEqual(orders, expect);
    });

    it('can place simple scaled sell orders', async () => {
        const context = { ex: exchange };

        const expect = [
            { order: { id: 1 }, side: 'sell', price: 3050, amount: 1, units: '' },
            { order: { id: 1 }, side: 'sell', price: 3075, amount: 1, units: '' },
            { order: { id: 1 }, side: 'sell', price: 3100, amount: 1, units: '' },
            { order: { id: 1 }, side: 'sell', price: 3125, amount: 1, units: '' },
            { order: { id: 1 }, side: 'sell', price: 3150, amount: 1, units: '' }];

        const args = [
            { name: 'from', value: '0', index: 0 },
            { name: 'to', value: '100', index: 1 },
            { name: 'orderCount', value: '5', index: 2 },
            { name: 'amount', value: '5', index: 3 },
            { name: 'side', value: 'sell', index: 4 },
            { name: 'easing', value: 'linear', index: 5 },
            { name: 'tag', value: '', index: 6 },
        ];

        const orders = await scaledOrder(context, args);
        assert.lengthOf(orders, 5);
        assert.deepEqual(orders, expect);
    });

    it('can handle order count of zero', async () => {
        const context = { ex: exchange };

        const expect = [];

        const args = [
            { name: 'from', value: '0', index: 0 },
            { name: 'to', value: '100', index: 1 },
            { name: 'orderCount', value: '0', index: 2 },
            { name: 'amount', value: '5', index: 3 },
            { name: 'side', value: 'sell', index: 4 },
            { name: 'easing', value: 'linear', index: 5 },
            { name: 'tag', value: '', index: 6 },
        ];

        const orders = await scaledOrder(context, args);
        assert.lengthOf(orders, 0);
        assert.deepEqual(orders, expect);
    });

    it('can handle order amount of zero', async () => {
        const context = { ex: exchange };

        const expect = [];

        const args = [
            { name: 'from', value: '0', index: 0 },
            { name: 'to', value: '100', index: 1 },
            { name: 'orderCount', value: '5', index: 2 },
            { name: 'amount', value: '0', index: 3 },
            { name: 'side', value: 'sell', index: 4 },
            { name: 'easing', value: 'linear', index: 5 },
            { name: 'tag', value: '', index: 6 },
        ];

        const orders = await scaledOrder(context, args);
        assert.lengthOf(orders, 0);
        assert.deepEqual(orders, expect);
    });
});
