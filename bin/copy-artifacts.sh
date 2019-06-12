#!/bin/bash

# Delete any old artifacts from the app's directory
rm -f ../tradestars/app/js/artifacts/*

# Copy the newly compiled artifacts to the app's directory
cp build/contracts/PerformanceCard.json \
    build/contracts/PerformanceCollection.json \
    build/contracts/BondedERC20.json ../tradestars/app/js/artifacts/