export const config = {
  api: {
    bodyParser: false,
  },
};

const ROBLOX_ASSET_URL = "https://apis.roblox.com/assets/v1/assets";
const ROBLOX_OP_URL = "https://apis.roblox.com/assets/v1/operations";
const POLL_INTERVAL_MS = 2500;
const POLL_MAX_ATTEMPTS = 20;

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseMultipart(buffer, boundary) {
  const boundaryBuf = Buffer.from("--" + boundary);
  const parts = [];
  let start = 0;

  while (start < buffer.length) {
    const boundaryIdx = buffer.indexOf(boundaryBuf, start);
    if (boundaryIdx === -1) break;

    const headerStart = boundaryIdx + boundaryBuf.length + 2;
    const headerEnd = buffer.indexOf(Buffer.from("\r\n\r\n"), headerStart);
    if (headerEnd === -1) break;

    const headerStr = buffer.slice(headerStart, headerEnd).toString();
    const dataStart = headerEnd + 4;

    const nextBoundary = buffer.indexOf(boundaryBuf, dataStart);
    const dataEnd = nextBoundary === -1 ? buffer.length : nextBoundary - 2;

    const data = buffer.slice(dataStart, dataEnd);

    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const filenameMatch = headerStr.match(/filename="([^"]+)"/);
    const ctMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);

    if (nameMatch) {
      parts.push({
        name: nameMatch[1],
        filename: filenameMatch ? filenameMatch[1] : null,
        contentType: ctMatch ? ctMatch[1].trim() : "text/plain",
        data,
      });
    }

    start = nextBoundary === -1 ? buffer.length : nextBoundary;
  }

  return parts;
}

async function pollOperation(operationId, apiKey) {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const res = await fetch(`${ROBLOX_OP_URL}/${operationId}`, {
      headers: { "x-api-key": apiKey },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Polling error ${res.status}: ${text}`);
    }

    const json = await res.json();

    if (json.done) {
      if (json.error) {
        throw new Error(`Roblox error: ${json.error.message || JSON.stringify(json.error)}`);
      }
      const assetId = json.response?.assetId || json.response?.Id;
      if (!assetId) {
        throw new Error("Asset ID tidak ditemukan dalam response Roblox.");
      }
      return String(assetId);
    }
  }

  throw new Error("Upload timeout — Roblox terlalu lama memproses. Coba lagi.");
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method tidak diizinkan." });
  }

  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(.+)/);

  if (!boundaryMatch) {
    return res.status(400).json({ error: "Content-Type tidak valid. Harus multipart/form-data." });
  }

  const boundary = boundaryMatch[1].trim();

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch {
    return res.status(500).json({ error: "Gagal membaca request body." });
  }

  let parts;
  try {
    parts = parseMultipart(rawBody, boundary);
  } catch {
    return res.status(400).json({ error: "Gagal mem-parse multipart form." });
  }

  const get = (name) => parts.find((p) => p.name === name);

  const apiKeyPart = get("apiKey");
  const filePart = get("file");
  const namePart = get("assetName");
  const descPart = get("description");

  if (!apiKeyPart || !apiKeyPart.data.length) {
    return res.status(400).json({ error: "API Key wajib diisi." });
  }
  if (!filePart || !filePart.data.length) {
    return res.status(400).json({ error: "File .rbxm wajib dipilih." });
  }
  if (!namePart || !namePart.data.length) {
    return res.status(400).json({ error: "Nama asset wajib diisi." });
  }

  const apiKey = apiKeyPart.data.toString().trim();
  const assetName = namePart.data.toString().trim();
  const description = descPart ? descPart.data.toString().trim() : "";
  const filename = filePart.filename || "model.rbxm";

  const ext = filename.split(".").pop().toLowerCase();
  if (!["rbxm", "rbxmx"].includes(ext)) {
    return res.status(400).json({ error: "File harus berformat .rbxm atau .rbxmx." });
  }

  const MAX_SIZE = 20 * 1024 * 1024;
  if (filePart.data.length > MAX_SIZE) {
    return res.status(400).json({ error: "File terlalu besar. Maksimal 20MB." });
  }

  const requestMeta = JSON.stringify({
    assetType: "Model",
    displayName: assetName,
    description: description,
    creationContext: { creator: { userId: null } },
  });

  const formData = new FormData();
  formData.append("request", new Blob([requestMeta], { type: "application/json" }));
  formData.append(
    "fileContent",
    new Blob([filePart.data], { type: "application/octet-stream" }),
    filename
  );

  let uploadRes;
  try {
    uploadRes = await fetch(ROBLOX_ASSET_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey },
      body: formData,
    });
  } catch (err) {
    return res.status(502).json({ error: `Gagal terhubung ke Roblox: ${err.message}` });
  }

  const uploadText = await uploadRes.text();

  if (!uploadRes.ok) {
    let msg = uploadText;
    try {
      const parsed = JSON.parse(uploadText);
      msg = parsed.message || parsed.error || uploadText;
    } catch {}
    return res.status(uploadRes.status).json({ error: `Roblox menolak upload: ${msg}` });
  }

  let uploadJson;
  try {
    uploadJson = JSON.parse(uploadText);
  } catch {
    return res.status(502).json({ error: "Response Roblox tidak valid." });
  }

  const operationId = uploadJson.operationId || uploadJson.path?.split("/").pop();
  if (!operationId) {
    return res.status(502).json({ error: "Operation ID tidak ditemukan dari Roblox." });
  }

  let assetId;
  try {
    assetId = await pollOperation(operationId, apiKey);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  return res.status(200).json({ assetId });
}
