'use strict';

const { MongoClient, Code } = require("mongodb");

function create (config, logger) {
    const mongoCfg = getMongoConfig(config),
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
            const options = {serializeFunctions: true};
            options[id] = 1;
            result = await database.collection("imposters").findOne({}, options);
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
            const database = client.db(mongoCfg.db);
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
    const mongoCfg = getMongoConfig(config),
        client = new MongoClient(mongoCfg.uri);
    try {
        await client.connect();
        await client.db(mongoCfg.db).createCollection("imposters");
    } finally {
        await client.close();
    }
}

async function teardown (config) {
    const mongoCfg = getMongoConfig(config),
        client = new MongoClient(mongoCfg.uri);
    try {
        await client.connect();
        await client.db(mongoCfg.db).dropCollection("imposters");
    } finally {
        await client.close();
    }
}

function getMongoConfig (config) {
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

module.exports = { create, migrate, teardown };
