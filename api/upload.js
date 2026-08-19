import { IncomingForm } from "formidable";
import { readFileSync } from "fs";

export const config = {
  api: {
    bodyParser: false,
  },
};

const ROBLOX_ASSET_URL = "https://apis.roblox.com/assets/v1/assets";
const ROBLOX_OP_URL    = "https://apis.roblox.com/assets/v1/operations";
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_TRIES   = 20;

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({
      uploadDir: "/tmp",
      keepExtensions: true,
      maxFileSize: 20 * 1024 * 1024,
      multiples: false,
    });
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}

function buildMultipart(boundary, metaJson, fileBuffer, filename) {
  const CRLF = "\r\n";
  const enc  = new TextEncoder();

  const metaPart = Buffer.concat([
    Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="request"${CRLF}` +
      `Content-Type: application/json${CRLF}` +
      CRLF +
      metaJson +
      CRLF,
      "utf-8"
    ),
  ]);

  const fileHeader = Buffer.from(
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="fileContent"; filename="${filename}"${CRLF}` +
    `Content-Type: application/octet-stream${CRLF}` +
    CRLF,
    "utf-8"
  );

  const fileFooter = Buffer.from(
    CRLF + `--${boundary}--` + CRLF,
    "utf-8"
  );

  return Buffer.concat([metaPart, fileHeader, fileBuffer, fileFooter]);
}

async function pollOperation(operationId, apiKey) {
  for (let i = 0; i < POLL_MAX_TRIES; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const res = await fetch(`${ROBLOX_OP_URL}/${operationId}`, {
      headers: { "x-api-key": apiKey },
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Polling gagal (${res.status}): ${t}`);
    }

    const json = await res.json();

    if (json.done) {
      if (json.error) {
        throw new Error(
          `Roblox error: ${json.error.message || JSON.stringify(json.error)}`
        );
      }
      const id =
        json.response?.assetId ||
        json.response?.Id       ||
        json.response?.id;
      if (!id) throw new Error("Asset ID tidak ada di response Roblox.");
      return String(id);
    }
  }
  throw new Error("Timeout — Roblox terlalu lama memproses. Coba lagi.");
}

export default async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method tidak diizinkan." });

  let fields, files;
  try {
    ({ fields, files } = await parseForm(req));
  } catch (err) {
    return res.status(400).json({ error: "Gagal membaca form: " + err.message });
  }

  const pick = (v) => (Array.isArray(v) ? v[0] : v);

  const apiKey    = pick(fields.apiKey);
  const assetName = pick(fields.assetName);
  const desc      = pick(fields.description) || "";
  const fileArr   = files.file;
  const file      = Array.isArray(fileArr) ? fileArr[0] : fileArr;

  if (!apiKey?.trim())
    return res.status(400).json({ error: "API Key wajib diisi." });
  if (!assetName?.trim())
    return res.status(400).json({ error: "Nama asset wajib diisi." });
  if (!file)
    return res.status(400).json({ error: "File .rbxm wajib dipilih." });

  const origName =
    file.originalFilename || file.newFilename || file.name || "model.rbxm";
  const ext = origName.split(".").pop().toLowerCase();
  if (!["rbxm", "rbxmx"].includes(ext))
    return res.status(400).json({ error: "File harus berformat .rbxm atau .rbxmx." });

  const filePath = file.filepath || file.path;
  if (!filePath)
    return res.status(500).json({ error: "Path file tidak ditemukan di server." });

  let fileBuffer;
  try {
    fileBuffer = readFileSync(filePath);
  } catch (err) {
    return res.status(500).json({ error: "Gagal membaca file: " + err.message });
  }

  if (!fileBuffer || fileBuffer.length === 0)
    return res.status(400).json({ error: "File kosong atau tidak terbaca." });

  const metaJson = JSON.stringify({
    assetType: "Model",
    displayName: assetName.trim(),
    description: desc.trim(),
    creationContext: { creator: {} },
  });

  const boundary = "----RBXMBoundary" + Date.now().toString(16);
  const body     = buildMultipart(boundary, metaJson, fileBuffer, origName);

  let uploadRes;
  try {
    uploadRes = await fetch(ROBLOX_ASSET_URL, {
      method: "POST",
      headers: {
        "x-api-key":    apiKey.trim(),
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": String(body.length),
      },
      body,
    });
  } catch (err) {
    return res.status(502).json({ error: "Gagal terhubung ke Roblox: " + err.message });
  }

  const uploadText = await uploadRes.text();

  if (!uploadRes.ok) {
    let msg = uploadText;
    try {
      const p = JSON.parse(uploadText);
      msg = p.message || p.error || uploadText;
    } catch {}
    return res.status(uploadRes.status).json({ error: "Roblox menolak upload: " + msg });
  }

  let uploadJson;
  try {
    uploadJson = JSON.parse(uploadText);
  } catch {
    return res.status(502).json({ error: "Response Roblox tidak valid JSON." });
  }

  const operationId =
    uploadJson.operationId ||
    (uploadJson.path ? uploadJson.path.split("/").pop() : null);

  if (!operationId)
    return res.status(502).json({ error: "Operation ID tidak ditemukan dari Roblox." });

  let assetId;
  try {
    assetId = await pollOperation(operationId, apiKey.trim());
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  return res.status(200).json({ assetId });
}
