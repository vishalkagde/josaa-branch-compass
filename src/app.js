const instituteTypes = {
  iit: {
    key: "iit",
    label: "Indian Institute of Technology",
    shortLabel: "IIT",
  },
  nit: {
    key: "nit",
    label: "National Institute of Technology",
    shortLabel: "NIT",
  },
};

const state = {
  datasetCache: new Map(),
  cutoffs: [],
  institutes: new Map(),
  filters: null,
  metadata: null,
  activeStatuses: ["aspirational", "in-range", "safe"],
  currentType: "iit",
  loadRequestId: 0,
};

const controls = {
  rank: document.querySelector("#rankInput"),
  year: document.querySelector("#yearInput"),
  instituteType: document.querySelector("#instituteTypeInput"),
  nitQuota: document.querySelector("#nitQuotaInput"),
  homeState: document.querySelector("#homeStateInput"),
  round: document.querySelector("#roundInput"),
  seatType: document.querySelector("#seatTypeInput"),
  gender: document.querySelector("#genderInput"),
  window: document.querySelector("#windowInput"),
  search: document.querySelector("#searchInput"),
};

const nodes = {
  matchCount: document.querySelector("#matchCount"),
  summaryText: document.querySelector("#summaryText"),
  statusMeaning: document.querySelector("#statusMeaning"),
  statusCards: document.querySelector("#statusCards"),
  statusAddButton: document.querySelector("#statusAddButton"),
  statusAddMenu: document.querySelector("#statusAddMenu"),
  results: document.querySelector("#results"),
  instituteTemplate: document.querySelector("#instituteTemplate"),
};

const numberFormat = new Intl.NumberFormat("en-IN");
const statusOrder = ["aspirational", "in-range", "safe"];
const assetVersion = "20260524f";
const loadedScriptUrls = new Set();

function getStatusMeta(status) {
  if (status === "aspirational") {
    return { key: "aspirational", label: "Aspirational", className: "aspirational" };
  }
  if (status === "safe") {
    return { key: "safe", label: "Safe by rank", className: "safe" };
  }
  return { key: "in-range", label: "In range", className: "in-range" };
}

function rankLabel(institute) {
  if (institute.nirf_engineering_rank) {
    return `NIRF Engineering #${institute.nirf_engineering_rank}`;
  }
  if (institute.nirf_rank_band) {
    return `NIRF Engineering rank-band ${institute.nirf_rank_band}`;
  }
  return "NIRF ranking unavailable";
}

function formatRank(raw, rank, preparatory) {
  if (!rank) return raw || "-";
  return `${numberFormat.format(rank)}${preparatory ? " P" : ""}`;
}

function formatNumber(value) {
  return numberFormat.format(value);
}

function classify(row, rank) {
  if (row.closing_rank < rank) {
    return getStatusMeta("aspirational");
  }
  if (row.closing_rank >= rank + 3000) {
    return getStatusMeta("safe");
  }
  return getStatusMeta("in-range");
}

function option(value, label, selected = false) {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = label;
  element.selected = selected;
  return element;
}

function scriptUrl(path) {
  return `${path}?v=${assetVersion}`;
}

function loadScript(src) {
  if (loadedScriptUrls.has(src)) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => {
      loadedScriptUrls.add(src);
      resolve();
    };
    script.onerror = () => reject(new Error(`Unable to load ${src}`));
    document.head.appendChild(script);
  });
}

async function ensureDatasetLoaded(typeKey) {
  if (state.datasetCache.has(typeKey)) {
    return state.datasetCache.get(typeKey);
  }

  const upper = typeKey.toUpperCase();
  const cutoffGlobal = `__JOSAA_CUTOFFS_2025_${upper}__`;
  const instituteGlobal = `__JOSAA_INSTITUTES_2025_${upper}__`;

  if (!window[cutoffGlobal] || !window[instituteGlobal]) {
    await Promise.all([
      loadScript(scriptUrl(`data/processed/cutoffs-2025-${typeKey}.js`)),
      loadScript(scriptUrl(`data/processed/institutes-2025-${typeKey}.js`)),
    ]);
  }

  const cutoffPayload = window[cutoffGlobal];
  const institutePayload = window[instituteGlobal];
  if (!cutoffPayload || !institutePayload) {
    throw new Error(`Processed ${typeKey.toUpperCase()} data files are missing.`);
  }

  const dataset = {
    cutoffs: cutoffPayload.cutoffs,
    filters: cutoffPayload.filters,
    metadata: cutoffPayload.metadata,
    institutes: institutePayload.institutes,
  };
  state.datasetCache.set(typeKey, dataset);
  return dataset;
}

function availableHomeStates() {
  return [...new Set([...state.institutes.values()].map((institute) => institute.state).filter(Boolean))].sort();
}

function syncHomeStateControl(previousSelections = {}) {
  const field = document.querySelector("#homeStateField");
  const quotaField = document.querySelector("#nitQuotaField");
  const isNit = state.currentType === "nit";
  const selectedQuota = previousSelections.nitQuota || controls.nitQuota.value || "OS";

  quotaField.hidden = !isNit;
  field.hidden = !isNit || selectedQuota !== "HS";

  if (!isNit) {
    controls.nitQuota.value = "OS";
    controls.homeState.replaceChildren(option("", "Select home state", true));
    controls.homeState.value = "";
    return;
  }

  controls.nitQuota.value = selectedQuota;
  const previousHomeState = previousSelections.homeState || controls.homeState.value || "";
  const states = availableHomeStates();
  controls.homeState.replaceChildren(
    option("", "Select home state", previousHomeState === ""),
    ...states.map((homeState) => option(homeState, homeState, homeState === previousHomeState)),
  );
}

function populateControls(previousSelections = {}) {
  const defaultRound = state.filters?.rounds?.includes(state.metadata?.default_round)
    ? state.metadata.default_round
    : 1;
  const previousRound = Number(previousSelections.round || controls.round.value);
  const previousSeatType = previousSelections.seatType || controls.seatType.value;
  const previousGender = previousSelections.gender || controls.gender.value;

  const selectedRound = state.filters.rounds.includes(previousRound)
    ? previousRound
    : state.filters.rounds.includes(defaultRound)
      ? defaultRound
      : state.filters.rounds[0];
  controls.round.replaceChildren(
    ...state.filters.rounds.map((round) => option(String(round), `Round ${round}`, round === selectedRound)),
  );

  const preferredSeatType = state.filters.seat_types.includes(previousSeatType)
    ? previousSeatType
    : state.filters.seat_types.includes("OPEN")
      ? "OPEN"
      : state.filters.seat_types[0];
  controls.seatType.replaceChildren(
    ...state.filters.seat_types.map((seatType) => option(seatType, seatType, seatType === preferredSeatType)),
  );

  controls.gender.replaceChildren(
    option("ALL", "All gender pools", previousGender === "ALL" || !previousGender),
    ...state.filters.genders.map((gender) => option(gender, gender, gender === previousGender)),
  );

  syncHomeStateControl(previousSelections);
}

function currentFilters() {
  return {
    instituteType: controls.instituteType.value,
    nitQuota: controls.nitQuota.value || "OS",
    homeState: controls.homeState.value || "",
    rank: Number(controls.rank.value),
    round: Number(controls.round.value),
    seatType: controls.seatType.value,
    gender: controls.gender.value,
    window: Math.max(0, Number(controls.window.value || 0)),
    search: controls.search.value.trim().toLowerCase(),
    statuses: [...state.activeStatuses],
  };
}

function renderStatusControls() {
  const active = statusOrder.filter((status) => state.activeStatuses.includes(status));
  const hidden = statusOrder.filter((status) => !state.activeStatuses.includes(status));

  nodes.statusCards.replaceChildren(
    ...active.map((status) => {
      const meta = getStatusMeta(status);
      const card = document.createElement("div");
      card.className = `status-filter-card ${meta.className}`;
      card.innerHTML = `
        <span>${meta.label}</span>
        <button type="button" data-remove-status="${meta.key}" aria-label="Remove ${meta.label} filter">×</button>
      `;
      return card;
    }),
  );

  if (!hidden.length) {
    nodes.statusAddMenu.hidden = true;
    nodes.statusAddButton.hidden = true;
    nodes.statusAddButton.setAttribute("aria-expanded", "false");
    return;
  }

  nodes.statusAddButton.hidden = false;
  nodes.statusAddMenu.replaceChildren(
    ...hidden.map((status) => {
      const meta = getStatusMeta(status);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `status-add-option ${meta.className}`;
      button.dataset.addStatus = meta.key;
      button.textContent = meta.label;
      return button;
    }),
  );
}

function filterRows(filters) {
  if (!Number.isFinite(filters.rank) || filters.rank <= 0) {
    return [];
  }

  const minimumClosingRank = Math.max(1, filters.rank - filters.window);

  return state.cutoffs
    .filter((row) => row.round === filters.round)
    .filter((row) => row.seat_type === filters.seatType)
    .filter((row) => {
      if (state.currentType !== "nit") return true;
      if (row.quota !== "HS" && row.quota !== "OS") return false;
      if (filters.nitQuota === "OS") return row.quota === "OS";
      if (!filters.homeState) return false;

      const institute = state.institutes.get(row.institute_id);
      return row.quota === "HS" && institute?.state === filters.homeState;
    })
    .filter((row) => filters.gender === "ALL" || row.gender === filters.gender)
    .filter((row) => row.closing_rank !== null)
    .filter((row) => !filters.search || row.program_name.toLowerCase().includes(filters.search))
    .filter((row) => row.closing_rank >= minimumClosingRank)
    .filter((row) => filters.statuses.includes(classify(row, filters.rank).key));
}

function groupByInstitute(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.institute_id)) groups.set(row.institute_id, []);
    groups.get(row.institute_id).push(row);
  }

  return [...groups.entries()]
    .map(([instituteId, programs]) => ({
      institute: state.institutes.get(instituteId) || {
        id: instituteId,
        canonical_name: programs[0].canonical_institute_name,
        josaa_name: programs[0].institute_name,
        nirf_sort_order: 9999,
      },
      programs: programs.sort((a, b) => a.closing_rank - b.closing_rank || a.program_name.localeCompare(b.program_name)),
    }))
    .sort((a, b) => {
      return (
        a.institute.nirf_sort_order - b.institute.nirf_sort_order ||
        a.institute.canonical_name.localeCompare(b.institute.canonical_name)
      );
    });
}

function renderEmpty(title, message) {
  nodes.results.innerHTML = `
    <div class="empty-state">
      <strong>${title}</strong>
      <p>${message}</p>
    </div>
  `;
}

function renderLoading(typeKey) {
  const typeMeta = instituteTypes[typeKey];
  nodes.matchCount.textContent = `Loading ${typeMeta.shortLabel} data...`;
  nodes.summaryText.textContent = `Preparing JoSAA 2025 ${typeMeta.label} cutoffs.`;
  nodes.statusMeaning.replaceChildren();
  nodes.results.innerHTML = `
    <div class="empty-state">
      <strong>Loading ${typeMeta.shortLabel} branches</strong>
      <p>Fetching the processed ${typeMeta.label} dataset for this view.</p>
    </div>
  `;
}

function render() {
  renderStatusControls();
  if (!state.filters) {
    renderLoading(state.currentType);
    return;
  }

  const filters = currentFilters();
  const typeMeta = instituteTypes[state.currentType];
  if (!Number.isFinite(filters.rank) || filters.rank <= 0) {
    nodes.matchCount.textContent = "Enter a valid rank";
    nodes.summaryText.textContent = "Rank should be a positive number.";
    nodes.statusMeaning.replaceChildren();
    renderEmpty("Rank needed", `Enter your child's CRL/category rank to see matching ${typeMeta.shortLabel} branches.`);
    return;
  }

  if (!filters.statuses.length) {
    nodes.matchCount.textContent = "Choose at least one status";
    nodes.summaryText.textContent = "Status filters control whether aspirational, in-range, or safe branches are shown.";
    nodes.statusMeaning.replaceChildren();
    renderEmpty("No status selected", "Turn on at least one of the three status filters to see matching branches.");
    return;
  }

  if (state.currentType === "nit" && filters.nitQuota === "HS" && !filters.homeState) {
    nodes.matchCount.textContent = "Select a home state";
    nodes.summaryText.textContent = "Choose the student's home state to see NIT home-state closing ranks.";
    nodes.statusMeaning.replaceChildren();
    renderEmpty("Home state needed", "Select the student's state when using the HS quota for NITs.");
    return;
  }

  const rows = filterRows(filters);
  const groups = groupByInstitute(rows);
  const minimumClosingRank = Math.max(1, filters.rank - filters.window);
  const inRangeUpper = filters.rank + 2999;
  const safeStart = filters.rank + 3000;
  const statusLabels = filters.statuses.map((status) => getStatusMeta(status).label);
  const nitSummary =
    state.currentType === "nit"
      ? filters.nitQuota === "OS"
        ? ", OS quota"
        : `, HS quota, ${filters.homeState}`
      : "";

  nodes.matchCount.textContent = `${numberFormat.format(rows.length)} matching programs`;
  nodes.summaryText.textContent = `${typeMeta.shortLabel}${nitSummary}, Round ${filters.round}, ${filters.seatType}, closing rank ${numberFormat.format(minimumClosingRank)} or above, showing ${statusLabels.join(", ")}.`;
  nodes.statusMeaning.innerHTML = `
    <div class="status-meaning-card"><strong>Aspirational</strong> = closing rank from ${formatNumber(minimumClosingRank)} to ${formatNumber(filters.rank - 1)}</div>
    <div class="status-meaning-card"><strong>In range</strong> = closing rank from ${formatNumber(filters.rank)} to ${formatNumber(inRangeUpper)}</div>
    <div class="status-meaning-card"><strong>Safe by rank</strong> = closing rank ${formatNumber(safeStart)} or above</div>
  `;

  if (!rows.length) {
    renderEmpty(
      "No matching branches",
      `Try a wider rank window, a different round, or include all gender pools for ${typeMeta.shortLabel}.`,
    );
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const group of groups) {
    const clone = nodes.instituteTemplate.content.cloneNode(true);
    const article = clone.querySelector(".institute-block");
    const heading = clone.querySelector("h2");
    const rank = clone.querySelector(".rank-label");
    const location = clone.querySelector(".location");
    const count = clone.querySelector(".program-count");
    const body = clone.querySelector("tbody");

    article.dataset.institute = group.institute.id;
    heading.textContent = group.institute.canonical_name || group.institute.josaa_name;
    rank.textContent = rankLabel(group.institute);
    location.textContent = [group.institute.city, group.institute.state].filter(Boolean).join(", ");
    count.textContent = `${group.programs.length} program${group.programs.length === 1 ? "" : "s"}`;

    for (const row of group.programs) {
      const status = classify(row, filters.rank);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><div class="program-name">${row.program_name}</div></td>
        <td>${row.gender}</td>
        <td>${formatRank(row.opening_rank_raw, row.opening_rank, row.opening_is_preparatory)}</td>
        <td>${formatRank(row.closing_rank_raw, row.closing_rank, row.closing_is_preparatory)}</td>
        <td><span class="pill ${status.className}">${status.label}</span></td>
      `;
      body.appendChild(tr);
    }

    fragment.appendChild(clone);
  }

  nodes.results.replaceChildren(fragment);
}

async function activateInstituteType(typeKey, previousSelections = {}) {
  const requestId = ++state.loadRequestId;
  state.currentType = typeKey;
  document.querySelector("#nitQuotaField").hidden = typeKey !== "nit";
  document.querySelector("#homeStateField").hidden = true;
  renderLoading(typeKey);

  try {
    const dataset = await ensureDatasetLoaded(typeKey);
    if (requestId !== state.loadRequestId) {
      return;
    }

    state.cutoffs = dataset.cutoffs;
    state.filters = dataset.filters;
    state.metadata = dataset.metadata;
    state.institutes = new Map(dataset.institutes.map((institute) => [institute.id, institute]));
    populateControls(previousSelections);
    render();
  } catch (error) {
    if (requestId !== state.loadRequestId) {
      return;
    }

    nodes.matchCount.textContent = `Unable to load ${instituteTypes[typeKey].shortLabel} data`;
    nodes.summaryText.textContent = error.message;
    nodes.statusMeaning.replaceChildren();
    renderEmpty(
      "Dataset missing",
      `Run python3 scripts/fetch_josaa_2025_iit.py --types iit,nit to generate the processed ${instituteTypes[typeKey].shortLabel} files.`,
    );
  }
}

for (const control of [controls.rank, controls.round, controls.seatType, controls.gender, controls.nitQuota, controls.homeState, controls.window, controls.search]) {
  control.addEventListener("input", render);
  control.addEventListener("change", render);
}

controls.instituteType.addEventListener("change", async () => {
  const previousSelections = {
    nitQuota: controls.nitQuota.value,
    round: controls.round.value,
    seatType: controls.seatType.value,
    gender: controls.gender.value,
    homeState: controls.homeState.value,
  };
  await activateInstituteType(controls.instituteType.value, previousSelections);
});

controls.nitQuota.addEventListener("change", () => {
  syncHomeStateControl({ nitQuota: controls.nitQuota.value, homeState: controls.homeState.value });
  render();
});

nodes.statusCards.addEventListener("click", (event) => {
  const target = event.target.closest("[data-remove-status]");
  if (!target) return;
  const status = target.dataset.removeStatus;
  state.activeStatuses = state.activeStatuses.filter((value) => value !== status);
  render();
});

nodes.statusAddButton.addEventListener("click", () => {
  const isHidden = nodes.statusAddMenu.hidden;
  nodes.statusAddMenu.hidden = !isHidden;
  nodes.statusAddButton.setAttribute("aria-expanded", String(isHidden));
});

nodes.statusAddMenu.addEventListener("click", (event) => {
  const target = event.target.closest("[data-add-status]");
  if (!target) return;
  const status = target.dataset.addStatus;
  if (!state.activeStatuses.includes(status)) {
    state.activeStatuses = [...state.activeStatuses, status].sort(
      (left, right) => statusOrder.indexOf(left) - statusOrder.indexOf(right),
    );
  }
  nodes.statusAddMenu.hidden = true;
  nodes.statusAddButton.setAttribute("aria-expanded", "false");
  render();
});

document.addEventListener("click", (event) => {
  if (
    !nodes.statusAddMenu.hidden &&
    !nodes.statusAddMenu.contains(event.target) &&
    !nodes.statusAddButton.contains(event.target)
  ) {
    nodes.statusAddMenu.hidden = true;
    nodes.statusAddButton.setAttribute("aria-expanded", "false");
  }
});

activateInstituteType(state.currentType);
