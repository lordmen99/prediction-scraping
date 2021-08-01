// @QUERIES
const { getAllRounds } = require("../queries/rounds");
const { updateTotalAverage } = require("../queries/averages");
// @FUNCTIONS
const { getParsedData } = require("./parser");
// @CLASSES
const { TotalAverages } = require("../classes/average");

// * REFRESH AVERAGES BY COMPUTING EVERY ROUND, EVER *
async function refreshAverages() {
  const rounds = await getAllRounds();
  const data = getRoundData(rounds);
  await updateTotalAverage(data);

  setInterval(async () => {
    const rounds = await getAllRounds();
    const data = getRoundData(rounds);
    await updateTotalAverage(data);
  }, 1000 * 60 * 15); // ? 15 minutes
}

// * COMPUTES AVERAGES AND RISK DATA FROM ENTRIES *
// ? @PARAM: entries => An array containing rounds
function getRoundData(entries) {
  if (entries.length <= 0) return null;

  const averages = new TotalAverages();
  entries.forEach((entry) => {
    const { parsedDiff, parsedPool, parsedUP, parsedDOWN, winningPayout } =
      getParsedData(
        entry.diff,
        entry.poolValue,
        entry.payoutUP,
        entry.payoutDOWN
      );

    averages.addPayout(winningPayout);
    averages.addPool(parsedPool);
    averages.addDiff(parsedDiff);
    averages.addRiskData(parsedDiff, winningPayout, parsedUP, parsedDOWN);
  });

  return averages.getData();
}

// * RETURNS FORMATTED AVERAGES FROM ENTRIES *
// ? @PARAM: entries => An array containing rounds
function getAverages(entries) {
  if (!entries) {
    return {
      avgPayout: "N/A",
      avgDiffUP: "N/A",
      avgDiffDOWN: "N/A",
      avgPool: "N/A",
      avgRisky: "N/A",
      avgSafe: "N/A",
      safePercentWr: "N/A",
      riskyPercentWr: "N/A",
      nbRoundDOWN: "N/A",
      nbRoundUP: "N/A",
      nbEntries: "N/A",
    };
  }
  return {
    avgPayout: formatAvg(entries.totalPayout / entries.nbEntries),
    avgDiffUP: formatAvg(entries.totalDiffUP / entries.nbRoundUP),
    avgDiffDOWN: formatAvg(entries.totalDiffDOWN / entries.nbRoundDOWN),
    avgPool: formatAvg(entries.totalPool / entries.nbEntries),
    avgSafe: formatAvg(entries.safeTotalPayout / entries.safeWins),
    avgRisky: formatAvg(entries.riskyTotalPayout / entries.riskyWins),
    safePercentWr: formatAvg(
      getPercentage(entries.safeWins, entries.nbEntries)
    ),
    riskyPercentWr: formatAvg(
      getPercentage(entries.riskyWins, entries.nbEntries)
    ),
    nbRoundDOWN: entries.nbRoundDOWN,
    nbRoundUP: entries.nbRoundUP,
    nbEntries: entries.nbEntries,
  };
}

// * RETURNS MEDIAN DATA FROM ENTRIES *
function getMedian(entries) {
  if (!entries) {
    return {
      payoutMedian: "N/A",
      poolMedian: "N/A",
    };
  }

  const payouts = [];
  const pools = [];
  entries.forEach((round) => {
    const parsedDiff = parseFloat(round.diff.substr(1));
    parsedDiff > 0
      ? payouts.push(parseFloat(round.payoutUP.slice(0, -1)))
      : payouts.push(parseFloat(round.payoutDOWN.slice(0, -1)));
    pools.push(parseFloat(round.poolValue));
  });

  const sortedPayouts = payouts.sort((a, b) => (a > b ? 1 : -1));
  const sortedPools = pools.sort((a, b) => (a > b ? 1 : -1));
  const payoutMedian = sortedPayouts[(sortedPayouts.length / 2).toFixed(0)];
  const poolMedian = sortedPools[(sortedPools.length / 2).toFixed(0)];

  return {
    payout: formatAvg(payoutMedian),
    pool: formatAvg(poolMedian),
  };
}

// * RETURNS ORACLE DATA FROM ORACLES ENTRIES *
function getOracleData(oracles) {
  if (oracles.length <= 0)
    return { average: "N/A", median: "N/A", odds: "N/A", diffList: "N/A" };
  const diffList = [];
  for (let i = 0; i < oracles.length - 1; i++) {
    const diff = Math.abs(oracles[i + 1].date - oracles[i].date);
    diffList.push(parseInt((diff / 1000).toFixed(0)));
  }

  const average = formatAvg(
    diffList.filter((item) => item > 20 && item < 300).reduce((a, b) => a + b) /
      diffList.length
  );
  const sorted = diffList
    .filter((item) => item > 20 && item < 300)
    .sort((a, b) => (a > b ? 1 : -1));

  const median = sorted[(sorted.length / 2).toFixed(0)];

  const arr = [];
  const odds = [];
  sorted.forEach((item) => {
    if (!arr.includes(item)) {
      arr.push(item);

      const nb = sorted.filter((value) => value === item).length;
      const percentage = ((nb / sorted.length) * 100).toFixed(3);
      odds.push({
        value: item,
        nb: nb,
        percentage: parseFloat(percentage),
      });
    }
  });

  // const sortedOdds = odds.sort((a, b) =>
  //   a.percentage < b.percentage ? 1 : -1
  // );
  return { average, median, odds, diffList };
}

function groupByHour(dataset) {
  const arr = [];

  dataset.forEach((item) => {
    const { hour, avgSafe, avgRisky, safePercentWr, riskyPercentWr } = item;

    if (!arr[hour])
      arr[hour] = {
        hour,
        count: 1,
        avgSafe: avgSafe !== "N/A" ? avgSafe : 0,
        avgRisky: avgRisky !== "N/A" ? avgRisky : 0,
        safePercentWr: safePercentWr !== "N/A" ? safePercentWr : 0,
        riskyPercentW: riskyPercentWr !== "N/A" ? riskyPercentWr : 0,
      };
    else {
      arr[hour].count += 1;
      arr[hour].avgSafe += avgSafe !== "N/A" ? avgSafe : 0;
      arr[hour].avgRisky += avgRisky !== "N/A" ? avgRisky : 0;
      arr[hour].safePercentWr += safePercentWr !== "N/A" ? safePercentWr : 0;
      arr[hour].riskyPercentWr += riskyPercentWr !== "N/A" ? riskyPercentWr : 0;
    }
  });

  const averages = arr.map((item) => {
    const { hour, count, avgSafe, avgRisky, safePercentWr, riskyPercentWr } =
      item;
    return {
      hour,
      avgSafe: formatAvg(avgSafe / count),
      avgRisky: formatAvg(avgRisky / count),
      safePercentWr: formatAvg(safePercentWr / count),
      riskyPercentWr: formatAvg(riskyPercentWr / count),
    };
  });
  return averages;
}

// * RETURNS FORMATTED AVERAGE *
function formatAvg(number) {
  if (!number) return 0;
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

// * RETURNS PERCENTAGE *
function getPercentage(number, total) {
  return (number * 100) / total;
}

/* METHODE 1
function getEsperance(pWin, pLose, win, lose) {
  return formatAvg(
    (pWin / 100) * (win * 10 - 10) + (pLose / 100) * - 10
    0.7 * 4 + 0.3 * - 10 = 0.2
  );
}
*/

/* METHODE 2
function getEsperance(pWin, pLose, win, lose) {
  return formatAvg(
    (pWin / 100) * (win * 10) + (pLose / 100) * 0 - 10
    0.7 * 14 + 0.3 * 0 - 10 = -0.2
  );
}
*/

/* METHODE 3
function getEsperance(pWin, pLose, win, lose) {
  return formatAvg(
    (pWin / 100) * (win * 10 - 10) - (pLose / 100) * 10
    0.7 * (1.4 * 10 - 10) - 0.3 * 10 = -0.2
  );
}
*/

/* METHODE 4
function getEsperance(pWin, pLose, win, lose) {
  return formatAvg(
    (pWin / 100) * (win * 10 - 10) - (pLose / 100) * 10
    0.7 * (1.4 * 10 - 10) - 0.3 * 10 = -0.2
  );
}
*/

/* OLD ESPERANCE
function getEsperance(pWin, pLose, win, lose) {
  return formatAvg(
    (pWin / 100) * (win * 10) - (pLose / 100) * (lose * 10) - 10
  );
}
*/

// * RETURNS ESPERANCE *
function getEsperance(pWin, pLose, win, betAmount) {
  return formatAvg(
    (pWin / 100) * (win * betAmount - betAmount) - (pLose / 100) * betAmount
  );
}

module.exports = {
  formatAvg,
  refreshAverages,
  groupByHour,
  getPercentage,
  getRoundData,
  getMedian,
  getAverages,
  getEsperance,
  getOracleData,
};
