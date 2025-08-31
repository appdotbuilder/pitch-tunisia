import { db } from '../db';
import { walletsTable, walletTransactionsTable, usersTable, facilitiesTable } from '../db/schema';
import { type Wallet, type WalletTransaction } from '../schema';
import { eq, desc, sql, sum, and } from 'drizzle-orm';

export async function getWalletByUserId(userId: number): Promise<Wallet | null> {
  try {
    const wallets = await db.select()
      .from(walletsTable)
      .where(eq(walletsTable.user_id, userId))
      .execute();

    if (wallets.length === 0) {
      return null;
    }

    const wallet = wallets[0];
    return {
      ...wallet,
      balance: parseFloat(wallet.balance),
      max_negative_balance: parseFloat(wallet.max_negative_balance)
    };
  } catch (error) {
    console.error('Failed to get wallet by user ID:', error);
    throw error;
  }
}

export async function topUpWallet(
    userId: number, 
    amount: number, 
    paymentMethod: 'flouci' | 'edinar' | 'd17',
    referenceId?: string
): Promise<WalletTransaction> {
  try {
    // Get or create wallet
    let wallet = await getWalletByUserId(userId);
    
    if (!wallet) {
      // Create wallet if doesn't exist
      const newWallets = await db.insert(walletsTable)
        .values({
          user_id: userId,
          balance: '0',
          max_negative_balance: '0'
        })
        .returning()
        .execute();

      wallet = {
        ...newWallets[0],
        balance: parseFloat(newWallets[0].balance),
        max_negative_balance: parseFloat(newWallets[0].max_negative_balance)
      };
    }

    // Create transaction record
    const transactions = await db.insert(walletTransactionsTable)
      .values({
        wallet_id: wallet.id,
        type: 'topup',
        amount: amount.toString(),
        description: `Wallet top-up via ${paymentMethod}`,
        reference_id: referenceId || null,
        payment_method: paymentMethod
      })
      .returning()
      .execute();

    // Update wallet balance
    await db.update(walletsTable)
      .set({
        balance: sql`${walletsTable.balance} + ${amount.toString()}`,
        updated_at: new Date()
      })
      .where(eq(walletsTable.id, wallet.id))
      .execute();

    const transaction = transactions[0];
    return {
      ...transaction,
      amount: parseFloat(transaction.amount)
    };
  } catch (error) {
    console.error('Wallet top-up failed:', error);
    throw error;
  }
}

export async function debitWallet(
    userId: number, 
    amount: number, 
    type: 'booking_payment' | 'tournament_fee',
    description?: string,
    referenceId?: string
): Promise<WalletTransaction> {
  try {
    // Get wallet first
    const wallet = await getWalletByUserId(userId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Check if user has sufficient balance
    const canDebit = await checkWalletBalance(userId, amount);
    if (!canDebit) {
      throw new Error('Insufficient wallet balance');
    }

    // Create transaction record (negative amount for debit)
    const transactions = await db.insert(walletTransactionsTable)
      .values({
        wallet_id: wallet.id,
        type,
        amount: (-amount).toString(),
        description: description || `Payment via wallet for ${type}`,
        reference_id: referenceId || null,
        payment_method: null
      })
      .returning()
      .execute();

    // Update wallet balance
    await db.update(walletsTable)
      .set({
        balance: sql`${walletsTable.balance} - ${amount.toString()}`,
        updated_at: new Date()
      })
      .where(eq(walletsTable.id, wallet.id))
      .execute();

    const transaction = transactions[0];
    return {
      ...transaction,
      amount: parseFloat(transaction.amount)
    };
  } catch (error) {
    console.error('Wallet debit failed:', error);
    throw error;
  }
}

export async function creditWallet(
    userId: number, 
    amount: number, 
    type: 'facility_payout' | 'admin_adjustment',
    description?: string,
    referenceId?: string
): Promise<WalletTransaction> {
  try {
    // Get or create wallet
    let wallet = await getWalletByUserId(userId);
    
    if (!wallet) {
      // Create wallet if doesn't exist
      const newWallets = await db.insert(walletsTable)
        .values({
          user_id: userId,
          balance: '0',
          max_negative_balance: '0'
        })
        .returning()
        .execute();

      wallet = {
        ...newWallets[0],
        balance: parseFloat(newWallets[0].balance),
        max_negative_balance: parseFloat(newWallets[0].max_negative_balance)
      };
    }

    // Create transaction record
    const transactions = await db.insert(walletTransactionsTable)
      .values({
        wallet_id: wallet.id,
        type,
        amount: amount.toString(),
        description: description || `Credit to wallet for ${type}`,
        reference_id: referenceId || null,
        payment_method: null
      })
      .returning()
      .execute();

    // Update wallet balance
    await db.update(walletsTable)
      .set({
        balance: sql`${walletsTable.balance} + ${amount.toString()}`,
        updated_at: new Date()
      })
      .where(eq(walletsTable.id, wallet.id))
      .execute();

    const transaction = transactions[0];
    return {
      ...transaction,
      amount: parseFloat(transaction.amount)
    };
  } catch (error) {
    console.error('Wallet credit failed:', error);
    throw error;
  }
}

export async function getWalletTransactions(userId: number, limit: number = 50): Promise<WalletTransaction[]> {
  try {
    const wallet = await getWalletByUserId(userId);
    if (!wallet) {
      return [];
    }

    const transactions = await db.select()
      .from(walletTransactionsTable)
      .where(eq(walletTransactionsTable.wallet_id, wallet.id))
      .orderBy(desc(walletTransactionsTable.created_at))
      .limit(limit)
      .execute();

    return transactions.map(transaction => ({
      ...transaction,
      amount: parseFloat(transaction.amount)
    }));
  } catch (error) {
    console.error('Failed to get wallet transactions:', error);
    throw error;
  }
}

export async function checkWalletBalance(userId: number, requiredAmount: number): Promise<boolean> {
  try {
    const wallet = await getWalletByUserId(userId);
    if (!wallet) {
      return false;
    }

    // Check if current balance + max negative balance >= required amount
    const availableBalance = wallet.balance + wallet.max_negative_balance;
    return availableBalance >= requiredAmount;
  } catch (error) {
    console.error('Failed to check wallet balance:', error);
    throw error;
  }
}

export async function getFacilityWalletSummary(): Promise<{
  userId: number;
  balance: number;
  owedAmount: number;
}[]> {
  try {
    // Get facility owners and their wallets with booking amounts
    const results = await db.select({
      userId: usersTable.id,
      balance: walletsTable.balance,
      totalBookingRevenue: sql<string>`COALESCE(SUM(CASE WHEN ${walletTransactionsTable.type} = 'booking_payment' THEN ${walletTransactionsTable.amount} ELSE 0 END), 0)`
    })
      .from(usersTable)
      .leftJoin(facilitiesTable, eq(facilitiesTable.owner_id, usersTable.id))
      .leftJoin(walletsTable, eq(walletsTable.user_id, usersTable.id))
      .leftJoin(walletTransactionsTable, eq(walletTransactionsTable.wallet_id, walletsTable.id))
      .where(eq(usersTable.role, 'facility_owner'))
      .groupBy(usersTable.id, walletsTable.balance)
      .execute();

    return results.map(result => ({
      userId: result.userId,
      balance: result.balance ? parseFloat(result.balance) : 0,
      owedAmount: parseFloat(result.totalBookingRevenue) * -0.85 // 85% payout to facility owners
    }));
  } catch (error) {
    console.error('Failed to get facility wallet summary:', error);
    throw error;
  }
}