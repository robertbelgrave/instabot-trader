
/**
 * Work out the actual order size for the scaled order for exchanges that use contracts
 */
module.exports = async (context, p) => {
    const { ex = {}, symbol = '' } = context;

    // need to have at least 1 contract per order
    if (p.amount.units === '') {
        if ((p.amount.value / p.orderCount) < ex.symbolData.minOrderSize(symbol)) {
            return 0;
        }
    }

    // Order what you like, leverage will adjust
    return p.amount.value;
};
