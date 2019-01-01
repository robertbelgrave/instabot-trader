const assert = require('chai').assert;
const sinon = require('sinon');
const Exchange = require('../../src/exchanges/exchange');
const cancelOrders = require('../../src/exchanges/commands/cancel_orders');


class MockAPI {
    activeOrders() {}
    cancelOrders() {}
}

describe('Cancel Orders', async () => {
    let exchange;

    beforeEach(() => {
        // runs before each test in this block
        exchange = new Exchange({});

        // Build a mock API to call
        exchange.api = new MockAPI();
    });

    it('can cancel all orders', async () => {
        const orders = [{ id: 1 }, { id: 8 }];

        // Stub the ticker
        const activeOrders = sinon.stub(exchange.api, 'activeOrders');
        activeOrders.resolves(orders);

        // Stub the wallet balances
        const cancel = sinon.stub(exchange.api, 'cancelOrders');
        cancel.resolves({});

        const args = [{ name: 'which', value: 'all', index: 0 }];
        await cancelOrders({ ex: exchange, symbol: '', session: 'test-session' }, args);

        assert.equal(activeOrders.callCount, 1, 'activeOrders should be called once');
        assert.equal(cancel.callCount, 1, 'api cancelOrders should be called once');
        assert.deepEqual(cancel.getCall(0).args[0], orders, 'api cancelOrders arguments');
    });

    it('can cancel tagged orders', async () => {
        // Stub the wallet balances
        const cancel = sinon.stub(exchange.api, 'cancelOrders');
        cancel.resolves({});

        // add some orders to the session
        const session = 'test-session';
        exchange.addToSession(session, 'thing', { id: 1 });
        exchange.addToSession(session, 'thing', { id: 2 });
        exchange.addToSession(session, 'test', { id: 3 });
        exchange.addToSession(session, 'test', { id: 4 });

        const args = [
            { name: 'which', value: 'tagged', index: 0 },
            { name: 'tag', value: 'test', index: 1 },
        ];
        await cancelOrders({ ex: exchange, symbol: '', session }, args);

        assert.equal(cancel.callCount, 1, 'api cancelOrders should be called once');
        assert.deepEqual(cancel.getCall(0).args[0], [{ id: 3 }, { id: 4 }], 'api cancelOrders arguments');
    });

    it('can cancel session orders', async () => {
        // Stub the wallet balances
        const cancel = sinon.stub(exchange.api, 'cancelOrders');
        cancel.resolves({});

        // add some orders to the session
        const session = 'test-session';
        exchange.addToSession(session, 'thing', { id: 1 });
        exchange.addToSession(session, 'thing', { id: 2 });
        exchange.addToSession(session, 'test', { id: 3 });
        exchange.addToSession(session, 'test', { id: 4 });

        const args = [
            { name: 'which', value: 'session', index: 0 },
        ];
        await cancelOrders({ ex: exchange, symbol: '', session }, args);

        assert.equal(cancel.callCount, 1, 'api cancelOrders should be called once');
        assert.deepEqual(cancel.getCall(0).args[0], [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }], 'api cancelOrders arguments');
    });
});
