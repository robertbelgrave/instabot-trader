const sinon = require('sinon');
const assert = require('chai').assert;
const wait = require('../src/exchanges/commands/wait');
const FakeTimers = require('./support/fake_timers');
const Exchange = require('../src/exchanges/exchange');


describe('Wait', () => {
    let fakeTimer;

    beforeEach(() => {
        fakeTimer = new FakeTimers();
        fakeTimer.start();
    });

    afterEach(() => {
        fakeTimer.restore();
    });

    it('can wait', async () => {
        const exchange = new Exchange({});

        const args = [
            { name: 'duration', value: '10s', index: 0 },
        ];

        var finished = sinon.fake();
        wait({ ex: exchange }, args).then(() => {
            finished();
        });

        // after 9s we should not have finished
        assert.equal(finished.callCount, 0);
        await fakeTimer.tickAsync(9000, 100);
        assert.equal(finished.callCount, 0);

        // but after 10s, we have
        await fakeTimer.tickAsync(1100, 10);
        assert.equal(finished.callCount, 1);
    });
});
