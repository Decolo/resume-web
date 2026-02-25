/**
 * R2 file operations for resume uploads and PDF exports.
 * Keys are namespaced by session: `{sessionId}/{filename}`
 */

function key(sessionId: string, filename: string): string {
  return `${sessionId}/${filename}`;
}

export async function uploadFile(
  bucket: R2Bucket,
  sessionId: string,
  filename: string,
  content: ReadableStream | ArrayBuffer | string
): Promise<R2Object | null> {
  return bucket.put(key(sessionId, filename), content);
}

export async function downloadFile(
  bucket: R2Bucket,
  sessionId: string,
  filename: string
): Promise<ReadableStream | null> {
  const obj = await bucket.get(key(sessionId, filename));
  return obj?.body ?? null;
}

export async function listFiles(
  bucket: R2Bucket,
  sessionId: string
): Promise<string[]> {
  const listed = await bucket.list({ prefix: `${sessionId}/` });
  return listed.objects.map((o) => o.key.slice(sessionId.length + 1));
}

export async function deleteFile(
  bucket: R2Bucket,
  sessionId: string,
  filename: string
): Promise<void> {
  await bucket.delete(key(sessionId, filename));
}
