import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const outputDirectory = process.env.STAGING_BACKUP_OUTPUT_DIR;

if (!projectUrl || !serviceRoleKey || !outputDirectory) {
  throw new Error("staging_storage_backup_inputs_missing");
}

const backupRoot = path.resolve(outputDirectory);
const storageRoot = path.join(backupRoot, "objects");
const supabase = createClient(projectUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function backupPath(bucketName, objectName) {
  const target = path.resolve(storageRoot, bucketName, objectName);
  const allowedRoot = `${storageRoot}${path.sep}`;

  if (!target.startsWith(allowedRoot)) {
    throw new Error("staging_storage_backup_path_invalid");
  }

  return target;
}

async function listAllFiles(bucketName, prefix = "") {
  const files = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase.storage.from(bucketName).list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error || !data) {
      throw new Error("staging_storage_backup_list_failed");
    }

    for (const entry of data) {
      if (entry.metadata) {
        files.push({
          path: `${prefix}${entry.name}`,
          metadata: entry.metadata,
        });
        continue;
      }

      files.push(...(await listAllFiles(bucketName, `${prefix}${entry.name}/`)));
    }

    if (data.length < 1000) {
      return files;
    }

    offset += data.length;
  }
}

async function main() {
  await mkdir(storageRoot, { recursive: true });

  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
  if (bucketError || !buckets) {
    throw new Error("staging_storage_backup_buckets_failed");
  }

  const inventory = [];
  let totalBytes = 0;

  for (const bucket of buckets) {
    const files = await listAllFiles(bucket.name);

    for (const file of files) {
      const { data, error } = await supabase.storage.from(bucket.name).download(file.path);
      if (error || !data) {
        throw new Error("staging_storage_backup_download_failed");
      }

      const bytes = Buffer.from(await data.arrayBuffer());
      const destination = backupPath(bucket.name, file.path);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, bytes, { flag: "wx" });

      const sha256 = createHash("sha256").update(bytes).digest("hex");
      inventory.push({
        bucket: bucket.name,
        path: file.path,
        bytes: bytes.length,
        sha256,
        metadata: file.metadata,
      });
      totalBytes += bytes.length;
    }
  }

  await writeFile(
    path.join(backupRoot, "storage-object-inventory.json"),
    `${JSON.stringify(
      {
        generatedAtUtc: new Date().toISOString(),
        buckets: buckets.map((bucket) => ({
          id: bucket.id,
          name: bucket.name,
          public: bucket.public,
          fileSizeLimit: bucket.file_size_limit,
          allowedMimeTypes: bucket.allowed_mime_types,
        })),
        objects: inventory,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  process.stdout.write(
    `${JSON.stringify({
      status: "PASS",
      bucketCount: buckets.length,
      objectCount: inventory.length,
      byteCount: totalBytes,
    })}\n`,
  );
}

main().catch(() => {
  process.stderr.write("staging_storage_backup_failed\n");
  process.exit(1);
});
