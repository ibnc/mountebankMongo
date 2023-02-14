# MongoDB For Mountebank [![CircleCI](https://dl.circleci.com/status-badge/img/gh/ibnc/mountebankMongo/tree/master.svg?style=svg)](https://dl.circleci.com/status-badge/redirect/gh/ibnc/mountebankMongo/tree/master)

This project allows the use of mongodb as the backend storage for imposters.

Running with mongo is pretty straightforward. Just set the impostersRepository flag to the path, and configure mongo. 

`
mb --impostersRepository $MBMONGO_PATH/mongoDBImpostersRepository.js --impostersRepositoryConfig mongo_config.json --configfile imposters.json --protofile protocols.json
`
