// ---------- Screen switching ----------
const screens = {
  home: document.getElementById("home"),
  send: document.getElementById("send"),
  receive: document.getElementById("receive"),
};

function show(name) {
  for (const key in screens) screens[key].classList.add("hidden");
  screens[name].classList.remove("hidden");
  if (name === "receive") startReceive();
  else stopReceive();
}

document.getElementById("goSend").onclick = () => show("send");
document.getElementById("goReceive").onclick = () => show("receive");
document.getElementById("backFromSend").onclick = () => show("home");
document.getElementById("backFromReceive").onclick = () => show("home");

// ---------- Device name (label shown to the receiver) ----------
let deviceName = localStorage.getItem("deviceName");
if (!deviceName) {
  deviceName = "Device-" + Math.floor(Math.random() * 9000 + 1000);
  localStorage.setItem("deviceName", deviceName);
}

// ---------- SEND ----------
const fileInput = document.getElementById("file");
const toInput = document.getElementById("toCode");
const statusEl = document.getElementById("status");
const selectedEl = document.getElementById("selected");
let selectedFiles = [];

document.getElementById("pickBtn").onclick = () => fileInput.click();

// Each time the user picks files, ADD them to the list
fileInput.addEventListener("change", () => {
  for (const f of fileInput.files) {
    const exists = selectedFiles.some(
      (x) => x.name === f.name && x.size === f.size && x.lastModified === f.lastModified
    );
    if (!exists) selectedFiles.push(f);
  }
  fileInput.value = ""; // so the same file can be picked again later
  renderSelected();
});

function renderSelected() {
  selectedEl.innerHTML = "";
  selectedFiles.forEach((f, i) => {
    const row = document.createElement("div");
    row.className = "sel-item";
    const name = document.createElement("span");
    name.textContent = f.name + " (" + (f.size / 1048576).toFixed(2) + " MB)";
    const del = document.createElement("button");
    del.textContent = "✕";
    del.onclick = () => {
      selectedFiles.splice(i, 1);
      renderSelected();
    };
    row.appendChild(name);
    row.appendChild(del);
    selectedEl.appendChild(row);
  });
}

document.getElementById("sendBtn").addEventListener("click", async () => {
  const to = toInput.value.toUpperCase().trim();
  if (to.length !== 4) {
    statusEl.textContent = "Enter the receiver's 4-character code";
    return;
  }
  if (selectedFiles.length === 0) {
    statusEl.textContent = "Choose at least one file";
    return;
  }

  const fd = new FormData();
  fd.append("device", deviceName);
  fd.append("to", to);
  for (const f of selectedFiles) fd.append("files", f);

  statusEl.textContent = "Sending " + selectedFiles.length + " file(s)...";
  try {
    const res = await fetch("/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (data.ok) {
      statusEl.textContent = "Sent " + data.count + " file(s) to " + to + " ✔";
      selectedFiles = [];
      renderSelected();
    } else {
      statusEl.textContent = data.error;
    }
  } catch (e) {
    statusEl.textContent = "Failed to send. Check your connection.";
  }
});

// ---------- RECEIVE ----------
let me = "";
let expiresAt = 0;
let lastData = "";
let fetching = false;
let receiving = false;
let tickTimer = null;
let pollTimer = null;

const codeEl = document.getElementById("myCode");
const timerEl = document.getElementById("timer");
const listEl = document.getElementById("list");

async function getCode() {
  if (fetching) return;
  fetching = true;
  try {
    const res = await fetch("/new-code");
    const data = await res.json();
    me = data.code;
    expiresAt = data.expiresAt;
    codeEl.textContent = me;
    lastData = "";
    listEl.innerHTML = "<p style='color:#999'>Nothing received yet.</p>";
  } catch (e) {
    timerEl.textContent = "Cannot reach server";
  }
  fetching = false;
}

async function startReceive() {
  stopReceive();
  receiving = true;
  me = "";
  expiresAt = 0;
  codeEl.textContent = "----";
  timerEl.textContent = "";
  listEl.innerHTML = "";

  await getCode(); // always a brand new code
  if (!receiving) return; // user pressed Back while waiting

  tickTimer = setInterval(() => {
    if (!expiresAt) return;
    const left = expiresAt - Date.now();
    if (left <= 0) {
      timerEl.textContent = "Code expired, getting a new one...";
      getCode();
    } else {
      const m = Math.floor(left / 60000);
      const s = Math.floor((left % 60000) / 1000);
      timerEl.textContent = "Expires in " + m + ":" + String(s).padStart(2, "0");
    }
  }, 1000);

  loadFiles();
  pollTimer = setInterval(loadFiles, 3000);
}

function stopReceive() {
  receiving = false;
  clearInterval(tickTimer);
  clearInterval(pollTimer);
}

async function loadFiles() {
  if (!me) return;
  try {
    const res = await fetch("/files?code=" + me);
    const items = await res.json();
    const data = JSON.stringify(items);
    if (data === lastData) return;
    lastData = data;

    listEl.innerHTML = "";
    if (items.length === 0) {
      listEl.innerHTML = "<p style='color:#999'>Nothing received yet.</p>";
      return;
    }
    for (const it of items) {
      const card = document.createElement("div");
      card.className = "card";

      const info = document.createElement("div");
      info.textContent = it.name + " (" + (it.size / 1048576).toFixed(2) + " MB) from " + it.device;
      card.appendChild(info);

      if (it.type.startsWith("image/")) {
        const img = document.createElement("img");
        img.src = "/view/" + it.stored;
        card.appendChild(img);
      } else if (it.type.startsWith("video/")) {
        const vid = document.createElement("video");
        vid.src = "/view/" + it.stored;
        vid.controls = true;
        card.appendChild(vid);
      }

      const a = document.createElement("a");
      a.href = "/download/" + it.stored;
      a.textContent = "Download";
      card.appendChild(a);

      listEl.appendChild(card);
    }
  } catch (e) {
    // ignore, will retry in 3 seconds
  }
}