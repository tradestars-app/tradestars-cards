#!/bin/bash

APP_PATH="../../tradestars-ui/src/artifacts"

# Delete any old artifacts from the app's directory
rm -f $APP_PATH/PerformanceCard.json $APP_PATH/PerformanceCollection.json $APP_PATH/BondedERC20.json

# Copy the newly compiled artifacts to the app's directory
cp build/contracts/PerformanceCard.json \
    build/contracts/PerformanceCollection.json \
    build/contracts/BondedERC20.json \
    $APP_PATH