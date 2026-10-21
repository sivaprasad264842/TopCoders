/** Tiny FIFO semaphore: at most `limit` jobs run at once, the rest wait. */
export function createSemaphore(limit) {
    let active = 0;
    const queue = [];

    // A finished job hands its slot straight to the next waiter, so a new
    // caller can never sneak in between and push us over the limit.
    const release = () => {
        const next = queue.shift();
        if (next) next();
        else active -= 1;
    };

    return {
        /** Jobs running + jobs waiting. */
        get pending() {
            return active + queue.length;
        },
        async run(task) {
            if (active >= limit) {
                await new Promise((resolve) => queue.push(resolve));
            } else {
                active += 1;
            }
            try {
                return await task();
            } finally {
                release();
            }
        },
    };
}
