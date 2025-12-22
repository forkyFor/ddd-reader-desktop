import fs from "fs/promises";

export type TachogramUploadStatus = {
  status?: string;
  id?: number;
  upload_id?: number;
  cardNumber?: string;
  driver?: any;
  queue?: number;
  estimate?: number;
  error?: any;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Optional integration with Tachogram/Tachoweb APIs.
 *
 * Docs (example instance): POST {BASE_URL}/upload with apiKey, filename, filedata (base64),
 * then poll POST {BASE_URL}/upload/status with apiKey and upload_id.
 */
export async function tachogramUploadAndWait(opts: {
  baseUrl: string;
  apiKey: string;
  filePath: string;
  timeoutMs?: number;
}): Promise<{ upload?: any; status?: TachogramUploadStatus }> {
  const { baseUrl, apiKey, filePath } = opts;
  const timeoutMs = Math.max(5000, Number(opts.timeoutMs ?? 30000));

  const buf = await fs.readFile(filePath);
  const filename = filePath.split(/[\\/]/).slice(-1)[0];
  const filedata = buf.toString("base64");

  const uploadRes = await fetch(`${baseUrl.replace(/\/$/, "")}/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, filename, filedata }),
  });
  const upload = await uploadRes.json().catch(() => ({}));
  const uploadId: number | undefined = upload?.id ?? upload?.upload_id;

  if (!uploadId) {
    return { upload, status: { status: "error", error: upload?.error ?? "No upload id returned" } };
  }

  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const stRes = await fetch(`${baseUrl.replace(/\/$/, "")}/upload/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey, upload_id: uploadId }),
    });
    const status = (await stRes.json().catch(() => ({}))) as TachogramUploadStatus;
    if (status?.status === "finished" || status?.status === "failed" || status?.status === "error") {
      return { upload, status };
    }
    await sleep(700);
  }

  return { upload, status: { status: "timeout", upload_id: uploadId } };
}
