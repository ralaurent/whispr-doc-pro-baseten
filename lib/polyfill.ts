if (typeof Promise.withResolvers === "undefined") {
    // @ts-expect-error polyfill for Promise.withResolvers
    Promise.withResolvers = function () {
        let resolve, reject;
        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return { promise, resolve, reject };
    };
}
