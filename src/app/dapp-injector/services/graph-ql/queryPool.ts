
export const GET_POOL = `
    {
      pools(first: 10, orderBy: id, orderDirection: desc) {
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
      suppliers(supplier:$address) {
    
        id:
        supplier
        timestamp
        createdTimestamp
        deposit
        cumulatedYield
      
        inFlow
        inCancelFlowId
      
        outFlow
        outCancelFlowId
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

