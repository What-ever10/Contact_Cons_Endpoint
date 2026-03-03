import { Router, Request, Response } from "express";
import { identifyService } from "./identify_service";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  try {
    const result = await identifyService(req.body);
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal Server Error",
    });
  }
});

router.get("/", (req, res) => {
  res
    .status(200)
    .send("This endpoint accepts only POST requests with JSON body.");
});

export default router;