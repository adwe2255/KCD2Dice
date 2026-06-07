const STORAGE_KEYS = {
  selectedDice: "kcd2-selected-dice",
  inventoryCounts: "kcd2-inventory-counts",
  mode: "kcd2-screen-mode",
  plannerTarget: "kcd2-planner-target",
  plannerStrategy: "kcd2-planner-strategy",
  probabilityView: "kcd2-probability-view",
};

const MAX_SELECTED_DICE = 6;
const PLANNER_SEARCH_POOL = 18;

const manualModeButton = document.getElementById("manual-mode-button");
const plannerModeButton = document.getElementById("planner-mode-button");
const manualScreen = document.getElementById("manual-screen");
const plannerScreen = document.getElementById("planner-screen");
const manualSelectionStatus = document.getElementById("manual-selection-status");
const plannerSelectionStatus = document.getElementById("planner-selection-status");
const clearManualButton = document.getElementById("clear-manual-button");
const clearInventoryButton = document.getElementById("clear-inventory-button");
const plannerOverallButton = document.getElementById("planner-overall-button");
const plannerFaceButton = document.getElementById("planner-face-button");
const facePicker = document.getElementById("face-picker");
const plannerResultNote = document.getElementById("planner-result-note");

const myDiceBody = document.getElementById("my-dice-body");
const allDiceBody = document.getElementById("all-dice-body");
const probabilityCards = document.getElementById("probability-cards");
const plannerDiceBody = document.getElementById("planner-dice-body");
const inventoryDiceBody = document.getElementById("inventory-dice-body");
const plannerProbabilityCards = document.getElementById("planner-probability-cards");
const faceButtons = [...document.querySelectorAll(".face-button")];
const probabilityModeButtons = [
  ...document.querySelectorAll(".probability-mode-button"),
];

const kindBaseScores = Object.fromEntries(
  scoringRules.triples.map((rule) => [rule.face, rule.score])
);

const state = {
  mode: loadMode(),
  selectedDiceIds: loadSelectedDice(),
  inventoryCounts: loadInventoryCounts(),
  plannerTargetFace: loadPlannerTargetFace(),
  plannerStrategy: loadPlannerStrategy(),
  probabilityView: loadProbabilityView(),
};

const plannerLoadoutCache = {
  key: "",
  dice: [],
};

const overallScoreCache = new Map();

function loadMode() {
  const storedMode = window.localStorage.getItem(STORAGE_KEYS.mode);
  return storedMode === "planner" ? "planner" : "manual";
}

function loadSelectedDice() {
  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEYS.selectedDice);

    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((id) => typeof id === "string" && diceCatalog.some((die) => die.id === id))
      .slice(0, MAX_SELECTED_DICE);
  } catch {
    return [];
  }
}

function loadInventoryCounts() {
  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEYS.inventoryCounts);
    const parsed = rawValue ? JSON.parse(rawValue) : {};

    return diceCatalog.reduce((counts, die) => {
      const value = Number(parsed[die.id]);
      counts[die.id] = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
      return counts;
    }, {});
  } catch {
    return diceCatalog.reduce((counts, die) => {
      counts[die.id] = 0;
      return counts;
    }, {});
  }
}

function loadPlannerTargetFace() {
  const rawValue = Number(window.localStorage.getItem(STORAGE_KEYS.plannerTarget));

  if (Number.isInteger(rawValue) && rawValue >= 1 && rawValue <= 6) {
    return rawValue;
  }

  return 1;
}

function loadPlannerStrategy() {
  const storedStrategy = window.localStorage.getItem(STORAGE_KEYS.plannerStrategy);
  return storedStrategy === "face" ? "face" : "overall";
}

function loadProbabilityView() {
  const storedView = window.localStorage.getItem(STORAGE_KEYS.probabilityView);
  return ["classic", "bust", "scoring", "triples"].includes(storedView)
    ? storedView
    : "classic";
}

function saveState() {
  window.localStorage.setItem(
    STORAGE_KEYS.selectedDice,
    JSON.stringify(state.selectedDiceIds)
  );
  window.localStorage.setItem(
    STORAGE_KEYS.inventoryCounts,
    JSON.stringify(state.inventoryCounts)
  );
  window.localStorage.setItem(STORAGE_KEYS.mode, state.mode);
  window.localStorage.setItem(
    STORAGE_KEYS.plannerTarget,
    String(state.plannerTargetFace)
  );
  window.localStorage.setItem(
    STORAGE_KEYS.plannerStrategy,
    state.plannerStrategy
  );
  window.localStorage.setItem(
    STORAGE_KEYS.probabilityView,
    state.probabilityView
  );
}

function normalizePlannerState() {
  if (state.plannerStrategy !== "overall" && state.plannerStrategy !== "face") {
    state.plannerStrategy = "overall";
  }

  if (
    !Number.isInteger(state.plannerTargetFace) ||
    state.plannerTargetFace < 1 ||
    state.plannerTargetFace > 6
  ) {
    state.plannerTargetFace = 1;
  }

  if (!["classic", "bust", "scoring", "triples"].includes(state.probabilityView)) {
    state.probabilityView = "classic";
  }
}

function setPlannerStrategy(strategy) {
  state.plannerStrategy = strategy === "face" ? "face" : "overall";
  normalizePlannerState();
  render();
}

function getDieById(id) {
  return diceCatalog.find((die) => die.id === id);
}

function getSelectedDice() {
  return state.selectedDiceIds.map(getDieById).filter(Boolean);
}

function getInventoryDiceList() {
  return diceCatalog.flatMap((die) =>
    Array.from({ length: state.inventoryCounts[die.id] || 0 }, () => die)
  );
}

function getDisplayedFaceProbability(die, face) {
  return die.faces[face - 1];
}

function getCountingFaceProbability(die, face) {
  if (die.special && face === 1) {
    return 0;
  }

  return die.faces[face - 1];
}

function getSpecialProbability(die) {
  return die.special ? die.faces[0] : 0;
}

function formatPercent(value) {
  return value.toFixed(2);
}

function getProbabilityColor(value) {
  const clamped = Math.max(0, Math.min(100, value));
  const hue = Math.round((clamped / 100) * 120);
  return `hsl(${hue} 80% 45%)`;
}

function getSingleFaceLikelihoodScore(dice, face) {
  return dice.reduce(
    (sum, die) => sum + getCountingFaceProbability(die, face) / 100,
    0
  );
}

function buildCountDistribution(dice, face) {
  let distribution = [1];

  dice.forEach((die) => {
    const probability = getCountingFaceProbability(die, face) / 100;
    const nextDistribution = new Array(distribution.length + 1).fill(0);

    distribution.forEach((chance, count) => {
      nextDistribution[count] += chance * (1 - probability);
      nextDistribution[count + 1] += chance * probability;
    });

    distribution = nextDistribution;
  });

  return distribution;
}

function buildSpecialDistribution(dice) {
  let distribution = [1];

  dice.forEach((die) => {
    const probability = getSpecialProbability(die) / 100;
    const nextDistribution = new Array(distribution.length + 1).fill(0);

    distribution.forEach((chance, count) => {
      nextDistribution[count] += chance * (1 - probability);
      nextDistribution[count + 1] += chance * probability;
    });

    distribution = nextDistribution;
  });

  return distribution;
}

function getChanceAtLeastOneScoringDie(dice) {
  const noScoringChance = dice.reduce((product, die) => {
    const scoringChance =
      getCountingFaceProbability(die, 1) / 100 +
      getCountingFaceProbability(die, 5) / 100 +
      getSpecialProbability(die) / 100;
    return product * (1 - scoringChance);
  }, 1);

  return (1 - noScoringChance) * 100;
}

function getBustChance(dice) {
  return 100 - getChanceAtLeastOneScoringDie(dice);
}

function getAtLeastProbability(distribution, threshold) {
  return (
    distribution
      .slice(threshold)
      .reduce((sum, probability) => sum + probability, 0) * 100
  );
}

function createProbabilitySet(dice, face, minimums) {
  const distribution = buildCountDistribution(dice, face);

  return minimums.map((minimum) => ({
    label: `${minimum}+ ${face}s`,
    value: getAtLeastProbability(distribution, minimum),
  }));
}

function getProbabilityCardData(dice) {
  if (state.probabilityView === "bust") {
    const bustChance = getBustChance(dice);
    return [
      {
        label: "Bust Chance",
        value: bustChance,
        colorValue: 100 - bustChance,
      },
    ];
  }

  if (state.probabilityView === "scoring") {
    const scoringChance = getChanceAtLeastOneScoringDie(dice);
    return [
      {
        label: "1+ scoring die",
        value: scoringChance,
        colorValue: scoringChance,
      },
    ];
  }

  if (state.probabilityView === "triples") {
    return [1, 2, 3, 4, 5, 6].map((face) => {
      const value = getAtLeastProbability(buildCountDistribution(dice, face), 3);
      return {
        label: `Triple ${face}s`,
        value,
        colorValue: value,
      };
    });
  }

  const cards = [
    ...createProbabilitySet(dice, 1, [1, 3, 4, 5, 6]),
    ...createProbabilitySet(dice, 3, [3, 4, 5, 6]),
    ...createProbabilitySet(dice, 5, [1, 3, 4, 5, 6]),
    ...createProbabilitySet(dice, 6, [3, 4, 5, 6]),
  ];

  if (dice.some((die) => die.special)) {
    const specialDistribution = buildSpecialDistribution(dice);
    cards.push({
      label: "1+ devil heads",
      value: getAtLeastProbability(specialDistribution, 1),
    });
  }

  return cards.map((card) => ({
    ...card,
    colorValue: card.value,
  }));
}

function scoreStandardCounts(counts) {
  const memo = new Map();

  function recurse(currentCounts) {
    const key = currentCounts.join(",");

    if (memo.has(key)) {
      return memo.get(key);
    }

    let best = 0;
    const totalDice = currentCounts.reduce((sum, count) => sum + count, 0);

    if (totalDice === 0) {
      memo.set(key, 0);
      return 0;
    }

    if (currentCounts.every((count) => count >= 1)) {
      const nextCounts = currentCounts.map((count) => count - 1);
      best = Math.max(best, 1500 + recurse(nextCounts));
    }

    if (currentCounts.slice(0, 5).every((count) => count >= 1)) {
      const nextCounts = currentCounts.slice();

      for (let index = 0; index < 5; index += 1) {
        nextCounts[index] -= 1;
      }

      best = Math.max(best, 500 + recurse(nextCounts));
    }

    if (currentCounts.slice(1, 6).every((count) => count >= 1)) {
      const nextCounts = currentCounts.slice();

      for (let index = 1; index < 6; index += 1) {
        nextCounts[index] -= 1;
      }

      best = Math.max(best, 750 + recurse(nextCounts));
    }

    for (let face = 1; face <= 6; face += 1) {
      const count = currentCounts[face - 1];

      for (let used = 3; used <= count; used += 1) {
        const nextCounts = currentCounts.slice();
        nextCounts[face - 1] -= used;
        const kindScore = kindBaseScores[face] * 2 ** (used - 3);
        best = Math.max(best, kindScore + recurse(nextCounts));
      }
    }

    if (currentCounts[0] > 0) {
      const nextCounts = currentCounts.slice();
      nextCounts[0] -= 1;
      best = Math.max(best, 100 + recurse(nextCounts));
    }

    if (currentCounts[4] > 0) {
      const nextCounts = currentCounts.slice();
      nextCounts[4] -= 1;
      best = Math.max(best, 50 + recurse(nextCounts));
    }

    memo.set(key, best);
    return best;
  }

  return recurse(counts);
}

const scoreWithWildcards = (() => {
  const memo = new Map();

  function assignWildcards(totalWildcards, callback, allocation = [], depth = 0) {
    if (depth === 5) {
      callback([...allocation, totalWildcards]);
      return;
    }

    for (let used = 0; used <= totalWildcards; used += 1) {
      allocation[depth] = used;
      assignWildcards(totalWildcards - used, callback, allocation, depth + 1);
    }
  }

  return function evaluate(counts, wildcards) {
    const key = `${counts.join(",")}|${wildcards}`;

    if (memo.has(key)) {
      return memo.get(key);
    }

    if (wildcards === 0) {
      const score = scoreStandardCounts(counts);
      memo.set(key, score);
      return score;
    }

    let best = 0;

    assignWildcards(wildcards, (allocation) => {
      const nextCounts = counts.map((count, index) => count + allocation[index]);
      best = Math.max(best, scoreStandardCounts(nextCounts));
    });

    memo.set(key, best);
    return best;
  };
})();

function buildOutcomeDistribution(dice) {
  let states = new Map([["0,0,0,0,0,0|0", 1]]);

  dice.forEach((die) => {
    const nextStates = new Map();

    die.faces.forEach((chance, index) => {
      const probability = chance / 100;

      if (probability === 0) {
        return;
      }

      states.forEach((stateProbability, stateKey) => {
        const [countKey, wildcardKey] = stateKey.split("|");
        const counts = countKey.split(",").map(Number);
        const wildcards = Number(wildcardKey);

        if (die.special && index === 0) {
          const nextKey = `${counts.join(",")}|${wildcards + 1}`;
          nextStates.set(
            nextKey,
            (nextStates.get(nextKey) || 0) + stateProbability * probability
          );
          return;
        }

        const nextCounts = counts.slice();
        nextCounts[index] += 1;
        const nextKey = `${nextCounts.join(",")}|${wildcards}`;
        nextStates.set(
          nextKey,
          (nextStates.get(nextKey) || 0) + stateProbability * probability
        );
      });
    });

    states = nextStates;
  });

  return states;
}

function evaluateDiceSet(dice) {
  const states = buildOutcomeDistribution(dice);
  let total = 0;

  states.forEach((probability, stateKey) => {
    const [countKey, wildcardKey] = stateKey.split("|");
    const counts = countKey.split(",").map(Number);
    const wildcards = Number(wildcardKey);
    total += probability * scoreWithWildcards(counts, wildcards);
  });

  return total;
}

function getHeuristicValue(die) {
  const oneChance = getCountingFaceProbability(die, 1);
  const fiveChance = getCountingFaceProbability(die, 5);
  const bestDisplayed = Math.max(...die.faces);
  const specialChance = getSpecialProbability(die);

  return oneChance * 100 + fiveChance * 50 + bestDisplayed * 15 + specialChance * 80;
}

function createInventorySignature() {
  return diceCatalog
    .map((die) => `${die.id}:${state.inventoryCounts[die.id] || 0}`)
    .join("|");
}

function getPlannerLoadoutKey() {
  return `${state.plannerStrategy}|${state.plannerTargetFace}|${createInventorySignature()}`;
}

function getDiceSetScore(dice) {
  const key = dice
    .map((die) => die.id)
    .sort()
    .join("|");

  if (!overallScoreCache.has(key)) {
    overallScoreCache.set(key, evaluateDiceSet(dice));
  }

  return overallScoreCache.get(key);
}

function getBestInventoryLoadout() {
  const cacheKey = getPlannerLoadoutKey();

  if (plannerLoadoutCache.key === cacheKey) {
    return plannerLoadoutCache.dice;
  }

  let dice = [];

  try {
    dice =
      state.plannerStrategy === "face"
      ? getBestFaceLoadout(state.plannerTargetFace)
      : getBestOverallLoadout();
  } catch {
    dice = getBestFaceLoadout(state.plannerTargetFace);
  }

  plannerLoadoutCache.key = cacheKey;
  plannerLoadoutCache.dice = dice;
  return dice;
}

function getBestOverallLoadout() {
  const inventoryDice = getInventoryDiceList();

  if (inventoryDice.length === 0) {
    return [];
  }

  const targetSize = Math.min(MAX_SELECTED_DICE, inventoryDice.length);
  const candidateDice = inventoryDice
    .slice()
    .sort((left, right) => getHeuristicValue(right) - getHeuristicValue(left))
    .slice(0, Math.max(PLANNER_SEARCH_POOL, targetSize));
  const candidateSlots = candidateDice.map((die, index) => ({
    die,
    slotId: `${die.id}:${index}`,
  }));
  const seeds = [];

  function pushSeed(slots) {
    if (slots.length !== targetSize) {
      return;
    }

    const signature = slots
      .map((slot) => slot.slotId)
      .sort()
      .join("|");

    if (!seeds.some((seed) => seed.signature === signature)) {
      seeds.push({
        signature,
        slots,
      });
    }
  }

  pushSeed(candidateSlots.slice(0, targetSize));

  for (let offset = 1; offset <= Math.min(4, candidateSlots.length - targetSize); offset += 1) {
    pushSeed(candidateSlots.slice(offset, offset + targetSize));
  }

  const alternateSorters = [
    (die) => getCountingFaceProbability(die, 1),
    (die) => getCountingFaceProbability(die, 5),
    (die) => Math.max(...die.faces),
    (die) => getSpecialProbability(die),
  ];

  alternateSorters.forEach((sorter) => {
    pushSeed(
      candidateSlots
        .slice()
        .sort((left, right) => sorter(right.die) - sorter(left.die))
        .slice(0, targetSize)
    );
  });

  let bestDice = seeds[0]?.slots.map((slot) => slot.die) || candidateDice.slice(0, targetSize);
  let bestValue = getDiceSetScore(bestDice);

  function improveLoadout(seedSlots) {
    let currentSlots = seedSlots.slice();
    let currentScore = getDiceSetScore(currentSlots.map((slot) => slot.die));
    let improved = true;

    while (improved) {
      improved = false;
      let bestSwapSlots = currentSlots;
      let bestSwapScore = currentScore;

      for (let selectedIndex = 0; selectedIndex < currentSlots.length; selectedIndex += 1) {
        for (let candidateIndex = 0; candidateIndex < candidateSlots.length; candidateIndex += 1) {
          const candidateSlot = candidateSlots[candidateIndex];

          if (currentSlots.some((slot) => slot.slotId === candidateSlot.slotId)) {
            continue;
          }

          const nextSlots = currentSlots.slice();
          nextSlots[selectedIndex] = candidateSlot;
          const nextScore = getDiceSetScore(nextSlots.map((slot) => slot.die));

          if (nextScore > bestSwapScore) {
            bestSwapScore = nextScore;
            bestSwapSlots = nextSlots;
          }
        }
      }

      if (bestSwapScore > currentScore) {
        currentSlots = bestSwapSlots;
        currentScore = bestSwapScore;
        improved = true;
      }
    }

    return {
      dice: currentSlots.map((slot) => slot.die),
      score: currentScore,
    };
  }

  seeds.forEach((seed) => {
    const result = improveLoadout(seed.slots);

    if (result.score > bestValue) {
      bestDice = result.dice;
      bestValue = result.score;
    }
  });

  return bestDice;
}

function getBestFaceLoadout(face) {
  const inventoryDice = getInventoryDiceList();

  if (inventoryDice.length === 0) {
    return [];
  }

  const targetSize = Math.min(MAX_SELECTED_DICE, inventoryDice.length);

  return inventoryDice
    .slice()
    .sort(
      (left, right) =>
        getCountingFaceProbability(right, face) -
        getCountingFaceProbability(left, face)
    )
    .slice(0, targetSize);
}

function renderProbabilityCards(root, dice) {
  const cards = getProbabilityCardData(dice);
  root.innerHTML = "";

  if (dice.length === 0) {
    const item = document.createElement("article");
    item.className = "probability-card probability-card-empty";
    item.innerHTML = `
      <p class="probability-label">No dice selected</p>
      <p class="probability-empty-copy">Add dice on the right to start calculating.</p>
    `;
    root.appendChild(item);
    return;
  }

  cards.forEach((card) => {
    const item = document.createElement("article");
    item.className = "probability-card";
    item.style.setProperty(
      "--probability-accent",
      getProbabilityColor(card.colorValue ?? card.value)
    );
    item.innerHTML = `
      <p class="probability-label">${card.label}</p>
      <p class="probability-value">${formatPercent(card.value)}<span>%</span></p>
    `;
    root.appendChild(item);
  });
}

function createDiceRowMarkup(die, leadingMarkup) {
  return `
    <td>${leadingMarkup}</td>
    <td>${die.name}</td>
    <td>${formatPercent(getDisplayedFaceProbability(die, 1))}</td>
    <td>${formatPercent(getDisplayedFaceProbability(die, 2))}</td>
    <td>${formatPercent(getDisplayedFaceProbability(die, 3))}</td>
    <td>${formatPercent(getDisplayedFaceProbability(die, 4))}</td>
    <td>${formatPercent(getDisplayedFaceProbability(die, 5))}</td>
    <td>${formatPercent(getDisplayedFaceProbability(die, 6))}</td>
  `;
}

function renderMyDiceTable() {
  myDiceBody.innerHTML = "";
  const selectedDice = getSelectedDice();

  if (selectedDice.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="8" class="empty-cell">No dice selected. Add up to six dice from the table on the right.</td>`;
    myDiceBody.appendChild(row);
    return;
  }

  selectedDice.forEach((die, index) => {
    const row = document.createElement("tr");
    row.innerHTML = createDiceRowMarkup(
      die,
      `<button class="remove-button" data-index="${index}" type="button">x</button>`
    );
    myDiceBody.appendChild(row);
  });
}

function renderAllDiceTable() {
  allDiceBody.innerHTML = "";
  const selectedCount = getSelectedDice().length;

  diceCatalog.forEach((die) => {
    const row = document.createElement("tr");
    const disabled = selectedCount >= MAX_SELECTED_DICE ? "disabled" : "";
    row.innerHTML = createDiceRowMarkup(
      die,
      `<button class="add-button" data-id="${die.id}" type="button" ${disabled}>+</button>`
    );
    allDiceBody.appendChild(row);
  });
}

function renderPlannerDiceTable() {
  plannerDiceBody.innerHTML = "";
  const recommendedDice = getBestInventoryLoadout();

  if (recommendedDice.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="8" class="empty-cell">Add inventory counts on the right to build a recommended set.</td>`;
    plannerDiceBody.appendChild(row);
    plannerProbabilityCards.innerHTML = "";
    plannerResultNote.textContent = "";
    return;
  }

  recommendedDice.forEach((die, index) => {
    const row = document.createElement("tr");
    row.innerHTML = createDiceRowMarkup(
      die,
      `<span class="slot-badge">${index + 1}</span>`
    );
    plannerDiceBody.appendChild(row);
  });

  renderProbabilityCards(plannerProbabilityCards, recommendedDice);

  if (state.plannerStrategy === "face") {
    const faceChance = getSingleFaceLikelihoodScore(
      recommendedDice,
      state.plannerTargetFace
    );
    plannerResultNote.textContent = `Optimized for face ${state.plannerTargetFace}. Average ${state.plannerTargetFace}s per six-die throw: ${formatPercent(faceChance)}.`;
  } else {
    plannerResultNote.textContent =
      "Optimized with the current overall calculation.";
  }
}

function renderInventoryTable() {
  inventoryDiceBody.innerHTML = "";

  diceCatalog.forEach((die) => {
    const count = state.inventoryCounts[die.id] || 0;
    const row = document.createElement("tr");
    const removeDisabled = count === 0 ? "disabled" : "";
    row.innerHTML = `
      <td>
        <button class="remove-button" data-adjust="-1" data-id="${die.id}" type="button" ${removeDisabled}>-</button>
      </td>
      <td>${die.name}</td>
      <td>
        <div class="count-cell">
          <span class="count-value">${count}</span>
          <button class="add-button" data-adjust="1" data-id="${die.id}" type="button">+</button>
        </div>
      </td>
      <td>${formatPercent(getDisplayedFaceProbability(die, 1))}</td>
      <td>${formatPercent(getDisplayedFaceProbability(die, 2))}</td>
      <td>${formatPercent(getDisplayedFaceProbability(die, 3))}</td>
      <td>${formatPercent(getDisplayedFaceProbability(die, 4))}</td>
      <td>${formatPercent(getDisplayedFaceProbability(die, 5))}</td>
      <td>${formatPercent(getDisplayedFaceProbability(die, 6))}</td>
    `;
    inventoryDiceBody.appendChild(row);
  });
}

function renderStatuses() {
  manualSelectionStatus.textContent = `${getSelectedDice().length}/${MAX_SELECTED_DICE} dice selected`;
  plannerSelectionStatus.textContent = `${Object.values(state.inventoryCounts).reduce(
    (sum, count) => sum + count,
    0
  )} dice entered in inventory`;
}

function updateModeUI() {
  const manualActive = state.mode === "manual";
  manualModeButton.classList.toggle("is-active", manualActive);
  plannerModeButton.classList.toggle("is-active", !manualActive);
  manualScreen.classList.toggle("is-active", manualActive);
  plannerScreen.classList.toggle("is-active", !manualActive);
  plannerOverallButton.classList.toggle(
    "utility-button-active",
    state.plannerStrategy === "overall"
  );
  plannerFaceButton.classList.toggle(
    "utility-button-active",
    state.plannerStrategy === "face"
  );
  facePicker.hidden = state.plannerStrategy !== "face";
  faceButtons.forEach((button) => {
    button.classList.toggle(
      "is-active",
      Number(button.dataset.face) === state.plannerTargetFace
    );
  });
  probabilityModeButtons.forEach((button) => {
    button.classList.toggle(
      "is-active",
      button.dataset.probabilityView === state.probabilityView
    );
  });
}

function render() {
  normalizePlannerState();
  saveState();
  updateModeUI();
  renderStatuses();
  renderMyDiceTable();
  renderAllDiceTable();
  renderProbabilityCards(probabilityCards, getSelectedDice());
  renderPlannerDiceTable();
  renderInventoryTable();
}

manualModeButton.addEventListener("click", () => {
  state.mode = "manual";
  render();
});

plannerModeButton.addEventListener("click", () => {
  state.mode = "planner";
  render();
});

myDiceBody.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  const index = Number(target.dataset.index);

  if (Number.isNaN(index)) {
    return;
  }

  state.selectedDiceIds.splice(index, 1);
  render();
});

allDiceBody.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLButtonElement) || target.disabled) {
    return;
  }

  const dieId = target.dataset.id;

  if (!dieId || state.selectedDiceIds.length >= MAX_SELECTED_DICE) {
    return;
  }

  state.selectedDiceIds.push(dieId);
  render();
});

inventoryDiceBody.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLButtonElement) || target.disabled) {
    return;
  }

  const dieId = target.dataset.id;
  const adjust = Number(target.dataset.adjust);

  if (!dieId || Number.isNaN(adjust)) {
    return;
  }

  const currentValue = state.inventoryCounts[dieId] || 0;
  state.inventoryCounts[dieId] = Math.max(0, currentValue + adjust);
  render();
});

clearManualButton.addEventListener("click", () => {
  state.selectedDiceIds = [];
  render();
});

clearInventoryButton.addEventListener("click", () => {
  state.inventoryCounts = diceCatalog.reduce((counts, die) => {
    counts[die.id] = 0;
    return counts;
  }, {});
  render();
});

plannerOverallButton.addEventListener("click", () => {
  setPlannerStrategy("overall");
});

plannerFaceButton.addEventListener("click", () => {
  setPlannerStrategy("face");
});

faceButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.plannerTargetFace = Number(button.dataset.face);
    setPlannerStrategy("face");
  });
});

probabilityModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.probabilityView = button.dataset.probabilityView || "classic";
    render();
  });
});

render();
