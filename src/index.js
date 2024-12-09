//==============================
// Configuração e Estado
//==============================
let ORG;
let TOKEN;
let apigee;

const state = {
  ENVS: [],
  CUR_ENV: null,
  selectedEnv: null,
  selectedKvm: null,
  currentEntryList: [],

  envPage: 0,
  kvmPage: 0,
  entryPage: 0,

  ENV_PAGE_SIZE: 14,
  KVM_PAGE_SIZE: 13,
  ENTRY_PAGE_SIZE: 7
};

// Regex para validar JSON array de objetos com 'name' e 'value'
const jsonArrayRegex = /^\[\s*\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"value"\s*:\s*(\d+|"[^"]+")\s*\}(?:\s*,\s*\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"value"\s*:\s*(\d+|"[^"]+")\s*\})*\s*\]$/;

//==============================
// Inicialização
//==============================
document.addEventListener("DOMContentLoaded", async () => {
  const configs = await loadConfig();
  ORG = configs.ORG;
  TOKEN = configs.TOKEN;

  apigee = createApigeeClient(TOKEN);

  state.ENVS = await listEnvironments();
  resetSelection();

  document.getElementById("add-kvm-btn").addEventListener("click", handleAddKvm);
});

//==============================
// Funções Utilitárias
//==============================
function createApigeeClient(token) {
  return axios.create({
    baseURL: "https://apigee.googleapis.com",
    timeout: 2000,
    headers: { Authorization: `Bearer ${token}` }
  });
}

async function loadConfig() {
  const response = await fetch("config.json");
  return response.json();
}

function clearViews() {
  document.getElementById("env-view").innerHTML = "";
  document.getElementById("kvm-view").innerHTML = "";
  document.getElementById("table-view").innerHTML = "";
}

function updateBreadcrumb() {
  const breadcrumbSpan = document.getElementById("breadcrumb-path");
  let path = `organizations/${ORG}`;
  if (state.CUR_ENV) {
    path += `/environments/${state.CUR_ENV}`;
    if (state.selectedKvm) {
      path += `/keyvaluemaps/${state.selectedKvm}`;
    }
  }
  breadcrumbSpan.textContent = path;
}

function createInput(id, placeholder) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "form-control me-2";
  input.placeholder = placeholder;
  input.style.maxWidth = "100%";
  input.id = id;
  return input;
}

function createKvmInput(placeholder, value, className) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = `form-control me-2 ${className}`;
  input.placeholder = placeholder;
  input.style.maxWidth = "100%";
  input.value = value;
  return input;
}

function sortByAlphabetical(list, attribute) {
  return list.sort((a, b) => a[attribute].localeCompare(b[attribute]));
}

//==============================
// Manipulação de Estado
//==============================
function resetSelection() {
  state.selectedEnv = null;
  state.CUR_ENV = null;
  state.selectedKvm = null;
  state.envPage = 0;
  state.kvmPage = 0;
  state.entryPage = 0;
  state.currentEntryList = [];

  updateBreadcrumb();
  clearViews();
  renderEnvironments(state.ENVS);
}

function clearKvmAndTable() {
  document.getElementById("kvm-view").innerHTML = "";
  document.getElementById("table-view").innerHTML = "";
  state.selectedKvm = null;
}

//==============================
// Funções de Paginação Genéricas
//==============================
function paginate(items, page, pageSize) {
  const start = page * pageSize;
  const end = start + pageSize;
  return {
    subset: items.slice(start, end),
    total: items.length,
    start,
    end
  };
}

function canGoNext(page, total, pageSize) {
  return (page + 1) * pageSize < total;
}

function canGoPrev(page) {
  return page > 0;
}

//==============================
// Chamadas de API
//==============================
async function listEnvironments() {
  try {
    const response = await apigee.get(`/v1/organizations/${ORG}/environments`);
    return response.data;
  } catch (error) {
    console.error(error);
    alert("Error: Missing or invalid token");
    return [];
  }
}

async function listKvms() {
  if (!state.CUR_ENV) return { items: [] };
  try {
    const response = await apigee.get(`/v1/organizations/${ORG}/environments/${state.CUR_ENV}/keyvaluemaps`);
    const kvms = response.data.map((kvm, i) => ({ id: i, name: kvm }));
    return { items: kvms };
  } catch (error) {
    console.error(error);
    alert("Error: Missing or invalid token");
    return { items: [] };
  }
}

async function listEntriesKvms(kvm) {
  try {
    const response = await apigee.get(
      `/v1/organizations/${ORG}/environments/${state.CUR_ENV}/keyvaluemaps/${encodeURIComponent(kvm.trim())}/entries`
    );
    return response.data.keyValueEntries
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => ({ ...e, id: e.name }));
  } catch (error) {
    console.error(error);
    return [];
  }
}

async function createEntry(kvm, name, value) {
  const body = { name, value };
  return apigee.post(
    `/v1/organizations/${ORG}/environments/${state.CUR_ENV}/keyvaluemaps/${encodeURIComponent(kvm.trim())}/entries`,
    body
  );
}

async function createKvm(kvm) {
  const body = { name: kvm, encrypted: true };
  await apigee.post(`/v1/organizations/${ORG}/environments/${state.CUR_ENV}/keyvaluemaps/`, body);
  renderHomePage();
}

async function removeKvm(kvm) {
  await apigee.delete(
    `/v1/organizations/${ORG}/environments/${state.CUR_ENV}/keyvaluemaps/${encodeURIComponent(kvm)}`
  );
  if (state.selectedKvm === kvm) {
    state.selectedKvm = null;
    document.getElementById("table-view").innerHTML = "";
  }
  renderHomePage();
}

//==============================
// Renderização
//==============================
function renderEnvironments(envs) {
  const templateSource = document.getElementById("env-list-template").innerHTML;
  const template = Handlebars.compile(templateSource);

  const { subset, total, start, end } = paginate(envs, state.envPage, state.ENV_PAGE_SIZE);
  const showPagination = total > state.ENV_PAGE_SIZE;
  const prevDisabled = !canGoPrev(state.envPage);
  const nextDisabled = !canGoNext(state.envPage, total, state.ENV_PAGE_SIZE);

  const envView = document.getElementById("env-view");
  envView.innerHTML = template({ items: subset, showPagination, prevDisabled, nextDisabled });

  envView.querySelectorAll(".env-item").forEach((item) => {
    const envName = item.getAttribute("data-env-name");
    item.addEventListener("click", () => toggleEnvSelection(envName, item));
  });
}

async function renderHomePage() {
  if (!state.CUR_ENV) {
    clearKvmAndTable();
    return;
  }

  const kvmsList = await listKvms();
  const items = kvmsList.items || [];

  const { subset, total } = paginate(items, state.kvmPage, state.KVM_PAGE_SIZE);
  const showPagination = total > state.KVM_PAGE_SIZE;
  const prevDisabled = !canGoPrev(state.kvmPage);
  const nextDisabled = !canGoNext(state.kvmPage, total, state.KVM_PAGE_SIZE);

  const templateSource = document.getElementById("kvm-list-template").innerHTML;
  const template = Handlebars.compile(templateSource);
  const kvmView = document.getElementById("kvm-view");

  kvmView.innerHTML = template({ items: subset, showPagination, prevDisabled, nextDisabled });

  const deleteBtn = document.getElementById("delete-active-kvm-btn");
  if (deleteBtn) {
    deleteBtn.disabled = !state.selectedKvm;
  }

  kvmView.querySelectorAll(".kvm-item").forEach((item) => {
    const kvmName = item.getAttribute("data-kvm-name");
    item.addEventListener("click", () => toggleKvmSelection(kvmName, item));
  });
}

function renderEntriesTable() {
  const templateSource = document.getElementById("table-template").innerHTML;
  const template = Handlebars.compile(templateSource);

  const { subset, total } = paginate(state.currentEntryList, state.entryPage, state.ENTRY_PAGE_SIZE);
  const showPagination = total > state.ENTRY_PAGE_SIZE;
  const prevDisabled = !canGoPrev(state.entryPage);
  const nextDisabled = !canGoNext(state.entryPage, total, state.ENTRY_PAGE_SIZE);

  const tableView = document.getElementById("table-view");
  tableView.style.display = "block";
  tableView.innerHTML = template({
    kvm: state.selectedKvm || "",
    items: subset,
    showPagination,
    prevDisabled,
    nextDisabled
  });
}

//==============================
// Manipulação de Eventos
//==============================
function handleAddKvm() {
  const kvmNameInput = document.getElementById("new-kvm-name");
  const kvmName = kvmNameInput.value.trim();
  if (kvmName) {
    createKvm(kvmName);
    window.alert(`KVM ${kvmName} created successfully.`);
    kvmNameInput.value = "";
  } else {
    alert("Please enter a KVM name.");
  }
}

function toggleEnvSelection(envName, itemElement) {
  const kvmContainer = document.getElementById("kvm-container");

  if (state.selectedEnv === envName) {
    state.selectedEnv = null;
    state.CUR_ENV = null;
    itemElement.classList.remove("active");
    clearKvmAndTable();

    kvmContainer.style.display = "none";
  } else {
    const oldSelected = document.querySelector(".env-item.active");
    if (oldSelected) oldSelected.classList.remove("active");
    state.selectedEnv = envName;
    state.CUR_ENV = envName;
    itemElement.classList.add("active");
    state.kvmPage = 0;
    state.selectedKvm = null;
    renderHomePage();

    kvmContainer.style.display = "block";
  }
  updateBreadcrumb();
}

function toggleKvmSelection(kvmName, itemElement) {
  const oldSelected = document.querySelector(".kvm-item.active");
  if (state.selectedKvm === kvmName) {
    state.selectedKvm = null;
    itemElement.classList.remove("active");
    document.getElementById("table-view").innerHTML = "";
  } else {
    if (oldSelected) oldSelected.classList.remove("active");
    state.selectedKvm = kvmName;
    itemElement.classList.add("active");
    state.entryPage = 0;
    getEntriesKvm(kvmName);
  }

  const deleteBtn = document.getElementById("delete-active-kvm-btn");
  if (deleteBtn) {
    deleteBtn.disabled = !state.selectedKvm;
  }

  updateBreadcrumb();
}

async function getEntriesKvm(kvm) {
  state.currentEntryList = await listEntriesKvms(kvm);
  state.entryPage = 0;
  renderEntriesTable();
  createTopLine();

  const switchInput = document.getElementById("flexSwitchCheckDefault");
  const nameInput = document.getElementById("top-name");
  const valueInput = document.getElementById("top-value");

  if (switchInput && nameInput && valueInput) {
    switchInput.addEventListener("change", function () {
      if (switchInput.checked) {
        nameInput.placeholder = "Add JSON Array";
        valueInput.placeholder = "";
        valueInput.hidden = true;
        valueInput.value = "";
      } else {
        nameInput.placeholder = "Type Name";
        valueInput.placeholder = "Type Value";
        valueInput.hidden = false;
      }
    });
  }
}


function prevEnvPage() {
  if (canGoPrev(state.envPage)) {
    state.envPage--;
    renderEnvironments(state.ENVS);
  }
}

function nextEnvPage() {
  if (canGoNext(state.envPage, state.ENVS.length, state.ENV_PAGE_SIZE)) {
    state.envPage++;
    renderEnvironments(state.ENVS);
  }
}

function prevKvmPage() {
  if (canGoPrev(state.kvmPage)) {
    state.kvmPage--;
    renderHomePage();
  }
}

function nextKvmPage() {
  state.kvmPage++;
  renderHomePage();
}

function prevEntryPage() {
  if (canGoPrev(state.entryPage)) {
    state.entryPage--;
    renderEntriesTable();
  }
}

function nextEntryPage() {
  if (canGoNext(state.entryPage, state.currentEntryList.length, state.ENTRY_PAGE_SIZE)) {
    state.entryPage++;
    renderEntriesTable();
  }
}

//==============================
// Funções relacionadas a Entries
//==============================
function createTopLine() {
  const container = document.getElementById("entries-container");
  container.innerHTML = "";

  const line = document.createElement("div");
  line.id = "top-line";
  line.className = "d-flex align-items-center mb-3";
  line.style.width = "100%";

  const inputDiv = document.createElement("div");
  inputDiv.className = "d-flex align-items-center ms-2";
  inputDiv.style.width = "94%";

  const nameInput = createInput("top-name", "Enter Name");
  const valueInput = createInput("top-value", "Enter Value");
  inputDiv.appendChild(nameInput);
  inputDiv.appendChild(valueInput);

  const plusDiv = document.createElement("div");
  plusDiv.className = "d-flex justify-content-end ms-2";
  plusDiv.style.width = "3%";

  const plusBtn = document.createElement("button");
  plusBtn.className = "btn p-0 border-0 bg-transparent";
  plusBtn.style.color = "green";
  plusBtn.title = "Add Name/Value Pair";
  plusBtn.innerHTML = '<i class="fas fa-plus"></i>';
  plusBtn.onclick = pushKvmPair;

  plusDiv.appendChild(plusBtn);
  line.appendChild(inputDiv);
  line.appendChild(plusDiv);
  container.appendChild(line);

  nameInput.addEventListener("change", handleArrayInput);
  nameInput.focus();
}

function handleArrayInput(event) {
  const input = event.target.value.trim();

  if (jsonArrayRegex.test(input)) {
    try {
      const array = JSON.parse(input);
      array.forEach(({ name, value }) => {
        addCommittedLine(name, value);
      });

      event.target.value = "";
      const valueField = document.getElementById("top-value");
      if (valueField) valueField.value = "";
    } catch (error) {
      console.error("Invalid JSON input:", error);
      alert("Error processing JSON input. Please verify the format.");
    }
  }
}

function pushKvmPair() {
  const nameInput = document.getElementById("top-name");
  const valueInput = document.getElementById("top-value");

  const name = nameInput.value.trim();
  const value = valueInput.value.trim();

  if (!name || !value) {
    alert("Name and Value cannot be empty.");
    return;
  }

  addCommittedLine(name, value);
  nameInput.value = "";
  valueInput.value = "";
  nameInput.focus();
}

function addCommittedLine(name, value) {
  const container = document.getElementById("entries-container");
  const topLine = document.getElementById("top-line");

  const line = document.createElement("div");
  line.className = "d-flex align-items-center mb-3";
  line.style.width = "100%";

  const minusDiv = document.createElement("div");
  minusDiv.className = "d-flex align-items-center";
  minusDiv.style.width = "3%";

  const minusBtn = document.createElement("button");
  minusBtn.className = "btn p-0 border-0 bg-transparent";
  minusBtn.style.color = "red";
  minusBtn.title = "Remove Name/Value Pair";
  minusBtn.innerHTML = '<i class="fas fa-minus"></i>';
  minusBtn.onclick = removeKvmLine;

  minusDiv.appendChild(minusBtn);

  const inputDiv = document.createElement("div");
  inputDiv.className = "d-flex align-items-center ms-2";
  inputDiv.style.width = "94%";

  const nameInputElem = createKvmInput("Enter Name", name, "kvm-key");
  const valueInputElem = createKvmInput("Enter Value", value, "kvm-value");

  inputDiv.appendChild(nameInputElem);
  inputDiv.appendChild(valueInputElem);

  line.appendChild(minusDiv);
  line.appendChild(inputDiv);

  container.insertBefore(line, topLine.nextSibling);
}

function removeKvmLine(event) {
  const line = event.target.closest(".d-flex.align-items-center.mb-3");
  if (line && line.id !== "top-line") {
    line.remove();
  }
}

//==============================
// Ações de Entries / KVM
//==============================
function exportToJSON() {
  const table = document.getElementById('kvm-entries-table');
  const rows = table.querySelectorAll('tbody tr');

  const entries = [];
  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    const entry = {
      name: cells[0]?.innerText.trim(),
      value: cells[1]?.innerText.trim()
    };
    entries.push(entry);
  });

  const json = JSON.stringify(entries, null, 2);
  const blob = new Blob([json], { type: 'application/json' });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'entries.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

window.addEntry = async function () {
  const kvm = (state.selectedKvm || "").trim();
  if (!kvm) return alert("No KVM selected.");

  const container = document.getElementById("entries-container");
  const committedLines = container.querySelectorAll(".d-flex.align-items-center.mb-3:not(#top-line)");

  if (committedLines.length === 0) {
    return alert("No lines to add.");
  }

  for (const line of committedLines) {
    const nameInput = line.querySelector(".kvm-key");
    const valueInput = line.querySelector(".kvm-value");

    if (nameInput && valueInput) {
      const name = nameInput.value.trim();
      const value = valueInput.value.trim();

      if (!name || !value) {
        alert("Name and Value cannot be empty for at least one pair.");
        continue;
      }

      try {
        await createEntry(kvm, name, value);
      } catch (error) {
        console.error(`Error adding entry { name: ${name}, value: ${value} }:`, error);
        alert(`Error adding entry: ${name}`);
      }
    }
  }

  getEntriesKvm(kvm);
};

window.deleteEntry = async function (entryKey) {
  const kvm = (state.selectedKvm || "").trim();
  if (!kvm) return alert("No KVM selected.");

  if (confirm(`Are you sure you want to delete entry: ${entryKey}? This action cannot be undone.`)) {
    await apigee.delete(
      `/v1/organizations/${ORG}/environments/${state.CUR_ENV}/keyvaluemaps/${encodeURIComponent(kvm)}/entries/${encodeURIComponent(entryKey)}`
    );
    getEntriesKvm(kvm);
  }
};

window.deleteActiveKvm = function () {
  if (!state.selectedKvm) {
    return alert("No KVM selected.");
  }
  removeKvm(state.selectedKvm);
};

// Expor funções de paginação do escopo global caso sejam chamadas no template
window.prevEnvPage = prevEnvPage;
window.nextEnvPage = nextEnvPage;
window.prevKvmPage = prevKvmPage;
window.nextKvmPage = nextKvmPage;
window.prevEntryPage = prevEntryPage;
window.nextEntryPage = nextEntryPage;
window.exportToJSON = exportToJSON;
