import * as fs from 'fs';
import * as path from 'path';
import * as Minio from 'minio';
import type { PrismaClient } from '@prisma/client';
import type { SeedPdfEntry } from './create-seed-pdfs';

const SEED_FILES_ROOT = path.join(__dirname, '..', 'seed-files');

const DOCUMENTS_BUCKET = 'erp-documents';
const DRAWINGS_BUCKET = 'erp-drawings';

/** Legacy DB keys → generated PDF file names on disk. */
const FILE_KEY_ALIASES: Record<string, string> = {
  'Contract Agreement.pdf': 'Contract-Agreement.pdf',
  'Site Safety Plan.pdf': 'Site-Safety-Plan.pdf',
  'Project Execution Plan.pdf': 'Project-Execution-Plan.pdf',
  'A-101-revC.pdf': 'Drawing-A-101-revC.pdf',
  'S-201-revB.pdf': 'Drawing-S-201-revB.pdf',
};

function guessContentType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

function bucketForKey(fileKey: string): string {
  if (fileKey.startsWith('drawings/')) {
    return DRAWINGS_BUCKET;
  }
  return DOCUMENTS_BUCKET;
}

function createMinioClient(): Minio.Client {
  return new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
    port: Number(process.env.MINIO_PORT ?? 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY ?? 'erp_minio',
    secretKey: process.env.MINIO_SECRET_KEY ?? 'erp_minio_dev_password',
    pathStyle: true,
     // Supabase S3 requires this path prefix
    transportAgent: undefined,
  });
}

async function ensureBucket(client: Minio.Client, bucket: string): Promise<void> {
  const exists = await client.bucketExists(bucket);
  if (!exists) {
    await client.makeBucket(bucket);
  }
}

/**
 * Resolves a storage fileKey to a local PDF path created by the seed scripts.
 */
export function resolveLocalSeedFilePath(
  fileKey: string,
  registry: Map<string, SeedPdfEntry>,
): string | null {
  const registered = registry.get(fileKey);
  if (registered && fs.existsSync(registered.absolutePath)) {
    return registered.absolutePath;
  }

  if (fs.existsSync(fileKey)) {
    return fileKey;
  }

  const demoMatch = fileKey.match(/^demo\/([^/]+)\/(.+)$/);
  if (demoMatch) {
    const [, projectCode, rawFileName] = demoMatch;
    const fileName = FILE_KEY_ALIASES[rawFileName] ?? rawFileName;
    const candidates = [
      path.join(SEED_FILES_ROOT, 'generated', projectCode, fileName),
      path.join(SEED_FILES_ROOT, 'generated', projectCode, 'attachments', fileName),
      path.join(SEED_FILES_ROOT, fileName),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  const drawingsMatch = fileKey.match(/^drawings\/([^/]+)\/(.+)$/);
  if (drawingsMatch) {
    const [, projectCode, rawFileName] = drawingsMatch;
    const mappedName = FILE_KEY_ALIASES[rawFileName] ?? rawFileName;
    const mappedKey = `demo/${projectCode}/${mappedName}`;
    return resolveLocalSeedFilePath(mappedKey, registry);
  }

  const baseName = path.basename(fileKey);
  const engineeringPath = path.join(SEED_FILES_ROOT, baseName);
  if (fs.existsSync(engineeringPath)) {
    return engineeringPath;
  }

  return null;
}

async function uploadFile(
  client: Minio.Client,
  bucket: string,
  key: string,
  localPath: string,
): Promise<void> {
  const buffer = fs.readFileSync(localPath);
  const contentType = guessContentType(path.basename(localPath));
  await client.putObject(bucket, key, buffer, buffer.length, {
    'Content-Type': contentType,
  });
}

/**
 * Uploads every file referenced in the PDF registry to MinIO.
 */
export async function uploadRegistryToMinio(
  registry: Map<string, SeedPdfEntry>,
): Promise<number> {
  const client = createMinioClient();
  let uploaded = 0;

  for (const bucket of [DOCUMENTS_BUCKET, DRAWINGS_BUCKET]) {
    await ensureBucket(client, bucket);
  }

  for (const [fileKey, entry] of registry.entries()) {
    if (!fileKey.startsWith('demo/') && !fileKey.startsWith('seed-files/')) {
      continue;
    }
    if (!fs.existsSync(entry.absolutePath)) {
      continue;
    }
    await uploadFile(client, DOCUMENTS_BUCKET, fileKey, entry.absolutePath);
    uploaded += 1;
  }

  return uploaded;
}

/**
 * Reads all file_key values from the DB and uploads matching local seed files to MinIO.
 */
export async function uploadDatabaseFileKeysToMinio(
  prisma: PrismaClient,
  registry: Map<string, SeedPdfEntry>,
): Promise<{ uploaded: number; missing: string[] }> {
  const client = createMinioClient();

  for (const bucket of [DOCUMENTS_BUCKET, DRAWINGS_BUCKET]) {
    await ensureBucket(client, bucket);
  }

  const [documents, versions, drawingVersions] = await Promise.all([
    prisma.document.findMany({ select: { fileKey: true } }),
    prisma.documentVersion.findMany({ select: { fileKey: true } }),
    prisma.drawingVersion.findMany({ select: { fileKey: true } }),
  ]);

  const keys = new Set<string>();
  for (const row of [...documents, ...versions, ...drawingVersions]) {
    if (row.fileKey && !row.fileKey.startsWith('pending/')) {
      keys.add(row.fileKey);
    }
  }

  let uploaded = 0;
  const missing: string[] = [];

  for (const fileKey of keys) {
    const localPath = resolveLocalSeedFilePath(fileKey, registry);
    if (!localPath) {
      missing.push(fileKey);
      continue;
    }
    const bucket = bucketForKey(fileKey);
    await uploadFile(client, bucket, fileKey, localPath);
    uploaded += 1;
  }

  return { uploaded, missing };
}

/**
 * Uploads all demo seed files to MinIO so download URLs resolve.
 */
export async function uploadAllSeedFilesToMinio(
  prisma: PrismaClient,
  registry: Map<string, SeedPdfEntry>,
): Promise<void> {
  try {
    const fromRegistry = await uploadRegistryToMinio(registry);
    const { uploaded, missing } = await uploadDatabaseFileKeysToMinio(prisma, registry);
    console.log(`✓ Uploaded ${fromRegistry} registry + ${uploaded} DB-referenced files to MinIO`);

    if (missing.length > 0) {
      console.warn(`⚠ ${missing.length} file_key(s) have no local seed file:`);
      for (const key of missing.slice(0, 10)) {
        console.warn(`    - ${key}`);
      }
      if (missing.length > 10) {
        console.warn(`    ... and ${missing.length - 10} more`);
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      '⚠ MinIO upload failed, downloads will not work until MinIO is running (npm run db:up):',
      message,
    );
  }
}
