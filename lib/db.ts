import mysql, { type Pool } from "mysql2/promise";
import { MongoClient, type Db } from "mongodb";

let mysqlPool: Pool | undefined;
let mongoClient: MongoClient | undefined;
let mongoDb: Db | undefined;

export function getSqlPool() {
  if (!process.env.MYSQL_HOST || !process.env.MYSQL_DATABASE || !process.env.MYSQL_USER) {
    throw new Error("MySQL is not configured. Add MYSQL_HOST, MYSQL_USER, and MYSQL_DATABASE to .env.local.");
  }
  if (!mysqlPool) {
    mysqlPool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD || "",
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      dateStrings: true,
      timezone: "Z",
    });
  }
  return mysqlPool;
}

export async function getMongoDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;
  if (!mongoDb) {
    mongoClient = new MongoClient(uri, { serverSelectionTimeoutMS: 3500 });
    await mongoClient.connect();
    mongoDb = mongoClient.db(process.env.MONGODB_DATABASE || "parkwise");
  }
  return mongoDb;
}

export function sensorCollectionName() {
  return process.env.MONGODB_COLLECTION || "PARKING_SENSOR_DATA";
}
