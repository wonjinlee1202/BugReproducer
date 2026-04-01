function findCall(capture, kind, name) {
    return capture.externalCalls.find((call) => call.kind === kind && call.name === name);
}
export function makeHttpMock(capture) {
    return async function http(name, request) {
        const call = findCall(capture, "http", name);
        if (!call) {
            throw new Error(`No captured HTTP call for ${name}`);
        }
        if (call.error) {
            throw new Error(`Captured HTTP error for ${name}: ${call.error}`);
        }
        return call.response ?? request;
    };
}
export function makeDbMock(capture) {
    return async function db(name, request) {
        const call = findCall(capture, "db", name);
        if (!call) {
            throw new Error(`No captured DB call for ${name}`);
        }
        if (call.error) {
            throw new Error(`Captured DB error for ${name}: ${call.error}`);
        }
        return call.response ?? request;
    };
}
//# sourceMappingURL=mocks.js.map