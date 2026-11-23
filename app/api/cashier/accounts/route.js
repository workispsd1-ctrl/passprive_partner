import { NextResponse } from "next/server";
import { resolveCashierRestaurant } from "../_shared";
import { accountDetail, createAccount, listAccounts, printStatement, settleAccount, updateAccount } from "@/lib/server/customerAccounts";
import { activePrinters, mainPrinter } from "@/lib/server/printJobs";

const TILL_SETTLE = ["CASH", "JUICE", "CHEQUE", "BANK", "AVOIR"];

async function context(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!token) return { error: NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 }) };
  const ctx = await resolveCashierRestaurant(token);
  if (ctx.error) return { error: NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status }) };
  if (ctx.isWaiter) return { error: NextResponse.json({ ok: false, error: "Customer accounts are managed by the cashier." }, { status: 403 }) };
  return { ctx };
}

export async function GET(request) {
  try {
    const { ctx, error } = await context(request);
    if (error) return error;
    const params = new URL(request.url).searchParams;
    const { status, body } = await listAccounts(ctx.admin, ctx.restaurantId, { q: params.get("q") || "", all: params.get("all") === "1" });
    return NextResponse.json(body, { status });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { ctx, error } = await context(request);
    if (error) return error;
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "");
    let out;
    if (action === "create") out = await createAccount(ctx.admin, ctx.restaurantId, ctx.userId, body);
    else if (action === "update") out = await updateAccount(ctx.admin, ctx.restaurantId, body);
    else if (action === "detail") out = await accountDetail(ctx.admin, ctx.restaurantId, body?.id);
    else if (action === "settle") out = await settleAccount(ctx.admin, ctx.restaurantId, ctx.userId, body, { allowed: TILL_SETTLE });
    else if (action === "statement") {
      out = mainPrinter(await activePrinters(ctx.admin, ctx.restaurantId))
        ? await printStatement(ctx.admin, ctx.restaurantId, body?.id)
        : { status: 409, body: { ok: false, error: "No main printer is set up. On the partner dashboard, tick Customer receipts & bills on a printer." } };
    }
    else out = { status: 400, body: { ok: false, error: "Unknown action" } };
    return NextResponse.json(out.body, { status: out.status });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
