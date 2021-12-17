'use strict';

const { MongoClient } = require("mongodb");

function create (config, logger) {
    const client = new MongoClient(config.mongo.uri);

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
            // await database.collection("imposters").insertOne(doc).toJSON();
            await client.db(config.mongo.db).collection("imposters").insertOne(doc);
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
        // await MongoClient.connect(config.mongo.uri, function(err, client) {
        //     // const database = client.db(config.mongo.db);
        //     const options = {};
        //     options[id] = 1;
        //     result = client.db(config.mongo.db).collection("imposters").findOne({}, options);
        //     client.close();
        //     return result;
        // });
        try {
            await client.connect();
            const database = client.db(config.mongo.db);
            const options = {};
            options[id] = 1;
            result = await database.collection("imposters").findOne({}, options);
        } finally {
            await client.close();
        }
        if (result) {
            return result[String(id)];
        } else {
            return null;
        }
        // return result[String(id)] || null;
        // return imposters[String(id)] || null;
    }

    /**
     * Gets all imposters
     * @memberOf module:models/inMemoryImpostersRepository#
     * @returns {Object} - all imposters keyed by port
     */
    async function all () {
        // return Promise.all(Object.keys(imposters).map(get));
    }

    /**
     * Returns whether an imposter at the given id exists or not
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Number} id - the id (e.g. the port)
     * @returns {boolean}
     */
    async function exists (id) {
        // return typeof imposters[String(id)] !== 'undefined';
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
            const database = client.db(config.mongo.db);
            const options = {};
            options[id] = 1;
            result = await database.collection("imposters").findOneAndDelete({}, options);
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
        // const ids = Object.keys(imposters),
        //     promises = ids.map(id => imposters[id].stop());

        // ids.forEach(id => {
        //     delete imposters[id];
        //     delete stubRepos[id];
        // });
        // await Promise.all(promises);
    }

    /**
     * Returns the stub repository for the given id
     * @memberOf module:models/inMemoryImpostersRepository#
     * @param {Number} id - the imposter's id
     * @returns {Object} - the stub repository
     */
    function stubsFor (id) {
        // In practice, the stubsFor call occurs before the imposter is actually added...
        // if (!stubRepos[String(id)]) {
        //     stubRepos[String(id)] = createStubsRepository();
        // }

        // return stubRepos[String(id)];
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
async function migrate (config) {
    // MongoClient.connect(config.mongo.uri, function (err, client) {
    //     const database = client.db(config.mongo.db);
    //     database.createCollection("imposters");
    //     client.close();
    // });
    const client = new MongoClient(config.mongo.uri);
    try {
        await client.connect();
        await client.db(config.mongo.db).createCollection("imposters");
    } finally {
        await client.close();
    }
}

async function teardown (config) {
    const client = new MongoClient(config.mongo.uri);
    try {
        await client.connect();
        await client.db(config.mongo.db).dropCollection("imposters");
    } finally {
        await client.close();
    }
}

module.exports = { create, migrate, teardown };
