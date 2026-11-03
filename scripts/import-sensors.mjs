import fs from "node:fs/promises";
import { MongoClient } from "mongodb";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Set MONGODB_URI before importing sensor data.");
const file = process.argv[2] || "data/PARKING_SENSOR_DATA.json";
const docs = JSON.parse(await fs.readFile(file, "utf8"));
if (!Array.isArray(docs)) throw new Error("Sensor fixture must contain a JSON array.");
const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DATABASE || "parkwise");
  const collection = db.collection(process.env.MONGODB_COLLECTION || "PARKING_SENSOR_DATA");
  if (docs.length) {
    const readings = docs.map((doc) => ({ ...doc, timestamp: new Date(doc.timestamp) }));
    await collection.bulkWrite(readings.map((reading) => ({
      updateOne: {
        filter: { sensor_id: reading.sensor_id, timestamp: reading.timestamp },
        update: { $set: reading },
        upsert: true,
      },
    })));
  }
  console.log(`Imported ${docs.length} sensor readings into ${collection.collectionName}.`);
} finally {
  await client.close();
}
