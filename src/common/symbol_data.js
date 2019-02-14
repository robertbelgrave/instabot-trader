const logger = require('./logger').logger;


class SymbolData {
    constructor() {
        this.all = [];
    }

    update(symbol, data) {
        this.all = this.all.filter(s => s.symbol !== symbol);

        this.all.push(Object.assign({
            symbol,
            minOrderSize: 0.002,
            pricePrecision: 2,
            assetPrecision: 6,
        }, data));
    }

    find(symbol) {
        const sd = this.all.find(el => el.symbol === symbol);
        if (!sd) {
            logger.error(`Failed to find symbol data for ${symbol}`);
        }

        return sd;
    }

    minOrderSize(symbol) {
        const sd = this.find(symbol);
        if (!sd || !sd.minOrderSize) {
            return 0;
        }

        return sd.minOrderSize;
    }

    pricePrecision(symbol) {
        const sd = this.find(symbol);
        if (!sd || !sd.pricePrecision) {
            return 2;
        }

        return sd.pricePrecision;
    }

    assetPrecision(symbol) {
        const sd = this.find(symbol);
        if (!sd || !sd.assetPrecision) {
            return 6;
        }

        return sd.assetPrecision;
    }
}

module.exports = SymbolData;
