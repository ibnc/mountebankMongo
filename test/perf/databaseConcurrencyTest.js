'use strict';

const assert = require('assert'),
  mongoRepo = require('../../mongoDBImpostersRepository'),
  impostersRepoConfig = { impostersRepositoryConfig: './test/test_config.json' },
  fs = require('fs');

describe('database concurrency', function () {
  let repom;
  this.timeout(120000);

  before(async function () {
    await mongoRepo.migrate(impostersRepoConfig, logger());
    repom = await mongoRepo.create(impostersRepoConfig, logger());
  });

  after(async function () {
    await repom.teardown();
  });

  afterEach(function () {
    fs.removeSync('.mbtest');
  });

  function logger () {
    return {
      debug: () => {},
      info: () => {},
      warn: msg => { console.log(msg); },
      error: msg => { console.error(msg); }
    };
  }

  describe('#nextResponse', function () {
    function responseFor (i) {
      return { is: { value: i } };
    }

    function valueFrom (response) {
      return Number(response.is.value);
    }

    it('should handle concurrent load correctly and performantly', async function () {
      const stubs = await repom.stubsFor(1000),
        startingValues = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        responses = startingValues.map(responseFor),
        start = new Date(),
        runs = responses.length * 100;

      // Uncomment to expose prometheus metrics on http://localhost:2525/metrics
      // const options = {
      //     port: 2525,
      //     logfile: 'mb.log',
      //     ipWhitelist: ['*']
      // };
      // await require('../src/mountebank').create(options)

      await stubs.add({ responses });
      const saved = await stubs.first(() => true),
        promises = [];

      for (let i = 0; i < runs; i += 1) {
        promises.push(saved.stub.nextResponse());
      }

      const results = await Promise.all(promises),
        duration = new Date() - start,
        values = results.map(valueFrom),
        actual = {},
        expected = {};

      console.log(`Took ${duration}ms for ${runs} calls (${duration / runs}ms per call)`);
      assert.ok(duration < runs * 70, `Took too long: ${duration}ms`);

      // It's OK if responses are returned out of order -- we're running more or less concurrently after all
      // The key for correctness is to ensure we get the right number in each bucket
      startingValues.forEach(i => {
        actual[i] = values.filter(value => value === i).length;
        expected[i] = runs / responses.length;
      });
      assert.deepEqual(actual, expected, 'Unexpected response counts');
    });
  });
});
