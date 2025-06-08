import Account from "@/lib/account";
import { syncEmailsToDatabase } from "@/lib/sync-to-db";
import { db } from "@/server/db";
import { type NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

export const POST = async (req: NextRequest) => {
  try {
    // Parse JSON safely
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
    }

    const { accountId, userId } = body;

    // Validate required fields
    if (typeof accountId !== "string" || !accountId.trim()) {
      return NextResponse.json({ error: "MISSING_OR_INVALID_ACCOUNT_ID" }, { status: 400 });
    }
    if (typeof userId !== "string" || !userId.trim()) {
      return NextResponse.json({ error: "MISSING_OR_INVALID_USER_ID" }, { status: 400 });
    }

    // Find the account with both id and userId filters
    const dbAccount = await db.account.findFirst({
      where: {
        id: accountId,
        userId,
      },
    });

    if (!dbAccount) {
      return NextResponse.json({ error: "ACCOUNT_NOT_FOUND" }, { status: 404 });
    }

    // Instantiate Account with token safely
    if (!dbAccount.token || typeof dbAccount.token !== "string") {
      return NextResponse.json({ error: "INVALID_ACCOUNT_TOKEN" }, { status: 500 });
    }
    const account = new Account(dbAccount.token);

    // Create subscription, wrap in try/catch if you expect errors here
    await account.createSubscription();

    // Perform initial sync and check response
    const response = await account.performInitialSync();
    if (!response || !response.deltaToken || !Array.isArray(response.emails)) {
      return NextResponse.json({ error: "FAILED_TO_SYNC" }, { status: 500 });
    }

    const { deltaToken, emails } = response;

    // Sync emails safely
    await syncEmailsToDatabase(emails, accountId);

    // Update DB with nextDeltaToken
    await db.account.update({
      where: { id: accountId },
      data: { nextDeltaToken: deltaToken },
    });

    console.log("Sync complete", deltaToken);

    return NextResponse.json({ success: true, deltaToken }, { status: 200 });
  } catch (error) {
    console.error("Error in POST /initial-sync:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
};
