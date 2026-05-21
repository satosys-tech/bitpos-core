import { Router } from "express";
import healthRouter from "./health.js";
import priceRouter from "./price.js";
import setupRouter from "./setup.js";
import authRouter from "./auth.js";
import accountsRouter from "./accounts.js";
import cardsRouter from "./cards.js";
import shopRouter from "./shop.js";
import provisionRouter from "./provision.js";
import wipeRouter from "./wipe.js";

const router = Router();

router.use(healthRouter);
router.use(priceRouter);
router.use(setupRouter);
router.use(authRouter);
router.use(accountsRouter);
router.use(cardsRouter);
router.use(shopRouter);
router.use(provisionRouter);
router.use(wipeRouter);

export default router;
