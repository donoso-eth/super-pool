
export const GET_POOL = `
    {
      pools(first: 10, orderBy: timestamp, orderDirection: desc) {
        id
        inFlowRate
        outFlowRate
        outFlowRate
        deposit
        depositFromInflowRate
        nrSuppliers
        timestamp
        totalYield
        yieldAccrued
        yieldSnapshot
        apy
        apySpan
      }
    }
  `;

export const GET_SUPPLIER = `
  query($address: String!){
      suppliers(where: { supplier: $address }) {
    
        id:
        supplier
        timestamp
        createdTimestamp
        deposit
        cumulatedYield
        inFlow
        outFlow
        outStepAmount
        outStepTime
        outInitTime
        outMinBalance
        outCancelWithdrawId
        apySpan
        apy
  

   
      }
    }
  `;

