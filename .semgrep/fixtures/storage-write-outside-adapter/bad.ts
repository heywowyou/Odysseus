import { AwsClient } from 'aws4fetch';

// ruleid: storage-write-outside-adapter
export async function publishReportDirectly(html: string, objectKey: string): Promise<void> {
  const client = new AwsClient({ accessKeyId: 'x', secretAccessKey: 'y' });
  await client.fetch(`https://bucket.example/${objectKey}`, { method: 'PUT', body: html });
}
