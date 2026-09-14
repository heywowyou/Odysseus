import { getConfiguredPreviewPublisher } from './configured-preview-publisher.js';

// ok: storage-write-outside-adapter
export async function publishReport(html: string, objectKey: string): Promise<void> {
  const publisher = getConfiguredPreviewPublisher();
  await publisher.put({ objectKey, html, publicExpiresAt: null });
}
