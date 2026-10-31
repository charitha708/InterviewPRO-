
const mongoose = require("mongoose");

async function connectToDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      // Hosting platforms (e.g. Render free tier) put idle instances to
      // sleep, and Atlas closes idle sockets - these options make the
      // driver reconnect transparently instead of erroring on the first
      // request after a wake-up.
      serverSelectionTimeoutMS: 30000,
      maxIdleTimeMS: 60000,
      heartbeatFrequencyMS: 10000,
    });
    console.log("Connected to MongoDB Atlas");
  } catch (err) {
    // Fail fast: without a DB connection the API is useless.
    // Atlas note: if this fails with a timeout, check that your
    // current IP is whitelisted in the Atlas Network Access settings.
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  }
}

module.exports = connectToDB;
