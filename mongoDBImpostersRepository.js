'use strict';

const { MongoClient, Code } = require('mongodb');
const errors = require('./utils/errors');

/* TODO:
 * Error handling
 * Address async/sync issues with stubsFor and stopAllSync
*/
function create (config, logger) {
  const mongoCfg = getMongoConfig(config, logger),
    client = new MongoClient(mongoCfg.uri);
  client.connect();

  /**
   * Adds a new imposter
   * @memberOf module:mongoDBImpostersRepository#
   * @param {Object} imposter - the imposter to add
   * @returns {Object} - the promise
   */
  async function add (imposter) {
    if (!imposter.stubs) {
      imposter.stubs = [];
    }

    const doc = {};
    doc[imposter.port] = imposter;
    await client.db(mongoCfg.db).collection('imposters').insertOne(doc, { serializeFunctions: true });
    return imposter;
  }

  async function update (imposter) {
    const doc = {},
      options = {};
    doc[imposter.port] = imposter;
    options[imposter.port] = { $exists: true };
    await client.db(mongoCfg.db).collection('imposters').replaceOne(options, doc, { serializeFunctions: true });
  }

  /**
   * Gets the imposter by id
   * @memberOf module:mongoDBImpostersRepository#
   * @param {Number} id - the id of the imposter (e.g. the port)
   * @returns {Object} - the imposter
   */
  async function get (id) {
    let result;
    const database = client.db(mongoCfg.db),
      options = {};
    options[id] = { $exists: true };
    result = await database.collection('imposters').findOne(options, { serializeFunctions: true });

    if (result) {
      Object.keys(result[String(id)]).forEach(k => {
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
   * @memberOf module:mongoDBImpostersRepository#
   * @returns {Object} - all imposters keyed by port
   */
  async function all () {
    let result = await client.db(mongoCfg.db).collection('imposters').find().toArray();
    return result.map(imp => { return Object.entries(imp)[0][1]; });
  }

  /**
   * Returns whether an imposter at the given id exists or not
   * @memberOf module:mongoDBImpostersRepository#
   * @param {Number} id - the id (e.g. the port)
   * @returns {boolean}
   */
  async function exists (id) {
    let result;
    const database = client.db(mongoCfg.db),
      options = {};
    options[id] = { $exists: true };
    result = await database.collection('imposters').findOne(options);

    if (result) {
      return true;
    } else {
      return false;
    }
  }

  /**
   * Deletes the imposter at the given id
   * @memberOf module:mongoDBImpostersRepository#
   * @param {Number} id - the id (e.g. the port)
   * @returns {Object} - the deletion promise
   */
  async function del (id) {
    let result;
    const database = client.db(mongoCfg.db),
      options = {};
    options[id] = { $exists: true };
    result = await database.collection('imposters').findOneAndDelete(options);

    if (result.value) {
      const res = result.value[String(id)];
      if (res.stop) {
        const stopFn = eval(res.stop.code);

        if (typeof stopFn === 'function') {
          await stopFn();
        }
        delete res.stop;
      }
      return res;
    } else {
      return null;
    }
  }

  /**
   * Deletes all imposters synchronously; used during shutdown
   * @memberOf module:mongoDBImpostersRepository#
   */
  async function stopAllSync () {
    await deleteAll(async () => {
      await client.close();
    });
  }

  /**
   * Deletes all imposters
   * @memberOf module:mongoDBImpostersRepository#
   * @param {Function} callback - callback fn
   * @returns {Object} - the deletion promise
   */
  async function deleteAll (callback) {
    const imposters = await all();
    if (imposters.length > 0) {
      await imposters.forEach(async imposter => {
        if (imposter.stop) {
          const stopFn = eval(imposter.stop.code);
          if (typeof stopFn === 'function') {
            await stopFn();
          }
        }
      });
      await client.db(mongoCfg.db).collection('imposters').deleteMany({});
    }
    if (callback) {
      await callback();
    }
  }

  /**
   * Returns the stub repository for the given id
   * @memberOf module:mongoDBImpostersRepository#
   * @param {Number} id - the imposter's id
   * @returns {Object} - the stub repository
   */
  async function stubsFor (id) {
    return await get(id).then(imposter => {
      if (!imposter) {
        imposter = { stubs: [] };
      }
      return stubRepository(imposter);
    });
  }

  /**
   * Called at startup to load saved imposters.
   * Does nothing for in memory repository
   * @memberOf module:mongoDBImpostersRepository#
   * @returns {Object} - a promise
   */
  async function loadAll () {
    return await all();
  }

  // For testing purposes
  async function connect () {
    await client.connect();
  }

  // For testing purposes
  async function close () {
    await client.close();
  }

  // For testing purposes
  async function teardown () {
    try {
      if (!client || !client.topology || !client.topology.isConnected()) {
        await client.connect();
      }
      await client.db(mongoCfg.db).dropCollection('imposters');
    } finally {
      await client.close(true);
    }
  }

  /**
   * Creates the stubs repository for a single imposter
   * @memberOf module:mongoDBImpostersRepository#
   * @param {Object} imposter - imposter
   * @returns {Object}
   */
  async function stubRepository (imposter) {
    const stubs = [];
    let requests = [];
    await addAll(imposter.stubs);

    async function reindex () {
      // stubIndex() is used to find the right spot to insert recorded
      // proxy responses. We reindex after every state change
      stubs.forEach((stub, index) => {
        stub.stubIndex = async () => index;
      });
      imposter.stubs = stubs;
      await update(imposter);
    }

    /**
     * Returns the first stub whose predicates match the filter, or a default one if none match
     * @memberOf module:mongoDBImpostersRepository#
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

    async function addAll (newStubs) {
      newStubs.forEach(stub => {
        stubs.push(wrap(stub));
      });
      await reindex();
    }

    /**
     * Adds a new stub
     * @memberOf module:mongoDBImpostersRepository#
     * @param {Object} stub - the stub to add
     * @returns {Object} - the promise
     */
    // eslint-disable-next-line no-shadow
    async function add (stub) {
      stubs.push(wrap(stub));
      await reindex();
    }

    /**
     * Inserts a new stub at the given index
     * @memberOf module:mongoDBImpostersRepository#
     * @param {Object} stub - the stub to insert
     * @param {Number} index - the index to add the stub at
     * @returns {Object} - the promise
     */
    async function insertAtIndex (stub, index) {
      stubs.splice(index, 0, wrap(stub));
      await reindex();
    }

    /**
     * Overwrites the list of stubs with a new list
     * @memberOf module:mongoDBImpostersRepository#
     * @param {Object} newStubs - the new list of stubs
     * @returns {Object} - the promise
     */
    async function overwriteAll (newStubs) {
      while (stubs.length > 0) {
        stubs.pop();
      }
      await addAll(newStubs);
    }

    /**
     * Overwrites the stub at the given index with the new stub
     * @memberOf module:mongoDBImpostersRepository#
     * @param {Object} newStub - the new stub
     * @param {Number} index - the index of the old stuib
     * @returns {Object} - the promise
     */
    async function overwriteAtIndex (newStub, index) {
      if (typeof stubs[index] === 'undefined') {
        throw errors.MissingResourceError(`no stub at index ${index}`);
      }

      stubs[index] = wrap(newStub);
      await reindex();
    }

    /**
     * Deletes the stub at the given index
     * @memberOf module:mongoDBImpostersRepository#
     * @param {Number} index - the index of the stub to delete
     * @returns {Object} - the promise
     */
    async function deleteAtIndex (index) {
      if (typeof stubs[index] === 'undefined') {
        throw errors.MissingResourceError(`no stub at index ${index}`);
      }

      stubs.splice(index, 1);
      await reindex();
    }

    /**
     * Returns a JSON-convertible representation
     * @memberOf module:mongoDBImpostersRepository#
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

    function isRecordedResponse (response) {
      return response.is && typeof response.is._proxyResponseTime === 'number';
    }

    /**
     * Removes the saved proxy responses
     * @memberOf module:mongoDBImpostersRepository#
     * @returns {Object} - Promise
     */
    async function deleteSavedProxyResponses () {
      const allStubs = await toJSON();
      allStubs.forEach(stub => {
        stub.responses = stub.responses.filter(response => !isRecordedResponse(response));
      });
      const nonProxyStubs = allStubs.filter(stub => stub.responses.length > 0);
      await overwriteAll(nonProxyStubs);
    }

    /**
     * Adds a request for the imposter
     * @memberOf module:mongoDBImpostersRepository#
     * @param {Object} request - the request
     * @returns {Object} - the promise
     */
    async function addRequest (request) {
      const helpers = require('./utils/helpers');

      const recordedRequest = helpers.clone(request);
      recordedRequest.timestamp = new Date().toJSON();
      requests.push(recordedRequest);
    }

    /**
     * Returns the saved requests for the imposter
     * @memberOf module:mongoDBImpostersRepository#
     * @returns {Object} - the promise resolving to the array of requests
     */
    async function loadRequests () {
      return requests;
    }

    /**
     * Clears the saved requests list
     * @memberOf module:mongoDBImpostersRepository#
     * @param {Object} request - the request
     * @returns {Object} - Promise
     */
    async function deleteSavedRequests () {
      requests = [];
    }

    function wrap (stub = {}) {
      const cloned = JSON.parse(JSON.stringify(stub)),
        statefulResponses = repeatTransform(cloned.responses || []);

      /**
       * Adds a new response to the stub (e.g. during proxying)
       * @memberOf module:mongoDBImpostersRepository#
       * @param {Object} response - the response to add
       * @returns {Object} - the promise
       */
      cloned.addResponse = async response => {
        cloned.responses = cloned.responses || [];
        cloned.responses.push(response);
        statefulResponses.push(response);
        await update(imposter);
        return response;
      };

      /**
       * Selects the next response from the stub, including repeat behavior and circling back to the beginning
       * @memberOf module:mongoDBImpostersRepository#
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
       * @memberOf module:mongoDBImpostersRepository#
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
        await update(imposter);
      };

      return cloned;
    }

    return {
      count: () => stubs.length,
      first,
      addAll,
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
  return {
    add,
    get,
    all,
    exists,
    del,
    stopAllSync,
    teardown,
    deleteAll,
    stubsFor,
    connect,
    close,
    loadAll
  };
}
async function migrate (config, logger) {
  const mongoCfg = getMongoConfig(config, logger),
    client = new MongoClient(mongoCfg.uri);
  try {
    await client.connect();
    await client.db(mongoCfg.db).createCollection('imposters');
  } finally {
    await client.close();
  }
}

function getMongoConfig (config, logger) {
  if (!config.impostersRepositoryConfig) {
    logger.error('MissingConfigError: No configuration file for mongodb');
    throw errors.MissingConfigError('mongodb configuration required');
  }
  const fs = require('fs'),
    path = require('path'),
    cfg = path.resolve(path.relative(process.cwd(), config.impostersRepositoryConfig));
  if (fs.existsSync(cfg)) {
    return require(cfg);
  } else {
    logger.error('configuration file does not exist');
    throw errors.MissingConfigError('provided config file does not exist');
  }
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
  let cloned = { is: {} };
  if (responseConfig) {
    cloned = JSON.parse(JSON.stringify(responseConfig));
  }

  cloned.stubIndex = stubIndexFn ? stubIndexFn : () => Promise.resolve(0);

  return cloned;
}


module.exports = { create, migrate };
