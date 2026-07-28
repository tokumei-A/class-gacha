(function () {
  "use strict";

  const VERSION = 2;
  const PREFIX = "class-gacha:";
  const KEYS = {
    parts: `${PREFIX}parts`,
    adjectives: `${PREFIX}adjectives`,
    nouns: `${PREFIX}nouns`,
    history: `${PREFIX}history`,
    excluded: `${PREFIX}excluded`,
    settings: `${PREFIX}settings`,
    updatedAt: `${PREFIX}updatedAt`
  };
  const RARITIES = ["C", "UC", "R", "SR", "SSR"];
  const WEIGHTS = { C: 35, UC: 30, R: 20, SR: 10, SSR: 5 };
  const RARITY_SCORES = { C: 0.25, UC: 0.5, R: 1, SR: 2, SSR: 5 };
  const DEFAULT_SETTINGS = { excludeAfterDraw: false, activePresetName: "サンプルプリセット" };

  const SAMPLE_PRESET = {
    version: VERSION,
    parts: [
      {
        id: "part-adjective",
        label: "形容詞",
        entries: [
          { text: "冷静な", rarity: "C" },
          { text: "元気な", rarity: "C" },
          { text: "几帳面な", rarity: "C" },
          { text: "頼れる", rarity: "UC" },
          { text: "ひらめきのある", rarity: "UC" },
          { text: "鋭い", rarity: "R" },
          { text: "伝説の", rarity: "SR" },
          { text: "奇跡を呼ぶ", rarity: "SSR" }
        ]
      },
      {
        id: "part-style",
        label: "追加要素",
        entries: [
          { text: "朝イチの", rarity: "C" },
          { text: "裏方の", rarity: "C" },
          { text: "全力の", rarity: "UC" },
          { text: "秘密の", rarity: "R" },
          { text: "特命", rarity: "SR" },
          { text: "幻の", rarity: "SSR" }
        ]
      },
      {
        id: "part-noun",
        label: "名詞",
        entries: [
          { text: "進行係", rarity: "C" },
          { text: "記録係", rarity: "C" },
          { text: "会計係", rarity: "C" },
          { text: "連絡係", rarity: "UC" },
          { text: "タイムキーパー", rarity: "UC" },
          { text: "作戦参謀", rarity: "R" },
          { text: "総司令", rarity: "SR" },
          { text: "特別顧問", rarity: "SSR" }
        ]
      }
    ],
    history: [],
    excluded: { groups: {} },
    settings: DEFAULT_SETTINGS
  };

  const channel = "BroadcastChannel" in window ? new BroadcastChannel("class-gacha") : null;

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function normalizeEntry(entry) {
    return {
      id: String(entry.id || uid()),
      text: String(entry.text || "").trim(),
      rarity: RARITIES.includes(entry.rarity) ? entry.rarity : "C",
      enabled: entry.enabled !== false
    };
  }

  function normalizeGroup(group, index = 0) {
    return {
      id: String(group.id || `part-${uid()}`),
      label: String(group.label || group.name || `要素${index + 1}`).trim() || `要素${index + 1}`,
      entries: Array.isArray(group.entries) ? group.entries.map(normalizeEntry) : []
    };
  }

  function normalizeExcluded(value, groups) {
    const normalized = { groups: {} };
    if (value && value.groups && typeof value.groups === "object") {
      groups.forEach((group) => {
        normalized.groups[group.id] = Array.isArray(value.groups[group.id])
          ? value.groups[group.id].map(String)
          : [];
      });
      return normalized;
    }

    const legacyIds = [
      Array.isArray(value && value.adjectiveIds) ? value.adjectiveIds.map(String) : [],
      Array.isArray(value && value.nounIds) ? value.nounIds.map(String) : []
    ];
    groups.forEach((group, index) => {
      normalized.groups[group.id] = legacyIds[index] || [];
    });
    return normalized;
  }

  function legacyPartsFromAdjectivesAndNouns(adjectives, nouns) {
    return [
      { id: "part-adjective", label: "形容詞", entries: (adjectives || []).map(normalizeEntry) },
      { id: "part-noun", label: "名詞", entries: (nouns || []).map(normalizeEntry) }
    ];
  }

  function normalizeStateData(data) {
    const hasParts = Array.isArray(data.parts);
    const parts = hasParts
      ? data.parts.map(normalizeGroup)
      : legacyPartsFromAdjectivesAndNouns(data.adjectives || [], data.nouns || []);
    return {
      parts,
      history: Array.isArray(data.history) ? data.history : [],
      excluded: normalizeExcluded(data.excluded || {}, parts),
      settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) }
    };
  }

  function getState() {
    let rawParts = readJson(KEYS.parts, null);
    const rawAdjectives = readJson(KEYS.adjectives, null);
    const rawNouns = readJson(KEYS.nouns, null);
    if (!rawParts && !rawAdjectives && !rawNouns) {
      saveImportedState(SAMPLE_PRESET, false);
      rawParts = readJson(KEYS.parts, null);
    }
    return normalizeStateData({
      parts: rawParts,
      adjectives: rawAdjectives,
      nouns: rawNouns,
      history: readJson(KEYS.history, []),
      excluded: readJson(KEYS.excluded, {}),
      settings: readJson(KEYS.settings, DEFAULT_SETTINGS)
    });
  }

  function saveState(state, notify = true) {
    const normalized = normalizeStateData(state);
    writeJson(KEYS.parts, normalized.parts);
    writeJson(KEYS.adjectives, normalized.parts[0] ? normalized.parts[0].entries : []);
    writeJson(KEYS.nouns, normalized.parts[1] ? normalized.parts[1].entries : []);
    writeJson(KEYS.history, normalized.history);
    writeJson(KEYS.excluded, normalized.excluded);
    writeJson(KEYS.settings, normalized.settings);
    localStorage.setItem(KEYS.updatedAt, String(Date.now()));
    if (notify) announceChange();
  }

  function saveImportedState(data, notify = true) {
    saveState(normalizeStateData(data), notify);
  }

  function announceChange() {
    if (channel) channel.postMessage({ type: "state-change" });
  }

  function getExcludedIds(state, groupId) {
    return (state.excluded.groups && state.excluded.groups[groupId]) || [];
  }

  function getAvailable(group, excludedIds) {
    const excluded = new Set(excludedIds);
    return group.entries.filter((entry) => entry.enabled && entry.text && !excluded.has(entry.id));
  }

  function getEnabledCount(group) {
    return group.entries.filter((entry) => entry.enabled && entry.text).length;
  }

  function getAvailableCounts(state) {
    return state.parts.map((group) => getAvailable(group, getExcludedIds(state, group.id)).length);
  }

  function hasUnevenEnabledCounts(state) {
    const counts = state.parts.map(getEnabledCount);
    return counts.length > 1 && new Set(counts).size > 1;
  }

  function formatCountsByGroup(state, useAvailable = false) {
    return state.parts
      .map((group) => `${group.label}:${useAvailable ? getAvailable(group, getExcludedIds(state, group.id)).length : getEnabledCount(group)}`)
      .join(" / ");
  }

  function validateState(state) {
    const errors = [];
    if (state.parts.length < 2) errors.push("要素グループは2つ以上必要です。");
    state.parts.forEach((group) => validateList(group.entries, group.label, errors));
    state.parts.forEach((group) => {
      if (getAvailable(group, getExcludedIds(state, group.id)).length === 0) {
        errors.push(`抽選可能な「${group.label}」がありません。`);
      }
    });
    return errors;
  }

  function validateList(list, label, errors) {
    const seen = new Set();
    list.forEach((entry) => {
      if (!entry.text) errors.push(`${label}に空欄があります。`);
      if (!RARITIES.includes(entry.rarity)) errors.push(`${label}「${entry.text || "(空欄)"}」のレアリティが不正です。`);
      const key = entry.text.trim();
      if (key && seen.has(key)) errors.push(`${label}「${key}」が重複しています。`);
      seen.add(key);
    });
  }

  function weightedPick(list) {
    const byRarity = RARITIES.map((rarity) => ({
      rarity,
      items: list.filter((entry) => entry.rarity === rarity)
    })).filter((group) => group.items.length > 0);
    const total = byRarity.reduce((sum, group) => sum + WEIGHTS[group.rarity], 0);
    let cursor = Math.random() * total;
    for (const group of byRarity) {
      cursor -= WEIGHTS[group.rarity];
      if (cursor <= 0) return group.items[Math.floor(Math.random() * group.items.length)];
    }
    const last = byRarity[byRarity.length - 1];
    return last.items[Math.floor(Math.random() * last.items.length)];
  }

  function getFinalRarityFromEntries(entries) {
    const score = entries.reduce((value, entry) => value * RARITY_SCORES[entry.rarity], 1);
    if (score >= 10) return { rarity: "UR", score };
    if (score >= 4) return { rarity: "SSR", score };
    if (score >= 2) return { rarity: "SR", score };
    if (score >= 1) return { rarity: "R", score };
    if (score >= 0.5) return { rarity: "UC", score };
    return { rarity: "C", score };
  }

  function formatScore(score) {
    return Number.isInteger(score) ? String(score) : String(Number(score.toFixed(4)));
  }

  function getHistoryParts(item) {
    if (Array.isArray(item.parts) && item.parts.length > 0) return item.parts;
    const parts = [];
    if (item.adjectiveText) {
      parts.push({ groupId: "part-adjective", groupLabel: "形容詞", entryId: item.adjectiveId, text: item.adjectiveText, rarity: "" });
    }
    if (item.nounText) {
      parts.push({ groupId: "part-noun", groupLabel: "名詞", entryId: item.nounId, text: item.nounText, rarity: "" });
    }
    return parts;
  }

  function getHistoryName(item) {
    return getHistoryParts(item).map((part) => part.text).join(" ");
  }

  function getHistoryFinalRarity(item) {
    if (item.finalRarity && item.rarityScore !== undefined) {
      return {
        rarity: item.finalRarity,
        score: Number(item.rarityScore),
        source: item.sourceRarity || item.raritySummary || ""
      };
    }
    const source = item.sourceRarity || item.raritySummary || "";
    const sourceParts = source.split(/[+×]/).map((part) => part.trim()).filter(Boolean);
    if (sourceParts.length >= 2 && sourceParts.every((part) => RARITY_SCORES[part] !== undefined)) {
      const entries = sourceParts.map((rarity) => ({ rarity }));
      const final = getFinalRarityFromEntries(entries);
      return { ...final, source: sourceParts.join(" × ") };
    }
    return { rarity: item.raritySummary || "RESULT", score: null, source };
  }

  function formatRarityMeta(item) {
    const final = getHistoryFinalRarity(item);
    const score = final.score === null ? "" : ` / スコア ${formatScore(final.score)}`;
    return `素材 ${final.source}${score}`;
  }

  function drawRole() {
    const state = getState();
    const errors = validateState(state);
    if (errors.length > 0) return { ok: false, message: errors[0] };
    const pickedParts = state.parts.map((group) => {
      const entry = weightedPick(getAvailable(group, getExcludedIds(state, group.id)));
      return {
        groupId: group.id,
        groupLabel: group.label,
        entryId: entry.id,
        text: entry.text,
        rarity: entry.rarity
      };
    });
    const final = getFinalRarityFromEntries(pickedParts);
    const result = {
      id: uid(),
      parts: pickedParts,
      adjectiveId: pickedParts[0] ? pickedParts[0].entryId : "",
      nounId: pickedParts[1] ? pickedParts[1].entryId : "",
      adjectiveText: pickedParts[0] ? pickedParts[0].text : "",
      nounText: pickedParts[1] ? pickedParts[1].text : "",
      finalRarity: final.rarity,
      rarityScore: final.score,
      sourceRarity: pickedParts.map((part) => part.rarity).join(" × "),
      raritySummary: final.rarity,
      createdAt: new Date().toISOString()
    };
    state.history = [result, ...state.history].slice(0, 200);
    if (state.settings.excludeAfterDraw) {
      pickedParts.forEach((part) => {
        state.excluded.groups[part.groupId] = unique([...(state.excluded.groups[part.groupId] || []), part.entryId]);
      });
    }
    saveState(state);
    return { ok: true, result };
  }

  function unique(values) {
    return [...new Set(values)];
  }

  function exportData() {
    const state = getState();
    return JSON.stringify({ version: VERSION, ...state }, null, 2);
  }

  function parseImport(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (_error) {
      throw new Error("JSONとして読み込めません。");
    }
    if (!data || typeof data !== "object") throw new Error("データ形式が不正です。");
    if (!Array.isArray(data.parts) && (!Array.isArray(data.adjectives) || !Array.isArray(data.nouns))) {
      throw new Error("parts、または adjectives と nouns が必要です。");
    }
    if (Array.isArray(data.parts)) {
      data.parts.forEach((group, index) => validateRawImportList(group.entries || [], group.label || `要素${index + 1}`));
    } else {
      validateRawImportList(data.adjectives, "形容詞");
      validateRawImportList(data.nouns, "名詞");
    }
    const normalized = normalizeStateData(data);
    const errors = [];
    if (normalized.parts.length < 2) errors.push("要素グループは2つ以上必要です。");
    normalized.parts.forEach((group) => validateList(group.entries, group.label, errors));
    if (errors.length > 0) throw new Error(errors[0]);
    return normalized;
  }

  function validateRawImportList(list, label) {
    if (!Array.isArray(list)) throw new Error(`${label}のデータ形式が不正です。`);
    list.forEach((entry) => {
      if (!entry || typeof entry !== "object") throw new Error(`${label}のデータ形式が不正です。`);
      if (!String(entry.text || "").trim()) throw new Error(`${label}に空欄があります。`);
      if (!RARITIES.includes(entry.rarity)) throw new Error(`${label}「${entry.text || "(空欄)"}」のレアリティが不正です。`);
    });
  }

  function fillRaritySelect(select, value = "C") {
    select.innerHTML = "";
    RARITIES.forEach((rarity) => {
      const option = document.createElement("option");
      option.value = rarity;
      option.textContent = `${rarity} (抽選${WEIGHTS[rarity]} / 算出${RARITY_SCORES[rarity]})`;
      option.selected = rarity === value;
      select.appendChild(option);
    });
  }

  function setMessage(element, text, ok = false) {
    if (!element) return;
    element.textContent = text;
    element.classList.toggle("ok", ok);
  }

  function getStorageSignature() {
    return [
      localStorage.getItem(KEYS.updatedAt) || "",
      localStorage.getItem(KEYS.parts) || "",
      localStorage.getItem(KEYS.adjectives) || "",
      localStorage.getItem(KEYS.nouns) || "",
      localStorage.getItem(KEYS.history) || "",
      localStorage.getItem(KEYS.excluded) || "",
      localStorage.getItem(KEYS.settings) || ""
    ].join("|");
  }

  function watchStateChanges(callback) {
    let signature = getStorageSignature();
    return window.setInterval(() => {
      const nextSignature = getStorageSignature();
      if (nextSignature === signature) return;
      signature = nextSignature;
      callback();
    }, 500);
  }

  function initAdmin() {
    let flash = null;
    const els = {
      validation: document.getElementById("validationMessage"),
      groupForm: document.getElementById("groupForm"),
      groupName: document.getElementById("groupName"),
      partsContainer: document.getElementById("partsContainer"),
      excludeAfterDraw: document.getElementById("excludeAfterDraw"),
      historyList: document.getElementById("historyList"),
      rarityStats: document.getElementById("rarityStats"),
      groupCount: document.getElementById("groupCount"),
      minimumAvailable: document.getElementById("minimumAvailable"),
      historyCount: document.getElementById("historyCount"),
      excludedCount: document.getElementById("excludedCount"),
      exportButton: document.getElementById("exportButton"),
      importInput: document.getElementById("importInput"),
      jsonOutput: document.getElementById("jsonOutput"),
      resetExcludedButton: document.getElementById("resetExcludedButton"),
      clearHistoryButton: document.getElementById("clearHistoryButton"),
      clearRolesButton: document.getElementById("clearRolesButton"),
      samplePresetButton: document.getElementById("samplePresetButton")
    };

    els.groupForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const label = els.groupName.value.trim();
      if (!label) {
        flash = { text: "グループ名を入力してください。", ok: false };
        renderAdmin();
        return;
      }
      const state = getState();
      if (state.parts.some((group) => group.label === label)) {
        flash = { text: "同じ名前のグループが既にあります。", ok: false };
        renderAdmin();
        return;
      }
      const id = `part-${uid()}`;
      state.parts.push({ id, label, entries: [] });
      state.excluded.groups[id] = [];
      els.groupName.value = "";
      saveState(state);
      renderAdmin();
    });

    els.excludeAfterDraw.addEventListener("change", () => {
      const state = getState();
      if (els.excludeAfterDraw.checked && hasUnevenEnabledCounts(state)) {
        const ok = confirm(`各要素グループの有効数が同一ではありません。\n${formatCountsByGroup(state)}\n一時除外をONにすると、少ないグループから先に抽選対象がなくなる可能性があります。ONにしますか？`);
        if (!ok) {
          els.excludeAfterDraw.checked = false;
          return;
        }
      }
      state.settings.excludeAfterDraw = els.excludeAfterDraw.checked;
      saveState(state);
      renderAdmin();
    });

    els.exportButton.addEventListener("click", () => {
      const text = exportData();
      els.jsonOutput.value = text;
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `class-gacha-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    });

    els.importInput.addEventListener("change", async () => {
      const file = els.importInput.files[0];
      if (!file) return;
      try {
        const imported = parseImport(await file.text());
        saveImportedState(imported);
        flash = { text: "JSONを読み込みました。", ok: true };
      } catch (error) {
        flash = { text: error.message || "JSONの読み込みに失敗しました。", ok: false };
      } finally {
        els.importInput.value = "";
        renderAdmin();
      }
    });

    els.resetExcludedButton.addEventListener("click", () => {
      if (!confirm("一時除外リストだけをリセットします。よろしいですか？")) return;
      const state = getState();
      state.excluded = { groups: Object.fromEntries(state.parts.map((group) => [group.id, []])) };
      saveState(state);
      renderAdmin();
    });

    els.clearHistoryButton.addEventListener("click", () => {
      if (!confirm("抽選履歴を削除します。役職要素と一時除外リストは残ります。よろしいですか？")) return;
      const state = getState();
      state.history = [];
      saveState(state);
      renderAdmin();
    });

    els.clearRolesButton.addEventListener("click", () => {
      if (!confirm("役職要素をすべて削除します。履歴は残り、一時除外リストは空になります。よろしいですか？")) return;
      const state = getState();
      state.parts = [];
      state.excluded = { groups: {} };
      saveState(state);
      renderAdmin();
    });

    els.samplePresetButton.addEventListener("click", () => {
      if (!confirm("サンプルプリセットを読み込みます。現在の役職要素、履歴、一時除外リストは置き換わります。よろしいですか？")) return;
      saveImportedState(SAMPLE_PRESET);
      renderAdmin();
    });

    window.addEventListener("storage", renderAdmin);
    if (channel) channel.addEventListener("message", renderAdmin);
    watchStateChanges(renderAdmin);

    function addEntry(groupId, text, rarity) {
      const trimmed = text.trim();
      if (!trimmed) {
        flash = { text: "空欄は追加できません。", ok: false };
        return false;
      }
      if (!RARITIES.includes(rarity)) {
        flash = { text: "レアリティが不正です。", ok: false };
        return false;
      }
      const state = getState();
      const group = state.parts.find((item) => item.id === groupId);
      if (!group) return false;
      if (group.entries.some((entry) => entry.text === trimmed)) {
        flash = { text: "同じグループ内に同じ名前のデータが既にあります。", ok: false };
        return false;
      }
      group.entries.push({ id: uid(), text: trimmed, rarity, enabled: true });
      saveState(state);
      return true;
    }

    function renderAdmin() {
      const state = getState();
      const errors = validateState(state);
      const warnings = [];
      if (state.settings.excludeAfterDraw && hasUnevenEnabledCounts(state)) {
        warnings.push(`一時除外ON中ですが、有効数が同一ではありません。${formatCountsByGroup(state)}`);
      }
      if (flash) {
        setMessage(els.validation, flash.text, flash.ok);
        flash = null;
      } else if (errors.length > 0) {
        setMessage(els.validation, errors[0]);
      } else if (warnings.length > 0) {
        setMessage(els.validation, warnings[0]);
      } else {
        setMessage(els.validation, "抽選できます。", true);
      }

      const availableCounts = getAvailableCounts(state);
      const excludedTotal = Object.values(state.excluded.groups || {}).reduce((sum, list) => sum + list.length, 0);
      els.excludeAfterDraw.checked = state.settings.excludeAfterDraw;
      els.groupCount.textContent = state.parts.length;
      els.minimumAvailable.textContent = availableCounts.length ? Math.min(...availableCounts) : 0;
      els.historyCount.textContent = state.history.length;
      els.excludedCount.textContent = excludedTotal;
      renderRarityStats(state);
      renderGroups(state);
      renderHistory(state.history);
    }

    function renderRarityStats(state) {
      els.rarityStats.innerHTML = "";
      RARITIES.forEach((rarity) => {
        const counts = state.parts.map((group) => {
          const count = getAvailable(group, getExcludedIds(state, group.id)).filter((entry) => entry.rarity === rarity).length;
          return `${group.label}:${count}`;
        });
        const div = document.createElement("div");
        div.className = "rarity-stat";
        div.innerHTML = `<span class="rarity-label">${rarity} / 抽選 ${WEIGHTS[rarity]} / 算出 ${RARITY_SCORES[rarity]}</span><strong>${escapeHtml(counts.join(" / "))}</strong>`;
        els.rarityStats.appendChild(div);
      });
    }

    function renderGroups(state) {
      els.partsContainer.innerHTML = "";
      if (state.parts.length === 0) {
        els.partsContainer.innerHTML = '<div class="empty">まだ要素グループがありません。2つ以上追加してください。</div>';
        return;
      }
      const template = document.getElementById("groupTemplate");
      state.parts.forEach((group, index) => {
        const node = template.content.firstElementChild.cloneNode(true);
        const label = node.querySelector(".group-label");
        const count = node.querySelector(".group-count");
        const moveUp = node.querySelector(".move-group-up-button");
        const moveDown = node.querySelector(".move-group-down-button");
        const deleteGroup = node.querySelector(".delete-group-button");
        const form = node.querySelector(".entry-form");
        const newText = node.querySelector(".new-entry-text");
        const newRarity = node.querySelector(".new-entry-rarity");
        const list = node.querySelector(".entry-list");
        label.value = group.label;
        count.textContent = `有効 ${getEnabledCount(group)} / 抽選可 ${getAvailable(group, getExcludedIds(state, group.id)).length}`;
        fillRaritySelect(newRarity, "C");
        label.addEventListener("change", () => updateGroup(group.id, { label: label.value.trim() }));
        moveUp.disabled = index === 0;
        moveDown.disabled = index === state.parts.length - 1;
        moveUp.addEventListener("click", () => moveGroup(group.id, -1));
        moveDown.addEventListener("click", () => moveGroup(group.id, 1));
        deleteGroup.addEventListener("click", () => deleteGroupById(group.id));
        form.addEventListener("submit", (event) => {
          event.preventDefault();
          addEntry(group.id, newText.value, newRarity.value);
          newText.value = "";
          renderAdmin();
        });
        renderEntries(state, group, list);
        els.partsContainer.appendChild(node);
      });
    }

    function renderEntries(state, group, container) {
      container.innerHTML = "";
      if (group.entries.length === 0) {
        container.innerHTML = '<div class="empty">まだデータがありません。</div>';
        return;
      }
      const excluded = new Set(getExcludedIds(state, group.id));
      const template = document.getElementById("entryTemplate");
      group.entries.forEach((entry) => {
        const node = template.content.firstElementChild.cloneNode(true);
        const enabled = node.querySelector(".entry-enabled");
        const text = node.querySelector(".entry-text");
        const rarity = node.querySelector(".entry-rarity");
        const restore = node.querySelector(".restore-button");
        const remove = node.querySelector(".delete-button");
        node.classList.toggle("is-excluded", excluded.has(entry.id));
        enabled.checked = entry.enabled;
        text.value = entry.text;
        fillRaritySelect(rarity, entry.rarity);
        enabled.addEventListener("change", () => updateEntry(group.id, entry.id, { enabled: enabled.checked }));
        text.addEventListener("change", () => updateEntry(group.id, entry.id, { text: text.value.trim() }));
        rarity.addEventListener("change", () => updateEntry(group.id, entry.id, { rarity: rarity.value }));
        restore.addEventListener("click", () => restoreEntry(group.id, entry.id));
        remove.addEventListener("click", () => deleteEntry(group.id, entry.id));
        container.appendChild(node);
      });
    }

    function updateGroup(groupId, patch) {
      const state = getState();
      if (!patch.label) {
        flash = { text: "グループ名は空欄にできません。", ok: false };
        renderAdmin();
        return;
      }
      if (state.parts.some((group) => group.id !== groupId && group.label === patch.label)) {
        flash = { text: "同じ名前のグループが既にあります。", ok: false };
        renderAdmin();
        return;
      }
      state.parts = state.parts.map((group) => group.id === groupId ? { ...group, ...patch } : group);
      saveState(state);
      renderAdmin();
    }

    function moveGroup(groupId, direction) {
      const state = getState();
      const index = state.parts.findIndex((group) => group.id === groupId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= state.parts.length) return;
      const [group] = state.parts.splice(index, 1);
      state.parts.splice(nextIndex, 0, group);
      saveState(state);
      renderAdmin();
    }

    function deleteGroupById(groupId) {
      const state = getState();
      if (state.parts.length <= 2 && !confirm("要素グループが2つ未満になると抽選できません。削除しますか？")) return;
      if (state.parts.length > 2 && !confirm("この要素グループを削除します。よろしいですか？")) return;
      state.parts = state.parts.filter((group) => group.id !== groupId);
      delete state.excluded.groups[groupId];
      saveState(state);
      renderAdmin();
    }

    function updateEntry(groupId, entryId, patch) {
      const state = getState();
      const group = state.parts.find((item) => item.id === groupId);
      if (!group) return;
      if (patch.text !== undefined) {
        if (!patch.text) {
          flash = { text: "空欄には変更できません。", ok: false };
          renderAdmin();
          return;
        }
        if (group.entries.some((entry) => entry.id !== entryId && entry.text === patch.text)) {
          flash = { text: "同じグループ内に同じ名前のデータが既にあります。", ok: false };
          renderAdmin();
          return;
        }
      }
      group.entries = group.entries.map((entry) => entry.id === entryId ? { ...entry, ...patch } : entry);
      saveState(state);
      renderAdmin();
    }

    function restoreEntry(groupId, entryId) {
      const state = getState();
      state.excluded.groups[groupId] = (state.excluded.groups[groupId] || []).filter((value) => value !== entryId);
      saveState(state);
      renderAdmin();
    }

    function deleteEntry(groupId, entryId) {
      if (!confirm("このデータを削除します。よろしいですか？")) return;
      const state = getState();
      const group = state.parts.find((item) => item.id === groupId);
      if (!group) return;
      group.entries = group.entries.filter((entry) => entry.id !== entryId);
      state.excluded.groups[groupId] = (state.excluded.groups[groupId] || []).filter((value) => value !== entryId);
      saveState(state);
      renderAdmin();
    }

    function renderHistory(history) {
      els.historyList.innerHTML = "";
      if (history.length === 0) {
        els.historyList.innerHTML = '<div class="empty">まだ履歴がありません。</div>';
        return;
      }
      history.forEach((item) => {
        const article = document.createElement("article");
        article.className = "history-item";
        const date = item.createdAt ? new Date(item.createdAt).toLocaleString("ja-JP") : "";
        const final = getHistoryFinalRarity(item);
        article.innerHTML = `<div><div class="history-name">${escapeHtml(final.rarity)} / ${escapeHtml(getHistoryName(item))}</div><div class="history-meta">${escapeHtml(formatRarityMeta(item))}</div></div><time class="history-meta">${escapeHtml(date)}</time>`;
        els.historyList.appendChild(article);
      });
    }

    renderAdmin();
  }

  function initStream() {
    const els = {
      rarity: document.getElementById("streamRarity"),
      roulette: document.getElementById("rouletteText"),
      result: document.getElementById("resultText"),
      message: document.getElementById("streamMessage"),
      draw: document.getElementById("drawButton"),
      available: document.getElementById("streamAvailable"),
      excludeMode: document.getElementById("streamExcludeMode")
    };

    els.draw.addEventListener("click", async () => {
      const state = getState();
      const errors = validateState(state);
      if (errors.length > 0) {
        renderStream(errors[0]);
        return;
      }
      els.draw.disabled = true;
      document.body.classList.add("rolling");
      await roulette(els, state);
      const draw = drawRole();
      document.body.classList.remove("rolling");
      els.draw.disabled = false;
      if (!draw.ok) {
        renderStream(draw.message);
        return;
      }
      els.rarity.textContent = draw.result.finalRarity;
      els.roulette.textContent = "決定";
      els.result.textContent = getHistoryName(draw.result);
      els.message.textContent = formatRarityMeta(draw.result);
      updateStreamFooter();
    });

    window.addEventListener("storage", () => renderStream());
    if (channel) channel.addEventListener("message", () => renderStream());
    watchStateChanges(() => {
      if (!els.draw.disabled) renderStream();
    });
    renderStream();

    function renderStream(message = "") {
      const state = getState();
      const errors = validateState(state);
      const latest = state.history[0];
      if (latest) {
        els.rarity.textContent = getHistoryFinalRarity(latest).rarity;
        els.result.textContent = getHistoryName(latest);
        els.roulette.textContent = "前回の結果";
      } else {
        els.rarity.textContent = "READY";
        els.result.textContent = "ガチャるを押してください";
        els.roulette.textContent = "今日の役職は?";
      }
      els.message.textContent = message || errors[0] || (latest ? formatRarityMeta(latest) : "");
      updateStreamFooter();
    }

    function updateStreamFooter() {
      const state = getState();
      const counts = state.parts.map((group) => `${group.label} ${getAvailable(group, getExcludedIds(state, group.id)).length}`);
      els.available.textContent = `抽選対象: ${counts.join(" / ") || "なし"}`;
      els.excludeMode.textContent = `一時除外: ${state.settings.excludeAfterDraw ? "ON" : "OFF"}`;
    }
  }

  function roulette(els, state) {
    const groups = state.parts.map((group) => ({
      group,
      entries: getAvailable(group, getExcludedIds(state, group.id))
    }));
    let count = 0;
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        const entries = groups.map(({ entries: list }) => list[Math.floor(Math.random() * list.length)]);
        els.rarity.textContent = getFinalRarityFromEntries(entries).rarity;
        els.roulette.textContent = entries.map((entry) => entry.text).join(" ");
        els.result.textContent = "抽選中...";
        count += 1;
        if (count >= 24) {
          clearInterval(timer);
          resolve();
        }
      }, 70);
    });
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  if (document.body.classList.contains("admin-page")) initAdmin();
  if (document.body.classList.contains("stream-page")) initStream();
})();
