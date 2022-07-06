# Superpool Project

This project is still in a very early stage. Please understand the code as a proof of concept.

A description of the first thoughts can be found at [Description](https://chalk-hour-451.notion.site/Stream-pool-57d7f2619a984c849da71af25310d1e2)

For the time being the two relevants files are:

[PoolFactoryContract](https://github.com/donoso-eth/super-pool/blob/master/hardhat/contracts/PoolFactory.sol) 

and the test-use case used to follow trough the different pool events

[Use case Tests](https://github.com/donoso-eth/super-pool/blob/master/hardhat/test/use_case_tests.ts)

## Tests

In order to reproduce the tests please run following commands
```
/// spin forked blockchain
npm run fork
````
and

```
/// runt tests
npm run contracts:test
````

