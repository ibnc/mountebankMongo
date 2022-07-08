'use strict';

/**
 * Error types returned by the API
 * @module
 */

function createError (code, message, options) {
  const inherit = require('./inherit'),
    result = inherit.from(Error, { code, message });

  if (options) {
    Object.keys(options).forEach(key => {
      result[key] = options[key];
    });
  }
  return result;
}

function create (code) {
  return (message, options) => createError(code, message, options);
}

function createWithMessage (code, message) {
  return options => createError(code, message, options);
}

// Produces a JSON.stringify-able Error object
// (because message is on the prototype, it doesn't show by default)
function details (error) {
  const helpers = require('./helpers'),
    prototypeProperties = {};

  ['message', 'name', 'stack'].forEach(key => {
    if (error[key]) {
      prototypeProperties[key] = error[key];
    }
  });
  return helpers.merge(error, prototypeProperties);
}

module.exports = {
  InvalidJSONError: createWithMessage('invalid JSON', 'Unable to parse body as JSON'),
  MissingResourceError: create('no such resource'),
  DatabaseError: create('corrupted database'),
  ConfigError: create('configuration error'),
  MissingConfigError: create('missing configuration file'),
  details
};
