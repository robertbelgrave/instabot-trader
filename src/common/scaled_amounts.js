const util = require('./util');

/**
 *
 * @param orderCount
 * @param totalSpend
 * @param randomDiff - 0-1
 * @param round
 * @returns {number[]}
 */
module.exports = (orderCount, totalSpend, randomDiff, round) => {
    // No orders, no results
    if (orderCount < 1) {
        return [];
    }

    if (orderCount < 2) {
        return [totalSpend];
    }

    // Create an array with a value of 1 for each order
    const sizes = Array(...Array(orderCount)).map(() => 1);

    // Add or remove a random amount from each entry in line with the scaling
    const safeDiff = Math.max(Math.min(randomDiff, 1), 0);
    const randomised = sizes.map(entry => entry + ((Math.random() * safeDiff * 2) - safeDiff));

    // scale the values so they add up to the totalSpend
    const unscaledTotal = randomised.reduce((t, orderSize) => t + orderSize, 0);
    const scaleFactor = totalSpend / unscaledTotal;

    let error = 0;
    return randomised.map((entry) => {
        const wish = (entry * scaleFactor) + error;
        const have = round(wish);
        error = wish - have;
        return have;
    });
};

