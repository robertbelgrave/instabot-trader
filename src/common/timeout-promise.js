/**
 * Wait for a promise to resolve, or reject it if we have had to wait 'too long'
 * @param ms
 * @param promise
 * @returns {Promise<any>}
 */
module.exports = (ms, promise) => {
    // Create a promise that rejects in <ms> milliseconds
    const timeout = new Promise((resolve, reject) => {
        const id = setTimeout(() => {
            clearTimeout(id);
            reject(`Timed out in ${ms}ms.`);
        }, ms);
    });

    // Returns a race between our timeout and the passed in promise
    return Promise.race([
        promise,
        timeout,
    ]);
};
