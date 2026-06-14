import { Router, Request, Response } from "express";
import { db, trades, botSignals } from "@lib/db";
import { eq, desc, and, gte } from "drizzle-orm";
import { getScalpingSignal } from "../../lib/trading-ai";
import AutonomousBot from "../../lib/autonomous-bot";

const router = Router();

// Global bot instance
let botInstance: AutonomousBot | null = null;

interface TradingSignalRequest {
  symbol: string;
  timeframe: string;
  bid: number;
  ask: number;
  spread: number;
  rsi: number;
  trend: string;
  volatility: number;
  session: string;
  todayTradeCount: number;
}

interface TradeCreateRequest {
  symbol: string;
  direction: "BUY" | "SELL";
  entryPrice: number;
  lotSize: number;
  stopLoss: number;
  takeProfit: number;
  stopLossPips: number;
  takeProfitPips: number;
  confidence: number;
  reasoning: string;
  riskRewardRatio: number;
  mtTicket?: string;
  oandaTradeId?: string;
}

interface TradeCloseRequest {
  closePrice: number;
  closeReason: string;
}

// POST /trading/signal - Generate trading signal
router.post("/signal", async (req: Request, res: Response): Promise<void> => {
  try {
    const input: TradingSignalRequest = req.body;

    // Validate required fields
    const requiredFields = [
      "symbol",
      "timeframe",
      "bid",
      "ask",
      "spread",
      "rsi",
      "trend",
      "volatility",
      "session",
      "todayTradeCount",
    ];

    for (const field of requiredFields) {
      if (
        input[field as keyof TradingSignalRequest] === undefined
      ) {
        res.status(400).json({ error: `Missing required field: ${field}` });
        return;
      }
    }

    // Get AI signal
    const signal = await getScalpingSignal({
      symbol: input.symbol,
      timeframe: input.timeframe,
      bid: input.bid,
      ask: input.ask,
      spread: input.spread,
      rsi: input.rsi,
      trend: input.trend,
      volatility: input.volatility,
      session: input.session,
      todayTradeCount: input.todayTradeCount,
    });

    // Save signal to database
    const savedSignal = await db
      .insert(botSignals)
      .values({
        symbol: input.symbol,
        timeframe: input.timeframe,
        action: signal.action,
        confidence: signal.confidence,
        reasoning: signal.reasoning,
        stopLossPips: signal.stopLossPips.toString(),
        takeProfitPips: signal.takeProfitPips.toString(),
        lotSize: signal.lotSize.toString(),
        riskRewardRatio: signal.riskRewardRatio.toString(),
        rsi: input.rsi,
        spread: input.spread.toString(),
        session: input.session,
        trend: input.trend,
        volatility: input.volatility,
      })
      .returning();

    res.status(200).json({
      signal,
      savedSignal: savedSignal[0],
    });
  } catch (error) {
    console.error("❌ Error generating signal:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

// GET /trading/trades - Get all trades
router.get("/trades", async (_req: Request, res: Response): Promise<void> => {
  try {
    const allTrades = await db
      .select()
      .from(trades)
      .orderBy(desc(trades.openedAt));

    res.status(200).json(allTrades);
  } catch (error) {
    console.error("❌ Error fetching trades:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

// POST /trading/trades - Create new trade
router.post(
  "/trades",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tradeData: TradeCreateRequest = req.body;

      // Validate required fields
      const requiredFields = [
        "symbol",
        "direction",
        "entryPrice",
        "lotSize",
        "stopLoss",
        "takeProfit",
      ];

      for (const field of requiredFields) {
        if (
          tradeData[field as keyof TradeCreateRequest] === undefined
        ) {
          res
            .status(400)
            .json({ error: `Missing required field: ${field}` });
          return;
        }
      }

      // Create trade
      const newTrade = await db
        .insert(trades)
        .values({
          symbol: tradeData.symbol,
          direction: tradeData.direction,
          entryPrice: tradeData.entryPrice.toString(),
          lotSize: tradeData.lotSize.toString(),
          stopLoss: tradeData.stopLoss.toString(),
          takeProfit: tradeData.takeProfit.toString(),
          stopLossPips: tradeData.stopLossPips.toString(),
          takeProfitPips: tradeData.takeProfitPips.toString(),
          confidence: tradeData.confidence,
          reasoning: tradeData.reasoning,
          riskRewardRatio: tradeData.riskRewardRatio.toString(),
          mtTicket: tradeData.mtTicket,
          oandaTradeId: tradeData.oandaTradeId,
          status: "open",
          profitLoss: "0",
          profitLossPips: "0",
        })
        .returning();

      res.status(201).json(newTrade[0]);
    } catch (error) {
      console.error("❌ Error creating trade:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }
);

// GET /trading/trades/:id - Get specific trade
router.get(
  "/trades/:id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const trade = await db
        .select()
        .from(trades)
        .where(eq(trades.id, id))
        .limit(1);

      if (trade.length === 0) {
        res.status(404).json({ error: "Trade not found" });
        return;
      }

      res.status(200).json(trade[0]);
    } catch (error) {
      console.error("❌ Error fetching trade:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }
);

// POST /trading/trades/:id/close - Close trade
router.post(
  "/trades/:id/close",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { closePrice, closeReason }: TradeCloseRequest = req.body;

      if (!closePrice || !closeReason) {
        res
          .status(400)
          .json({
            error: "Missing required fields: closePrice, closeReason",
          });
        return;
      }

      // Get trade
      const tradeData = await db
        .select()
        .from(trades)
        .where(eq(trades.id, id))
        .limit(1);

      if (tradeData.length === 0) {
        res.status(404).json({ error: "Trade not found" });
        return;
      }

      const trade = tradeData[0];
      const entryPrice = parseFloat(trade.entryPrice);
      const profitLoss = (closePrice - entryPrice) * parseFloat(trade.lotSize);

      // Calculate pips
      const pipsValue = closePrice - entryPrice;
      const profitLossPips =
        trade.direction === "BUY"
          ? Math.round(pipsValue * 10000) / 10
          : Math.round((entryPrice - closePrice) * 10000) / 10;

      // Update trade
      const updatedTrade = await db
        .update(trades)
        .set({
          closePrice: closePrice.toString(),
          profitLoss: profitLoss.toString(),
          profitLossPips: profitLossPips.toString(),
          closeReason: closeReason,
          status: "closed",
          closedAt: new Date(),
        })
        .where(eq(trades.id, id))
        .returning();

      res.status(200).json(updatedTrade[0]);
    } catch (error) {
      console.error("❌ Error closing trade:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }
);

// GET /bot/status - Bot health and status
router.get("/status", async (_req: Request, res: Response): Promise<void> => {
  try {
    // Get today's trades
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayTrades = await db
      .select()
      .from(trades)
      .where(gte(trades.openedAt, today));

    const openTrades = await db
      .select()
      .from(trades)
      .where(eq(trades.status, "open"));

    const closedTrades = await db
      .select()
      .from(trades)
      .where(and(eq(trades.status, "closed"), gte(trades.openedAt, today)));

    // Calculate win rate and profit
    let winCount = 0;
    let lossCount = 0;
    let totalProfit = 0;

    for (const trade of closedTrades) {
      const pl = parseFloat(trade.profitLoss || "0");
      totalProfit += pl;
      if (pl > 0) {
        winCount++;
      } else if (pl < 0) {
        lossCount++;
      }
    }

    const winRate =
      closedTrades.length > 0
        ? Math.round((winCount / closedTrades.length) * 100)
        : 0;

    res.status(200).json({
      status: "operational",
      timestamp: new Date().toISOString(),
      bot: {
        running: botInstance?.isActive() ?? false,
      },
      stats: {
        totalTrades: todayTrades.length,
        openTrades: openTrades.length,
        closedTrades: closedTrades.length,
        winCount,
        lossCount,
        winRate: `${winRate}%`,
        totalProfit: Math.round(totalProfit * 100) / 100,
      },
      database: "connected",
      ai: "operational",
    });
  } catch (error) {
    console.error("❌ Error getting bot status:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

// POST /bot/start - Start autonomous bot
router.post("/bot/start", async (_req: Request, res: Response): Promise<void> => {
  try {
    if (botInstance && botInstance.isActive()) {
      res.status(400).json({ error: "Bot is already running" });
      return;
    }

    botInstance = new AutonomousBot();
    await botInstance.start();

    res.status(200).json({ message: "Bot started successfully" });
  } catch (error) {
    console.error("❌ Error starting bot:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

// POST /bot/stop - Stop autonomous bot
router.post("/bot/stop", (_req: Request, res: Response): void => {
  try {
    if (!botInstance || !botInstance.isActive()) {
      res.status(400).json({ error: "Bot is not running" });
      return;
    }

    botInstance.stop();
    botInstance = null;

    res.status(200).json({ message: "Bot stopped successfully" });
  } catch (error) {
    console.error("❌ Error stopping bot:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

export default router;
export { botInstance };
