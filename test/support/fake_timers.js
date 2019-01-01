const sinon = require('sinon');

// Hack to make fake timers work with promises
// see https://github.com/sinonjs/sinon/issues/738#issuecomment-428370425

const originalSetImmediate = setImmediate;

class FakeTimers {
    constructor() {
        this.clock = null;
    }

    start(t) {
        this.clock = sinon.useFakeTimers(t);
    }

    restore() {
        this.clock.restore();
    }

    async tickAsync(ms, step) {
        let toWait = ms;
        while (toWait > 0) {
            toWait -= step;
            this.clock.tick(step);
            await new Promise(resolve => originalSetImmediate(resolve));
        }
    }
}


module.exports = FakeTimers;
