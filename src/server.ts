import express from "express";
import dotenv from "dotenv";
import identifyRouter from "./identify_router";

dotenv.config();

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).send(
    "This service is running send POST requests at /identify with JSON"
  );
});

app.use("/identify", identifyRouter);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});