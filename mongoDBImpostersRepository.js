'use strict';

const { MongoClient, Code } = require("mongodb");

function create (config, logger) {
    const mongoCfg = getMongoConfig(config, logger),
        client = new MongoClient(mongoCfg.uri);

    /**
     * Adds a new imposter
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Object} imposter - the imposter to add
     * @returns {Object} - the promise
     */
    async function add (imposter) {
        if (!imposter.stubs) {
            imposter.stubs = [];
        }

        try {
            await client.connect();
            const doc = {};
            doc[imposter.port] = imposter;
            await client.db(mongoCfg.db).collection("imposters").insertOne(doc, {serializeFunctions: true});
        } finally {
            await client.close();
        }
        return imposter;
    }

    /**
     * Gets the imposter by id
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Number} id - the id of the imposter (e.g. the port)
     * @returns {Object} - the imposter
     */
    async function get (id) {
        let result;
        try {
            await client.connect();
            const database = client.db(mongoCfg.db);
            const options = {};
            options[id] = { $exists: true };
            result = await database.collection("imposters").findOne(options, {serializeFunctions: true});
        } finally {
            await client.close();
        }
        if (result) {
            Object.keys(result[String(id)]).forEach( k => {
                if (result[String(id)][k] instanceof Code) {
                    // dear god, kill me T_T (╯°□°)╯︵ ┻━┻
                    result[String(id)][k] = eval(result[String(id)][k].code);
                }
            });
            return result[String(id)];
        } else {
            return null;
        }
    }

    /**
     * Gets all imposters
     * @memberOf module:models/inMemoryImpostersRepository#
     * @returns {Object} - all imposters keyed by port
     */
    async function all () {
        let result = [];
        try {
            await client.connect();
            result = await client.db(mongoCfg.db).collection("imposters").find().toArray();
        } finally {
            await client.close();
        }
        return result.map((imp) => { return Object.entries(imp)[0][1]; });
    }

    /**
     * Returns whether an imposter at the given id exists or not
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Number} id - the id (e.g. the port)
     * @returns {boolean}
     */
    async function exists (id) {
        let result;
        try {
            await client.connect();
            const database = client.db(mongoCfg.db);
            const options = {};
            options[id] = { $exists: true };
            result = await database.collection("imposters").findOne(options);
        } finally {
            await client.close();
        }
        if (result) {
            return true;
        } else {
            return false;
        }
    }

    /**
     * Deletes the imposter at the given id
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Number} id - the id (e.g. the port)
     * @returns {Object} - the deletion promise
     */
    async function del (id) {
        let result;
        try {
            await client.connect();
            const database = client.db(mongoCfg.db);
            const options = {};
            options[id] = { $exists: true };
            result = await database.collection("imposters").findOneAndDelete(options);
        } finally {
            await client.close();
        }
        if (result.value) {
            return result.value[String(id)];
        } else {
            return null;
        }
    }

    /**
     * Deletes all imposters synchronously; used during shutdown
     * @memberOf module:models/inMemoryImpostersRepository#
     */
    function stopAllSync () {
        // Object.keys(imposters).forEach(id => {
        //     imposters[id].stop();
        //     delete imposters[id];
        //     delete stubRepos[id];
        // });
    }

    /**
     * Deletes all imposters
     * @memberOf module:models/inMemoryImpostersRepository#
     * @returns {Object} - the deletion promise
     */
    async function deleteAll () {
        try {
            await client.connect();
            await client.db(mongoCfg.db).collection("imposters").deleteMany({});
        } finally {
            await client.close();
        }
    }

    /**
     * Returns the stub repository for the given id
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Number} id - the imposter's id
     * @returns {Object} - the stub repository
     */
    function stubsFor (id) {
        const imposter = get(id);
        if (imposter) {
            return stubRepository(imposter.stubs);
        } else {
            return stubRepository();
        }
    }

    /**
     * Called at startup to load saved imposters.
     * Does nothing for in memory repository
     * @memberOf module:models/inMemoryImpostersRepository#
     * @returns {Object} - a promise
     */
    async function loadAll () {
        // return Promise.resolve();
    }
    return {
        add,
        get,
        all,
        exists,
        del,
        stopAllSync,
        deleteAll,
        stubsFor,
        loadAll
    };
}
async function migrate (config, logger) {
    const mongoCfg = getMongoConfig(config, logger),
        client = new MongoClient(mongoCfg.uri);
    try {
        await client.connect();
        await client.db(mongoCfg.db).createCollection("imposters");
    } finally {
        await client.close();
    }
}

async function teardown (config, logger) {
    const mongoCfg = getMongoConfig(config, logger),
        client = new MongoClient(mongoCfg.uri);
    try {
        await client.connect();
        await client.db(mongoCfg.db).dropCollection("imposters");
    } finally {
        await client.close();
    }
}

function getMongoConfig (config, logger) {
    if (!config.impostersRepositoryConfig) {
        logger.error(`No configuration file for mongodb`);
        return {};
    }
    const fs = require('fs-extra'),
        path = require('path'),
        cfg = path.resolve(path.relative(process.cwd(), config.impostersRepositoryConfig));
    if (fs.existsSync(cfg)) {
        return require(cfg);
    } else {
        logger.error(`configuration file does not exist`);
        return {};
    }
}

/**
 * Creates the stubs repository for a single imposter
 * @returns {Object}
 */
function stubRepository (d) {
    const stubs = d || [];
    let requests = [];

    /**
     * Returns the first stub whose predicates match the filter, or a default one if none match
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Function} filter - the filter function
     * @param {Number} startIndex - the index to to start searching
     * @returns {Object}
     */
    async function first (filter, startIndex = 0) {
        for (let i = startIndex; i < stubs.length; i += 1) {
            if (filter(stubs[i].predicates || [])) {
                return { success: true, stub: stubs[i] };
            }
        }
        return { success: false, stub: wrap() };
    }

    /**
     * Adds a new stub
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Object} stub - the stub to add
     * @returns {Object} - the promise
     */
    async function add (stub) {
        stubs.push(wrap(stub));
        // reindex();
    }

    /**
     * Inserts a new stub at the given index
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Object} stub - the stub to insert
     * @param {Number} index - the index to add the stub at
     * @returns {Object} - the promise
     */
    async function insertAtIndex (stub, index) {
        stubs.splice(index, 0, wrap(stub));
        // reindex();
    }

    /**
     * Overwrites the list of stubs with a new list
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Object} newStubs - the new list of stubs
     * @returns {Object} - the promise
     */
    async function overwriteAll (newStubs) {
        while (stubs.length > 0) {
            stubs.pop();
        }
        newStubs.forEach(stub => add(stub));
        // reindex();
    }

    /**
     * Overwrites the stub at the given index with the new stub
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Object} newStub - the new stub
     * @param {Number} index - the index of the old stuib
     * @returns {Object} - the promise
     */
    async function overwriteAtIndex (newStub, index) {
        // const errors = require('../util/errors');
        if (typeof stubs[index] === 'undefined') {
            // throw errors.MissingResourceError(`no stub at index ${index}`);
        }

        stubs[index] = wrap(newStub);
        // reindex();
    }

    /**
     * Deletes the stub at the given index
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Number} index - the index of the stub to delete
     * @returns {Object} - the promise
     */
    async function deleteAtIndex (index) {
        // const errors = require('../util/errors');
        if (typeof stubs[index] === 'undefined') {
            // throw errors.MissingResourceError(`no stub at index ${index}`);
        }

        stubs.splice(index, 1);
        // reindex();
    }

    /**
     * Returns a JSON-convertible representation
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Object} options - The formatting options
     * @param {Boolean} options.debug - If true, includes debug information
     * @returns {Object} - the promise resolving to the JSON object
     */
    async function toJSON (options = {}) {
        const cloned = JSON.parse(JSON.stringify(stubs));

        cloned.forEach(stub => {
            if (!options.debug) {
                delete stub.matches;
            }
        });

        return cloned;
    }

    /**
     * Removes the saved proxy responses
     * @memberOf module:models/inMemoryImpostersRepository#
     * @returns {Object} - Promise
     */
    async function deleteSavedProxyResponses () {
        // const allStubs = await toJSON();
        // allStubs.forEach(stub => {
        //     stub.responses = stub.responses.filter(response => !isRecordedResponse(response));
        // });
        // const nonProxyStubs = allStubs.filter(stub => stub.responses.length > 0);
        // await overwriteAll(nonProxyStubs);
    }

    /**
     * Adds a request for the imposter
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Object} request - the request
     * @returns {Object} - the promise
     */
    async function addRequest (request) {
        // const helpers = require('../util/helpers');

        // const recordedRequest = helpers.clone(request);
        // recordedRequest.timestamp = new Date().toJSON();
        // requests.push(recordedRequest);
    }

    /**
     * Returns the saved requests for the imposter
     * @memberOf module:models/inMemoryImpostersRepository#
     * @returns {Object} - the promise resolving to the array of requests
     */
    async function loadRequests () {
        // return requests;
    }

    /**
     * Clears the saved requests list
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Object} request - the request
     * @returns {Object} - Promise
     */
    async function deleteSavedRequests () {
        // requests = [];
    }

    return {
        count: () => stubs.length,
        first,
        add,
        insertAtIndex,
        overwriteAll,
        overwriteAtIndex,
        deleteAtIndex,
        toJSON,
        deleteSavedProxyResponses,
        addRequest,
        loadRequests,
        deleteSavedRequests
    };
}
/**
 * An abstraction for loading imposters from in-memory
 * @module
 */

function repeatsFor (response) {
    return response.repeat || 1;
}

function repeatTransform (responses) {
    const result = [];
    let response, repeats;

    for (let i = 0; i < responses.length; i += 1) {
        response = responses[i];
        repeats = repeatsFor(response);
        for (let j = 0; j < repeats; j += 1) {
            result.push(response);
        }
    }
    return result;
}

function createResponse (responseConfig, stubIndexFn) {
    const cloned = JSON.parse(JSON.stringify(responseConfig)) || { is: {} };

    cloned.stubIndex = stubIndexFn ? stubIndexFn : () => Promise.resolve(0);

    return cloned;
}

function wrap (stub = {}) {
    const cloned = stub,
    statefulResponses = repeatTransform(cloned.responses || []);

    /**
     * Adds a new response to the stub (e.g. during proxying)
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Object} response - the response to add
     * @returns {Object} - the promise
     */
    cloned.addResponse = async response => {
        cloned.responses = cloned.responses || [];
        cloned.responses.push(response);
        statefulResponses.push(response);
        return response;
    };

    /**
     * Selects the next response from the stub, including repeat behavior and circling back to the beginning
     * @memberOf module:models/inMemoryImpostersRepository#
     * @returns {Object} - the response
     * @returns {Object} - the promise
     */
    cloned.nextResponse = async () => {
        const responseConfig = statefulResponses.shift();

        if (responseConfig) {
            statefulResponses.push(responseConfig);
            return createResponse(responseConfig, cloned.stubIndex);
        }
        else {
            return createResponse();
        }
    };

    /**
     * Records a match for debugging purposes
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Object} request - the request
     * @param {Object} response - the response
     * @param {Object} responseConfig - the config that generated the response
     * @param {Number} processingTime - the time to match the predicate and generate the full response
     * @returns {Object} - the promise
     */
    cloned.recordMatch = async (request, response, responseConfig, processingTime) => {
        cloned.matches = cloned.matches || [];
        cloned.matches.push({
            timestamp: new Date().toJSON(),
            request,
            response,
            responseConfig,
            processingTime
        });
    };

    return cloned;
}

module.exports = { create, migrate, teardown };
