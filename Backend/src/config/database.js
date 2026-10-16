
const mongoose = require("mongoose");

async function connectToDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB Atlas");
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
  }
}

module.exports = connectToDB;
