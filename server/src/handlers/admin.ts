import { db } from '../db';
import { 
  usersTable, 
  facilitiesTable, 
  bookingsTable, 
  tournamentsTable, 
  walletsTable,
  walletTransactionsTable
} from '../db/schema';
import { type User, type Tournament, type Wallet } from '../schema';
import { eq, and, count, sql, sum, gte } from 'drizzle-orm';

export async function getAllUsers(role?: string, isActive?: boolean): Promise<User[]> {
  try {
    const conditions: any[] = [];

    if (role !== undefined) {
      conditions.push(eq(usersTable.role, role as any));
    }

    if (isActive !== undefined) {
      conditions.push(eq(usersTable.is_active, isActive));
    }

    const results = conditions.length > 0
      ? await db.select().from(usersTable).where(conditions.length === 1 ? conditions[0] : and(...conditions)).execute()
      : await db.select().from(usersTable).execute();

    return results.map(user => ({
      ...user,
      created_at: user.created_at,
      updated_at: user.updated_at
    }));
  } catch (error) {
    console.error('Get all users failed:', error);
    throw error;
  }
}

export async function updateUserStatus(userId: number, isActive: boolean): Promise<User> {
  try {
    const result = await db.update(usersTable)
      .set({ 
        is_active: isActive,
        updated_at: new Date()
      })
      .where(eq(usersTable.id, userId))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error('User not found');
    }

    const user = result[0];
    return {
      ...user,
      created_at: user.created_at,
      updated_at: user.updated_at
    };
  } catch (error) {
    console.error('Update user status failed:', error);
    throw error;
  }
}

export async function updateUserRole(userId: number, role: string): Promise<User> {
  try {
    const result = await db.update(usersTable)
      .set({ 
        role: role as any,
        updated_at: new Date()
      })
      .where(eq(usersTable.id, userId))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error('User not found');
    }

    const user = result[0];
    return {
      ...user,
      created_at: user.created_at,
      updated_at: user.updated_at
    };
  } catch (error) {
    console.error('Update user role failed:', error);
    throw error;
  }
}

export async function getPendingTournamentApprovals(): Promise<Tournament[]> {
  try {
    const results = await db.select()
      .from(tournamentsTable)
      .where(eq(tournamentsTable.status, 'pending_approval'))
      .execute();

    return results.map(tournament => ({
      ...tournament,
      entry_fee: parseFloat(tournament.entry_fee),
      prize_pool: tournament.prize_pool ? parseFloat(tournament.prize_pool) : null,
      registration_start: tournament.registration_start,
      registration_end: tournament.registration_end,
      tournament_start: tournament.tournament_start,
      tournament_end: tournament.tournament_end,
      created_at: tournament.created_at,
      updated_at: tournament.updated_at
    }));
  } catch (error) {
    console.error('Get pending tournament approvals failed:', error);
    throw error;
  }
}

export async function approveTournament(tournamentId: number, approved: boolean): Promise<Tournament> {
  try {
    const newStatus = approved ? 'published' : 'draft';
    
    const result = await db.update(tournamentsTable)
      .set({ 
        status: newStatus,
        updated_at: new Date()
      })
      .where(eq(tournamentsTable.id, tournamentId))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error('Tournament not found');
    }

    const tournament = result[0];
    return {
      ...tournament,
      entry_fee: parseFloat(tournament.entry_fee),
      prize_pool: tournament.prize_pool ? parseFloat(tournament.prize_pool) : null,
      registration_start: tournament.registration_start,
      registration_end: tournament.registration_end,
      tournament_start: tournament.tournament_start,
      tournament_end: tournament.tournament_end,
      created_at: tournament.created_at,
      updated_at: tournament.updated_at
    };
  } catch (error) {
    console.error('Approve tournament failed:', error);
    throw error;
  }
}

export async function getPlatformStatistics(): Promise<{
  totalUsers: number;
  totalFacilities: number;
  totalBookings: number;
  totalTournaments: number;
  totalRevenue: number;
  monthlyRevenue: number;
  activeUsers: number;
}> {
  try {
    // Get current month boundaries
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get total counts
    const [userStats] = await db.select({ 
      total: count(),
      active: sum(sql`CASE WHEN is_active THEN 1 ELSE 0 END`).mapWith(Number)
    })
    .from(usersTable)
    .execute();

    const [facilityStats] = await db.select({ total: count() })
      .from(facilitiesTable)
      .execute();

    const [bookingStats] = await db.select({ 
      total: count(),
      totalRevenue: sum(bookingsTable.total_amount)
    })
    .from(bookingsTable)
    .execute();

    const [tournamentStats] = await db.select({ total: count() })
      .from(tournamentsTable)
      .execute();

    const [monthlyRevenueStats] = await db.select({
      monthlyRevenue: sum(bookingsTable.total_amount)
    })
    .from(bookingsTable)
    .where(gte(bookingsTable.created_at, startOfMonth))
    .execute();

    return {
      totalUsers: userStats.total,
      totalFacilities: facilityStats.total,
      totalBookings: bookingStats.total,
      totalTournaments: tournamentStats.total,
      totalRevenue: bookingStats.totalRevenue ? parseFloat(bookingStats.totalRevenue.toString()) : 0,
      monthlyRevenue: monthlyRevenueStats.monthlyRevenue ? parseFloat(monthlyRevenueStats.monthlyRevenue.toString()) : 0,
      activeUsers: userStats.active || 0
    };
  } catch (error) {
    console.error('Get platform statistics failed:', error);
    throw error;
  }
}

export async function getFinancialSettlements(): Promise<{
  facilityOwnerId: number;
  ownerName: string;
  balance: number;
  settlementAmount: number;
  settlementType: 'payout' | 'collection';
}[]> {
  try {
    const results = await db.select({
      facilityOwnerId: usersTable.id,
      ownerName: usersTable.full_name,
      balance: walletsTable.balance,
      maxNegativeBalance: walletsTable.max_negative_balance
    })
    .from(usersTable)
    .innerJoin(walletsTable, eq(usersTable.id, walletsTable.user_id))
    .where(eq(usersTable.role, 'facility_owner'))
    .execute();

    return results.map(result => {
      const balance = parseFloat(result.balance);
      const maxNegativeBalance = parseFloat(result.maxNegativeBalance);
      
      let settlementAmount = 0;
      let settlementType: 'payout' | 'collection' = 'payout';

      if (balance > 0) {
        // Positive balance - needs payout
        settlementAmount = balance;
        settlementType = 'payout';
      } else if (balance < -maxNegativeBalance) {
        // Exceeded negative balance limit - needs collection
        settlementAmount = Math.abs(balance + maxNegativeBalance);
        settlementType = 'collection';
      }

      return {
        facilityOwnerId: result.facilityOwnerId,
        ownerName: result.ownerName,
        balance,
        settlementAmount,
        settlementType
      };
    });
  } catch (error) {
    console.error('Get financial settlements failed:', error);
    throw error;
  }
}

export async function setMaxNegativeBalance(userId: number, maxAmount: number): Promise<Wallet> {
  try {
    const result = await db.update(walletsTable)
      .set({ 
        max_negative_balance: maxAmount.toString(),
        updated_at: new Date()
      })
      .where(eq(walletsTable.user_id, userId))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error('Wallet not found');
    }

    const wallet = result[0];
    return {
      ...wallet,
      balance: parseFloat(wallet.balance),
      max_negative_balance: parseFloat(wallet.max_negative_balance),
      created_at: wallet.created_at,
      updated_at: wallet.updated_at
    };
  } catch (error) {
    console.error('Set max negative balance failed:', error);
    throw error;
  }
}

export async function adjustWalletBalance(
  userId: number,
  amount: number,
  description: string
): Promise<void> {
  try {
    // Get the wallet
    const [wallet] = await db.select()
      .from(walletsTable)
      .where(eq(walletsTable.user_id, userId))
      .execute();

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const currentBalance = parseFloat(wallet.balance);
    const newBalance = currentBalance + amount;

    // Update wallet balance
    await db.update(walletsTable)
      .set({ 
        balance: newBalance.toString(),
        updated_at: new Date()
      })
      .where(eq(walletsTable.user_id, userId))
      .execute();

    // Create transaction record
    await db.insert(walletTransactionsTable)
      .values({
        wallet_id: wallet.id,
        type: 'admin_adjustment',
        amount: amount.toString(),
        description,
        reference_id: `admin_adj_${Date.now()}`
      })
      .execute();
  } catch (error) {
    console.error('Adjust wallet balance failed:', error);
    throw error;
  }
}

export async function getTournamentOrganizerApplications(): Promise<User[]> {
  try {
    // In a real system, there would be an applications table or a status field
    // For now, we'll return users who have requested to be tournament organizers
    // but are still regular players - this could be managed via a separate applications system
    
    // For this implementation, we'll assume there's a way to identify pending applications
    // This might be through a separate applications table or metadata
    // For now, return empty array as there's no clear way to identify "applications"
    // in the current schema without additional metadata
    
    return [];
  } catch (error) {
    console.error('Get tournament organizer applications failed:', error);
    throw error;
  }
}