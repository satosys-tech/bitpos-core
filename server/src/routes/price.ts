import { Router, type IRouter } from "express";
import { getBtcPrice } from "../lib/price.js";

const router: IRouter = Router();

router.get("/price", async (_req, res): Promise<void> => {
  const price = await getBtcPrice();
  res.json(price);
});

export default router;
