const assert = require('chai').assert;
const util = require('../src/common/util');
const scaledAmounts = require('../src/common/scaled_amounts');

const round = p => util.roundDown(p, 6);


describe('Scaled Amounts', () => {
    it('can handle silly inputs', () => {
        assert.deepEqual(scaledAmounts(0, 10, 0, round), []);

        const randomised = scaledAmounts(4, 10, 2, round);
        const min = randomised.reduce((t, entry) => (entry < t ? entry : t), 10);
        assert.isAbove(min, 0);
    });

    it('can generate linear amounts', () => {
        assert.deepEqual(scaledAmounts(5, 10, 0, round), [2, 2, 2, 2, 2]);
        assert.deepEqual(scaledAmounts(5, 2, 0, round), [0.4, 0.4, 0.4, 0.4, 0.4]);

        const randomDiff = 0.1;
        const randomised = scaledAmounts(5, 10, randomDiff, round);
        const sum = util.round(randomised.reduce((t, entry) => t + entry, 0), 4);
        const min = randomised.reduce((t, entry) => (entry < t ? entry : t), 2);
        const max = randomised.reduce((t, entry) => (entry > t ? entry : t), 2);

        assert.equal(sum, 10);
        assert.isBelow(min, 2);
        assert.isAbove(max, 2);
    });

    it('can handle rounding', () => {
        const round2 = p => util.roundDown(p, 0);
        assert.deepEqual(scaledAmounts(3, 100, 0, round2), [33, 33, 34]);
    });
});
