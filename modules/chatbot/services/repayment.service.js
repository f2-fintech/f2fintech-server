/**
 * Repayment Advisor & EMI Calculator Service
 * Performs verified reducing-balance EMI, amortization, FOIR affordability,
 * and prepayment/extra-EMI savings calculations.
 * All outputs are explicitly tagged as estimates distinct from official lender schedules.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const DISCLAIMER =
  "Estimated calculation based on reducing-balance methodology using F2Fintech configured rates. Official lender sanction schedules and applicable taxes/fees may vary.";

function calculateReducingEMI(principal, annualRatePercent, tenureMonths) {
  const P = Number(principal);
  const annualRate = Number(annualRatePercent);
  const n = Number(tenureMonths);

  if (!P || P <= 0 || !n || n <= 0) {
    return 0;
  }
  if (!annualRate || annualRate <= 0) {
    return Math.round(P / n);
  }
  const r = annualRate / 12 / 100;
  const factor = Math.pow(1 + r, n);
  const emi = (P * r * factor) / (factor - 1);
  return Math.round(emi);
}

/**
 * Generate full month-by-month and year-by-year amortization schedule
 * with optional extra EMI/month or annual extra EMI or lump-sum prepayment.
 */
function calculateRepaymentDetails({
  principal,
  annualRatePercent,
  tenureMonths,
  extraMonthlyPayment = 0,
  extraEmiPerYear = false,
  lumpSumPrepayment = 0,
  lumpSumAtMonth = 12,
  monthlyIncome = null,
  existingEmi = 0,
}) {
  const P = Number(principal);
  const rate = Number(annualRatePercent);
  const n = Math.round(Number(tenureMonths));

  if (!P || P <= 0 || !rate || rate <= 0 || !n || n <= 0) {
    throw new Error("Principal amount, annual interest rate (> 0), and tenure months (> 0) are required.");
  }

  const r = rate / 12 / 100;
  const exactFactor = Math.pow(1 + r, n);
  const exactEmi = (P * r * exactFactor) / (exactFactor - 1);
  const monthlyEmi = Math.round(exactEmi);
  const baselineTotalRepayment = Math.round(exactEmi * n);
  const baselineTotalInterest = Math.max(0, baselineTotalRepayment - P);

  // Compute baseline yearly + monthly schedule
  let balance = P;
  const monthlySchedule = [];
  const yearlyMap = new Map();

  for (let m = 1; m <= n && balance > 0.01; m++) {
    const interestPart = balance * r;
    let principalPart = exactEmi - interestPart;
    if (principalPart > balance) principalPart = balance;
    balance = Math.max(0, balance - principalPart);

    monthlySchedule.push({
      month: m,
      emi: Math.round(interestPart + principalPart),
      principal: Math.round(principalPart),
      interest: Math.round(interestPart),
      closingBalance: Math.round(balance),
    });

    const yearIdx = Math.ceil(m / 12);
    if (!yearlyMap.has(yearIdx)) {
      yearlyMap.set(yearIdx, {
        year: yearIdx,
        principalPaid: 0,
        interestPaid: 0,
        totalPaid: 0,
        closingBalance: 0,
      });
    }
    const yr = yearlyMap.get(yearIdx);
    yr.principalPaid += principalPart;
    yr.interestPaid += interestPart;
    yr.totalPaid += principalPart + interestPart;
    yr.closingBalance = balance;
  }

  const yearlySchedule = Array.from(yearlyMap.values()).map((y) => ({
    year: y.year,
    principalPaid: Math.round(y.principalPaid),
    interestPaid: Math.round(y.interestPaid),
    totalPaid: Math.round(y.totalPaid),
    closingBalance: Math.round(y.closingBalance),
  }));

  // Prepayment simulation if extra payments specified
  let prepaymentSummary = null;
  const extraMonthly = Math.max(0, Number(extraMonthlyPayment) || 0);
  const lumpSum = Math.max(0, Number(lumpSumPrepayment) || 0);
  const lumpMonth = Math.max(1, Math.round(Number(lumpSumAtMonth) || 12));

  if (extraEmiPerYear || extraMonthly > 0 || lumpSum > 0) {
    let curBal = P;
    let totalIntWithPrepay = 0;
    let monthsTaken = 0;

    while (curBal > 0.01 && monthsTaken < n * 2) {
      monthsTaken++;
      const interestForMonth = curBal * r;
      totalIntWithPrepay += interestForMonth;

      let pmt = exactEmi + extraMonthly;
      if (extraEmiPerYear && monthsTaken % 12 === 0) {
        pmt += exactEmi;
      }
      if (lumpSum > 0 && monthsTaken === lumpMonth) {
        pmt += lumpSum;
      }

      const principalPaid = Math.min(curBal, pmt - interestForMonth);
      curBal = Math.max(0, curBal - principalPaid);
    }

    const interestSaved = Math.max(0, Math.round(baselineTotalInterest - totalIntWithPrepay));
    const monthsSaved = Math.max(0, n - monthsTaken);

    prepaymentSummary = {
      newTenureMonths: monthsTaken,
      monthsSaved,
      revisedTotalInterest: Math.round(totalIntWithPrepay),
      revisedTotalRepayment: Math.round(P + totalIntWithPrepay),
      interestSaved,
      extraMonthlyPayment: extraMonthly,
      extraEmiPerYear: Boolean(extraEmiPerYear),
      lumpSumPrepayment: lumpSum,
      lumpSumAtMonth: lumpSum > 0 ? lumpMonth : null,
    };
  }

  // FOIR / monthly obligation assessment if income provided
  let affordability = null;
  const incomeNum = Number(monthlyIncome);
  const existingEmiNum = Math.max(0, Number(existingEmi) || 0);
  if (incomeNum && incomeNum > 0) {
    const totalMonthlyObligation = existingEmiNum + monthlyEmi;
    const foirPercent = Number(((totalMonthlyObligation / incomeNum) * 100).toFixed(2));
    let riskLevel = "Low Risk";
    if (foirPercent > 60) riskLevel = "High Risk";
    else if (foirPercent > 40) riskLevel = "Moderate Risk";

    affordability = {
      monthlyIncome: incomeNum,
      existingEmi: existingEmiNum,
      newLoanEmi: monthlyEmi,
      totalMonthlyObligation,
      foirPercent,
      riskLevel,
    };
  }

  return {
    isEstimate: true,
    disclaimer: DISCLAIMER,
    inputs: {
      principal: P,
      annualRatePercent: rate,
      tenureMonths: n,
      tenureYears: Number((n / 12).toFixed(2)),
    },
    summary: {
      monthlyEmi,
      principalAmount: P,
      totalInterestPayable: baselineTotalInterest,
      totalRepaymentAmount: baselineTotalRepayment,
      interestToPrincipalRatio: Number(((baselineTotalInterest / P) * 100).toFixed(2)),
    },
    affordability,
    prepaymentSummary,
    yearlySchedule,
    monthlySchedulePreview: monthlySchedule.slice(0, 12),
    totalScheduleMonths: monthlySchedule.length,
  };
}

/**
 * Compare alternative tenures for the same principal and interest rate
 */
function compareTenureScenarios({ principal, annualRatePercent, tenuresMonths = [12, 24, 36, 48, 60] }) {
  return tenuresMonths
    .filter((m) => Number(m) > 0)
    .map((m) => {
      const calc = calculateRepaymentDetails({
        principal,
        annualRatePercent,
        tenureMonths: m,
      });
      return {
        tenureMonths: m,
        tenureYears: Number((m / 12).toFixed(1)),
        monthlyEmi: calc.summary.monthlyEmi,
        totalInterestPayable: calc.summary.totalInterestPayable,
        totalRepaymentAmount: calc.summary.totalRepaymentAmount,
      };
    });
}

module.exports = {
  DISCLAIMER,
  calculateReducingEMI,
  calculateRepaymentDetails,
  compareTenureScenarios,
};

