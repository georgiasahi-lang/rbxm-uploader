"use strict";

const $ = (id) => document.getElementById(id);

const apiKeyInput  = $("apiKeyInput");
const toggleKey    = $("toggleKey");
const dropZone     = $("dropZone");
const fileInput    = $("fileInput");
const fileInfo     = $("fileInfo");
const fileName     = $("fileName");
const fileSize     = $("fileSize");
const removeFile   = $("removeFile");
const assetName    = $("assetName");
const assetDesc    = $("assetDesc");
const uploadBtn    = $("uploadBtn");
const uploadLabel  = $("uploadBtnLabel");
const statusCard   = $("statusCard");
const statusTitle  = $("statusTitle");
const statusSub    = $("statusSub");
const resultCard   = $("resultCard");
const errorCard    = $("errorCard");
const errorMsg     = $("errorMsg");
const outAssetId   = $("outAssetId");
const outRbxUri    = $("outRbxUri");
const outLua       = $("outLua");
const resetBtn     = $("resetBtn");
const retryBtn     = $("retryBtn");
const toastWrap    = $("toastWrap");

let selectedFile = null;
const SESSION_KEY = "rbxm_apikey";

function loadSessionKey() {
  const stored = sessionStorage.getItem(SESSION_KEY);
  if (stored) apiKeyInput.value = stored;
}

function saveSessionKey(val) {
  if (val) sessionStorage.setItem(SESSION_KEY, val);
  else sessionStorage.removeItem(SESSION_KEY);
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(2) + " MB";
}

function showToast(msg, type = "") {
  const el = document.createElement("div");
  el.className = "toast" + (type ? " " + type : "");
  el.textContent = msg;
  toastWrap.appendChild(el);
  setTimeout(() => {
    el.style.animation = "toastOut 0.3s ease forwards";
    el.addEventListener("animationend", () => el.remove());
  }, 2800);
}

function setFile(file) {
  if (!file) return;
  const ext = file.name.split(".").pop().toLowerCase();
  if (!["rbxm", "rbxmx"].includes(ext)) {
    showToast("File harus .rbxm atau .rbxmx");
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    showToast("File terlalu besar — maksimal 20 MB");
    return;
  }
  selectedFile = file;
  fileName.textContent = file.name;
  fileSize.textContent = formatBytes(file.size);
  dropZone.style.display = "none";
  fileInfo.classList.add("show");
  checkReady();
}

function clearFile() {
  selectedFile = null;
  fileInput.value = "";
  fileInfo.classList.remove("show");
  dropZone.style.display = "";
  checkReady();
}

function checkReady() {
  const hasKey  = apiKeyInput.value.trim().length > 0;
  const hasFile = selectedFile !== null;
  const hasName = assetName.value.trim().length > 0;
  uploadBtn.disabled = !(hasKey && hasFile && hasName);
}

function setStatus(title, sub) {
  statusTitle.textContent = title;
  statusSub.textContent   = sub;
}

function showSection(id) {
  ["statusCard", "resultCard", "errorCard"].forEach((s) => {
    $(s).style.display = "none";
  });
  if (id) $(id).style.display = "";
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function fillResult(assetId) {
  outAssetId.textContent = assetId;
  outRbxUri.textContent  = "rbxassetid://" + assetId;
  outLua.textContent     = `game:GetService("InsertService"):LoadAsset(${assetId})`;
}

async function doUpload() {
  const key  = apiKeyInput.value.trim();
  const name = assetName.value.trim();
  const desc = assetDesc.value.trim();

  if (!key)  { showToast("API Key wajib diisi dulu"); return; }
  if (!selectedFile) { showToast("Pilih file .rbxm dulu"); return; }
  if (!name) { showToast("Nama asset wajib diisi"); return; }

  saveSessionKey(key);

  uploadBtn.disabled = true;
  uploadLabel.textContent = "Mengunggah...";

  showSection("statusCard");
  setStatus("Mengunggah file ke server...", "Mohon tunggu, jangan tutup tab ini.");

  const form = new FormData();
  form.append("apiKey", key);
  form.append("file", selectedFile, selectedFile.name);
  form.append("assetName", name);
  form.append("description", desc);

  let data;
  try {
    setStatus("Meneruskan ke Roblox Open Cloud...", "Proses ini bisa memakan 10–30 detik.");
    const res = await fetch("/api/upload", {
      method: "POST",
      body: form,
    });

    data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Terjadi kesalahan dari server.");
    }
  } catch (err) {
    showSection("errorCard");
    errorMsg.textContent = err.message || "Gagal terhubung ke server. Periksa koneksi internet.";
    resetUploadBtn();
    return;
  }

  if (!data.assetId) {
    showSection("errorCard");
    errorMsg.textContent = "Asset ID tidak diterima dari Roblox. Coba lagi.";
    resetUploadBtn();
    return;
  }

  fillResult(data.assetId);
  showSection("resultCard");
  resetUploadBtn();
}

function resetUploadBtn() {
  uploadLabel.textContent = "Upload ke Roblox";
  checkReady();
}

function resetAll() {
  clearFile();
  assetName.value = "";
  assetDesc.value = "";
  showSection(null);
  checkReady();
}

loadSessionKey();
checkReady();

toggleKey.addEventListener("click", () => {
  const isHidden = apiKeyInput.type === "password";
  apiKeyInput.type = isHidden ? "text" : "password";
});

apiKeyInput.addEventListener("input", () => {
  saveSessionKey(apiKeyInput.value.trim());
  checkReady();
});

assetName.addEventListener("input", checkReady);

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) setFile(fileInput.files[0]);
});

removeFile.addEventListener("click", clearFile);

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragging");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragging");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragging");
  const file = e.dataTransfer.files[0];
  if (file) setFile(file);
});

uploadBtn.addEventListener("click", doUpload);

resetBtn.addEventListener("click", resetAll);
retryBtn.addEventListener("click", () => {
  showSection(null);
  checkReady();
});

document.querySelectorAll(".btn-copy").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const targetId = btn.dataset.target;
    const text = $(targetId)?.textContent || "";
    const ok = await copyText(text);
    if (ok) {
      btn.classList.add("copied");
      showToast("Disalin ke clipboard!", "green");
      setTimeout(() => btn.classList.remove("copied"), 1800);
    } else {
      showToast("Gagal menyalin — salin manual ya");
    }
  });
});
