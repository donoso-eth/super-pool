# Super Pool

**Table of Contents**

---

## Description

The super-pool contract allows users to deposit superTokens (in one-shot or streaming) into the pool. For every token a user stakes into the pool, they will receive a “Super Pool” (spToken) token (ERC20 token interest-bearing token).

The super pool will push tokens to a Defi strategy, the super pool accepts n-strategies per superToken creating a pool for every strategy.

The earned yield will be allocated to the users according to “dollar-seconds” accounting rules.

Users will see their balance of “spToken” increasing over time.

Users can redeem at any moment their “spTokens” and get them converted to superTokens

In the same way, a user can redeem a flow of  “spTokens” in this case, the user will receive a flow of supeTokens .Although the flow is constant, the Defi withdrawal will follow a “down-stairs” pattern to ensure the pool does not run out of funds while maintaining the maximum deposit into the Defi protocol

## Contract Structure

Contracts can be found at: [contracts](https://github.com/donoso-eth/super-pool/tree/master/hardhat/contracts)

**Super Pool Factory**

The contract is responsible for creating the pools, it creates proxies of the pool and pool internal implementation and initializes them. 

It creates a pool per superToken and pool strategy (aave, compound….)

### Pool

Main user interaction (send tokens (IERC77 receive), stream, withdraw, out stream) implements is an ERC20 and SuperApp implementing callbacks. 

The pool contract is like an API that interact with the user and redirect the calls to the backend (the pool Internal contract)

### PoolInternal

Responsible for holding the state of the pool, updating it, and launching the withdrawal, streams etc…

### PoolStrategy

The strategy to use with this pool, by deploying the pool will approve the pool strategy contract to move tokens and superTokens around.

The pool Strategy contract must implement a very simple interface with two functions:

- The current balance of the strategy: balanceOf()
- Withdraw from the strategy: withdraw()

The strategy decides when to push tokens and is responsible for accruing yield.

## Data Objects

### Pool

For every pool interaction, a new pool object will be created with the relevant fields and store by timestamp

```tsx
struct PoolV1 {
        uint256 id; 
        uint256 timestamp;
        uint256 nrSuppliers; //Supplies already interacting with the pool

        uint256 deposit; // Current Deposit
        uint256 depositFromInFlowRate; // required to track two indexes

        int96 inFlowRate; // stream in flow
        int96 outFlowRate; //supplier receiving flow
        uint256 outFlowBuffer; 
				// minimal balance in the pool for covering out streams

        uint256 yieldTokenIndex; // Indexes ot calculate user accrued yield
        uint256 yieldInFlowRateIndex; // Indexes ot calculate user accrued yield
			
        uint256 yieldAccrued; // Yield accrued since the last updated
        uint256 yieldSnapshot; // Total balance in the pool strategy
        uint256 totalYield; // total yield accrued by the pool

        APY apy; // APY so far
    }
```

### Supplier

Every time a supplier interact with the pool  the following object will be updated

```tsx
struct Supplier {
        uint256 id;
        address supplier;
        uint256 cumulatedYield;
        uint256 deposit;
        uint256 timestamp; 
        uint256 createdTimestamp;
        uint256 eventId;
        Stream inStream;
        OutStream outStream;
        APY apy;
    }

struct Stream {
        int96 flow;
        bytes32 cancelFlowId; //deprecated
    }

 struct OutStream {
        int96 flow;
        bytes32 cancelFlowId;//deprecated
        uint256 stepAmount; //amount to transfer every step
        uint256 stepTime;// time between steps
        uint256 initTime;// when step started
        uint256 minBalance; // min balance to ensure pool not run out of funds
        bytes32 cancelWithdrawId; //withdraw task id by Gelato
    }
```

## Rough short view roadmap

**Last achieved:**

- >2000 tests (60 events, 4 users, 42 unit tests per event)
- Gelato automation implemented
- Uups implementation
- Refactored from 7 contracts to 4

**Next:**

- last bugs (automatic losing redeem flows)

---

## Super Pool Factory initialization parameters

**Network** 

- Superfluid Host
- Supertoken
- Token
- Gelato Ops

**Redeem Flow Buffer**

- MIN_OUTFLOW_ALLOWED, buffer time on top of the 4h superfluid deposit. Bear in mind that every block a gelato task will rebalance if needed. Demo value 3600 seconds
- PARTIAL_DEPOSIT, percentual steps of Defi withdrawal, 1 equals to withdraw from the Defi protocol the whole user balance, no risk of liquidation, but no additional yield earned. 50 equals to withdraw 2%, much more transactions but additional yield earned. Demo value = 10 (timed withdrawals could be configured)

---

## Pool Accounting

We allocate the yield depending on the dollar-seconds to be able to have a common scale between deposits and streams.

In every pool update, we will calculate the area associated with the stream or the deposit in dollars/seconds and then simply proportionally split the yield.

We will keep track of two indexes. 

- The yield earned by token:  yieldTokenIndex.
- The yield earned by the incoming flow-rate:  yieldInFlowRateIndex.

The calculation of the yield accrued is pretty straightforward, deposit and stream times the corresponding index (we will use yieldTokenIndex and the yieldInFlowRateIndex)

In doing so we can linearize the calculation of the yield earned by each supplier

```jsx
uint256 yieldShare = 
//// deposit part
 ( yieldTokenIndex(block.timestamp) - yieldTokenIndex(depositTimeStamp)) * deposit
 
//// streaming part Inflow
+  (  yieldInFlowRateIndex(block.timestamp)
   - yieldInFlowRateIndex(startStreamTimeStamp)) * inFlowRate
```

Our target now is to set a simple, clean and consistent mechanism for maintaining these two indexes. Let’s see an example of how we could do that.

## Pool Events

We define “PoolEvent” as any event which changes the “Current Pool State” being the flow as the deposit or the Accrued Yield either in-stream or deposit.

Type of PoolEvents:

**User Interaction (see code)** 

- Deposit Supertoken (ERC777 send)
- Stream-In Start Supertoken
- Stream-in Update SuperToken
- Stream-In Stop SuperToken

- Redeem sTokens (shares) to SuperToken
- Redeem Flow of sTokens (shares) to SuperToken
- Redeem Flow Stop

**Pool Interaction**

- Accrue Yield (Pool Borrow)

## Simple easy showcase of two-period calculation

if we are at period(I) and we have the following values stored at the beginning of this period

```tsx
period(0) {
					deposit:20
					flowRate:5
					depositFromInFlowRate:0
					yieldTokenIndex: 0
					yieldInFlowRateIndex: 0		
					timestamp:0
					}
```

![alt text](https://github.com/donoso-eth/super-pool/blob/master/docs/Untitled.png?raw=true)

**t0 init  :**

 **-** start stream 5 tokens/s 

 - deposit 20 tokens

 - yield 1 token/second

**t1 increase yield revenue to 2token/s:** 

First we have to update both indexes, to do that we are going to calculate the total dollar second and the allocation to the stream portion and to the deposit portion:

Total Dollar Second Deposit = 20 tokens * 10 seconds  = 200 tokens second

Total Dollar Second Stream = 5 Token/sec * 10 * 10 /2 = 250 tokens second

 yieldTokenIndex = previousYieldTokenIndex + ( (1 token/sec * 10 sec) * 200 /450)/ (total tokens)  = 0 + (4.44/20) = 0.22

yieldFlowRateIndex = previousYieldFlowRateIndex + ((1 token/sec * 10 sec) * 250 /450) (total flow rate units) = 0 + (5.55/5) = 1,11

The period-end object:

```tsx
period(1) {
					deposit:20
					flowRate:5
					depositFromFlowRate:50
					yieldTokenIndex: 0.22
					yieldFlowRateIndex: 1.11	
					timestamp:10
					}
```

In t1 the accrued yield increase to 2 tokens/2 and in t2 we re-do the calculation

First we have to update both indexes, to do that we are going to calculate the total dollar second and the allocation to the stream portion and to the deposit portion:

Total Dollar Second Deposit = 20 tokens * 10 seconds  = 200 tokens second

Total Dollar Second Stream = 5 Token/sec * 10 * 10 /2 = 250 tokens second + depositFromflowRate * 10 = 750 tokens second

yieldTokenIndex =0.22 + ( (2 token/sec * 10 sec) * 200 /950)/ (total tokens)  = 0.22 + 0.21 = 0.43;

yieldFlowRateIndex = 1.11 + ((2 token/sec * 10 sec) * 750 /950) (total flow rate units) = 1.11 + (15-79/5) = 1.11 + 3.16 = 4.27;

Then the yield earned by a user can be linearized if we store following data

```tsx
supplier = {
	flowRate:5;
	deposit:20;
	timestamp:0
	cumulatedYield:0
}
```

Yield Calculated at t2

```tsx
yield = (yieldTokenIndex(t2)-yieldTokenIndex(to))*deposit 
+ (yieldFlowRateIndex(t2)-yieldFlowRateIndex(to)*flowrate
+ cumulatedYield;

balance = deposit + flowRate*(t2-to) + yield 
```

Notice that the deposit and the flowrate have different timestamps as a user can do a deposit and a later point of time start a stream

<aside>
💡 I think this way of accounting solves the scalability issue and is consistent between yield earnings allocated to streams or deposits

</aside>

The “magic” of this solution is that we merge deposits and streams within a period where we can very easily calculate the dollar-second value of each one, we split then the yield and then we track independently the two indexes.

## Repo Use Case Tests

**This use cases are not yet adapted to the final version**

![alt text](https://github.com/donoso-eth/super-pool/blob/master/docs/Untitled1.png?raw=true)



Example of the 14th period tests.

![alt text](https://github.com/donoso-eth/super-pool/blob/master/docs/Untitled2.png?raw=true)


---
