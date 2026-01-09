// ============================================================================
// app.js - Azure Blob Storage Test Application (SAS + AccountKey SAFE)
// ============================================================================

const { BlobServiceClient } = require("@azure/storage-blob");

// ============================================================================
// CONFIG
// ============================================================================

const CONFIG = {
  CONTAINER_NAME: process.env.AZURE_STORAGE_CONTAINER || "streakjs-internal",
  CONNECTION_STRING: process.env.AZURE_STORAGE_CONNECTION_STRING,
};

// ============================================================================
// HELPERS
// ============================================================================

function generateFileName() {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`;
}

function generateFileContent() {
  return `
AZURE BLOB STORAGE TEST
======================
Time        : ${new Date().toISOString()}
Platform    : ${process.platform}
Node        : ${process.version}
PID         : ${process.pid}
`.trim();
}

// ============================================================================
// BLOB CLIENT
// ============================================================================

function createBlobServiceClient() {
  if (!CONFIG.CONNECTION_STRING) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set");
  }

  console.log("🔑 Using provided connection string");
  return BlobServiceClient.fromConnectionString(CONFIG.CONNECTION_STRING);
}

async function ensureContainerExists(blobServiceClient) {
  const containerClient = blobServiceClient.getContainerClient(
    CONFIG.CONTAINER_NAME
  );

  console.log(`📦 Checking container: ${CONFIG.CONTAINER_NAME}`);

  const exists = await containerClient.exists();
  if (!exists) {
    console.log("📦 Creating container");
    await containerClient.create(); // PRIVATE container
    console.log("✅ Container created");
  } else {
    console.log("✅ Container exists");
  }

  return containerClient;
}

async function uploadFile(containerClient, fileName, content) {
  console.log(`📤 Uploading: ${fileName}`);

  const blockBlobClient = containerClient.getBlockBlobClient(fileName);

  await blockBlobClient.uploadData(Buffer.from(content, "utf8"), {
    blobHTTPHeaders: {
      blobContentType: "text/plain",
    },
  });

  console.log("✅ Upload complete");
  console.log(`🔗 ${blockBlobClient.url}`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log("\n🚀 Blob Storage Test Started\n");

  try {
    const blobServiceClient = createBlobServiceClient();
    const containerClient = await ensureContainerExists(blobServiceClient);

    const fileName = generateFileName();
    const content = generateFileContent();

    await uploadFile(containerClient, fileName, content);

    console.log("\n✅ TEST SUCCESS");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ TEST FAILED");
    console.error(err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

// ============================================================================
// ENTRY
// ============================================================================

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

main();
