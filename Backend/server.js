require("dotenv").config();
const app = require("./src/app")
const connectToDB = require("./src/config/database");

const PORT = process.env.PORT || 3000;

/*
    Boot the HTTP server only after MongoDB is connected.
    Serving APIs without a working DB would cause every request to
    hang or 500 with confusing errors.
*/
(async () => {
    await connectToDB();
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`)
    })
})();
